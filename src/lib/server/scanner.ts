// src/lib/server/scanner.ts
import { readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join, extname, basename } from 'path';
import { createHash } from 'crypto';
import type { Project, ProjectFile } from '../types';
import { config } from './config';
import { extractInddLinks } from './indd-links';
import { extractPdfText, extractInddText } from './pdf-text';

// mtime cache for incremental scans (in-memory, cleared on full scan / restart)
const folderMtimes = new Map<string, number>();

const PROJECT_PATTERN = /^P\d{5,}/; // used only for parseFolderName, not for filtering
const SKIP_FOLDERS = new Set(['_thumbs', '__MACOSX']);
const SKIP_PREFIXES = ['.'];
const DESIGN_EXTENSIONS = new Set(['.pdf', '.indd', '.ai', '.eps', '.psd', '.jpg', '.jpeg', '.png', '.tif', '.tiff']);

export function parseFolderName(folderName: string) {
  const match = folderName.match(/^(P(\d{2})\d+)_([^_-]+)[_-](.+)$/);
  if (match) {
    return {
      projekt_nr: match[1],
      jahr: '20' + match[2],
      client: match[3],
      name: match[4].replace(/-/g, ' '),
      name_raw: match[4],
    };
  }
  return { projekt_nr: '', jahr: '', client: '', name: folderName, name_raw: folderName };
}

export function parseDateFromFilename(stem: string): string {
  const m = stem.match(/_(\d{2})-(\d{2})(?:_|$)/);
  if (m) return `${m[2]}/20${m[1]}`;
  return '';
}

export function thumbId(filePath: string): string {
  return createHash('sha256').update(filePath).digest('hex').slice(0, 16);
}

function buildSearchTags(...parts: string[]): string {
  return parts.filter(Boolean).join(' ').replace(/[-_]/g, ' ').toLowerCase();
}

function shouldSkip(name: string): boolean {
  return SKIP_FOLDERS.has(name) || SKIP_PREFIXES.some(p => name.startsWith(p));
}

async function findDesignFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  try {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!shouldSkip(entry.name)) {
          results.push(...await findDesignFiles(fullPath));
        }
      } else if (DESIGN_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        results.push(fullPath);
      }
    }
  } catch { /* Lesefehler ignorieren */ }
  return results.sort();
}

// Tracks folders that were visited during incremental scan but had no design files
// (used by runIncrementalScan to drop stale projects whose files were all removed)
const visitedEmptyFolders = new Set<string>();

export async function scanClient(clientFolder: string, clientPath: string, isArchiv = false, changedOnly = false): Promise<Project[]> {
  const projects: Project[] = [];
  let skipped = 0;
  let scanned = 0;

  const scanDir = async (dir: string, archiv: boolean) => {
    let entries: string[] = [];
    try { entries = await readdir(dir); } catch { return; }

    for (const entry of entries.sort()) {
      const fullPath = join(dir, entry);
      try {
        if (!(await stat(fullPath)).isDirectory()) continue;
      } catch { continue; }

      if (shouldSkip(entry)) continue;

      // Archiv-Unterordner durchsuchen
      if (entry === '_Archiv') {
        try {
          for (const yearDir of (await readdir(fullPath)).sort()) {
            const yearPath = join(fullPath, yearDir);
            if ((await stat(yearPath)).isDirectory()) await scanDir(yearPath, true);
          }
        } catch { /* ignorieren */ }
        continue;
      }

      // mtime-based change detection for incremental scans
      if (changedOnly) {
        try {
          const mtime = (await stat(fullPath)).mtimeMs;
          const cached = folderMtimes.get(fullPath);
          if (cached !== undefined && cached === mtime) {
            skipped++;
            continue; // Skip unchanged folder
          }
        } catch { /* If stat fails, re-scan to be safe */ }
      }

      const meta = parseFolderName(entry);
      const filePaths = await findDesignFiles(fullPath);

      if (filePaths.length === 0) {
        if (changedOnly) {
          try { folderMtimes.set(fullPath, (await stat(fullPath)).mtimeMs); } catch { /* ignore */ }
          visitedEmptyFolders.add(fullPath);
        }
        continue;
      }

      const inddPaths = filePaths.filter(p => extname(p).toLowerCase() === '.indd');
      const { linksPerIndd, missingLinks } = await extractInddLinksForProject(inddPaths, fullPath);

      const files: ProjectFile[] = await Promise.all(filePaths.map(async (fp) => {
        const ext = extname(fp).toLowerCase();
        const stem = basename(fp, ext);
        let textContent: string | undefined;
        if (ext === '.pdf') textContent = (await extractPdfText(fp)) || undefined;
        else if (ext === '.indd') textContent = (await extractInddText(fp)) || undefined;
        return {
          name: basename(fp),
          ext,
          filePath: fp,
          thumbId: ['.indd', '.eps'].includes(ext) ? null : thumbId(fp),
          datum: parseDateFromFilename(stem),
          search: buildSearchTags(meta.projekt_nr, meta.name_raw, meta.client, stem, ext.slice(1), entry),
          textContent,
        };
      }));

      projects.push({
        id: meta.projekt_nr || entry,
        folder: fullPath,
        meta,
        files,
        isArchiv: archiv,
        missingLinks,
        _inddLinks: linksPerIndd,
        _filePaths: filePaths,
      } as Project & { _inddLinks: Record<string, string[]>; _filePaths: string[] });

      // Update mtime cache after scanning
      if (changedOnly) {
        try { folderMtimes.set(fullPath, (await stat(fullPath)).mtimeMs); } catch { /* ignore */ }
      }
      scanned++;
    }
  };

  await scanDir(clientPath, isArchiv);
  if (changedOnly) {
    console.log(`[scan] ${clientFolder}: ${scanned} neu gescannt, ${skipped} unverändert übersprungen`);
  }
  return projects;
}

