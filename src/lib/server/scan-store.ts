// src/lib/server/scan-store.ts
// Shared scan post-processing: builds indices from scanned projects and updates the store
import { store } from '$lib/store.js';
import { buildSearchIndex } from './search-index.js';
import type { Project, InddLinkEntry, InddEntry } from '../types.js';

type ScannedProject = Project & { _inddLinks: Record<string, string[]>; _filePaths: string[] };

export function populateStore(projects: ScannedProject[], scanStart: number): void {
  if (projects.length === 0) {
    console.log('[scan] Keine Projekte – Store unverändert');
    store.lastScan = new Date();
    store.scanDuration = Date.now() - scanStart;
    return;
  }

  const linksMap: Record<string, InddLinkEntry[]> = {};
  const inddMap: Record<string, InddEntry> = {};

  for (const proj of projects) {
    for (const [inddName, links] of Object.entries(proj._inddLinks ?? {})) {
      // Key includes project to avoid collisions when multiple projects have same INDD filename
      const inddKey = `${proj.meta.projekt_nr}/${inddName}`;
      inddMap[inddKey] = { proj: proj.meta.projekt_nr, name: proj.meta.name, folder: proj.folder, links };
      for (const img of links) {
        const key = img.toLowerCase();
        linksMap[key] ??= [];
        if (!linksMap[key].some(e => e.indd === inddName && e.proj === proj.meta.projekt_nr)) {
          linksMap[key].push({ indd: inddName, proj: proj.meta.projekt_nr, name: proj.meta.name, folder: proj.folder });
        }
      }
    }
  }

  // Restore textContent from previous textMap for unchanged projects (incremental scan)
  // so the search index includes their full-text
  const oldTextMap = store.textMap;
  for (const proj of projects) {
    for (let i = 0; i < proj.files.length; i++) {
      if (!proj.files[i].textContent) {
        const fp = proj._filePaths[i] ?? `${proj.folder}/${proj.files[i].name}`;
        const existing = oldTextMap.get(fp);
        if (existing) proj.files[i].textContent = existing;
      }
    }
  }

  const searchIndex = buildSearchIndex(projects);

  const thumbMap = new Map<string, string>();
  const textMap = new Map<string, string>();
  for (const proj of projects) {
    const filePaths = proj._filePaths;
    for (let i = 0; i < proj.files.length; i++) {
      const file = proj.files[i];
      const fp = filePaths[i] ?? `${proj.folder}/${file.name}`;
      const tid = file.thumbId;
      if (tid) thumbMap.set(tid, fp);
      if (file.textContent) {
        textMap.set(fp, file.textContent);
      } else {
        const existing = oldTextMap.get(fp);
        if (existing) textMap.set(fp, existing);
      }
      file.textContent = undefined;
    }
  }

  store.projects = projects;
  store.linksMap = linksMap;
  store.inddMap = inddMap;
  store.searchIndex = searchIndex;
  store.thumbMap = thumbMap;
  store.textMap = textMap;
  store.lastScan = new Date();
  store.scanDuration = Date.now() - scanStart;
}