async function extractInddLinksForProject(inddPaths: string[], projectFolder: string) {
  const linksPerIndd: Record<string, string[]> = {};
  let missingLinks = false;

  for (const inddPath of inddPaths) {
    const links = await extractInddLinks(inddPath);
    linksPerIndd[basename(inddPath)] = links;
    if (missingLinks) continue; // Already flagged, just collect links
    // Fehlende Links: prüfen ob Datei im Projektordner oder Material-Ordner liegt
    for (const link of links) {
      const candidates = [
        join(projectFolder, link),
        join(projectFolder, 'Material', link),
      ];
      if (!candidates.some(existsSync)) {
        missingLinks = true;
        break;
      }
    }
  }

  return { linksPerIndd, missingLinks };
}

export async function runFullScan(): Promise<Project[]> {
  folderMtimes.clear();
  visitedEmptyFolders.clear();
  const allProjects: Project[] = [];
  for (const client of config.clients) {
    const clientPath = join(config.volume, client.folder);
    if (!existsSync(clientPath)) continue;
    const projects = await scanClient(client.folder, clientPath);
    allProjects.push(...projects);
  }
  return allProjects;
}

export async function runIncrementalScan(existingProjects: Project[]): Promise<Project[]> {
  const existingByFolder = new Map(existingProjects.map(p => [p.folder, p]));
  const scannedFolders = new Set<string>();
  const newProjects: Project[] = [];
  visitedEmptyFolders.clear();

  for (const client of config.clients) {
    const clientPath = join(config.volume, client.folder);
    if (!existsSync(clientPath)) continue;
    const projects = await scanClient(client.folder, clientPath, false, true);
    for (const p of projects) {
      scannedFolders.add(p.folder);
    }
    newProjects.push(...projects);
  }

  // Merge: keep unchanged projects from existing, replace changed ones, drop deleted
  const result: Project[] = [];
  let dropped = 0;
  for (const existing of existingProjects) {
    if (scannedFolders.has(existing.folder)) {
      // This folder was re-scanned, use new version
      const updated = newProjects.find(p => p.folder === existing.folder);
      if (updated) result.push(updated);
    } else if (visitedEmptyFolders.has(existing.folder)) {
      // Folder was re-scanned but has no design files anymore — drop
      folderMtimes.delete(existing.folder);
      dropped++;
    } else if (existsSync(existing.folder)) {
      // Folder unchanged (mtime matched) and still exists on disk
      result.push(existing);
    } else {
      // Folder was deleted from disk — drop from store
      folderMtimes.delete(existing.folder);
      dropped++;
    }
  }
  // Add any new projects not previously in the store
  for (const p of newProjects) {
    if (!existingByFolder.has(p.folder)) {
      result.push(p);
    }
  }

  const changed = newProjects.length;
  const kept = result.length - changed;
  console.log(`[scan] Inkrementell: ${changed} neu gescannt, ${kept} unverändert, ${dropped} gelöscht`);

  return result;
}
