'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import type { Project, ProjectFile } from '@/lib/types';
import { Copy, Check, FolderOpen, FolderInput } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────
type SortMode = 'newest' | 'oldest' | 'alpha';
type YearFilter = string | 'all';
type GroupMode = 'project' | 'type' | 'flat';
type ThumbSize = 'sm' | 'md' | 'lg' | 'xl';
type ViewMode = 'grid' | 'list' | 'gallery';

interface DateienTabProps {
  projects: Project[];
  query: string;
  canOpenFiles?: boolean;
}

// ── Konfiguration ────────────────────────────────────────────
const DESIGN_LABELS: Record<string, string> = {
  '.pdf': 'PDF', '.indd': 'INDD', '.ai': 'AI', '.eps': 'EPS', '.psd': 'PSD',
  '.jpg': 'JPG', '.jpeg': 'JPG', '.png': 'PNG', '.tif': 'TIF', '.tiff': 'TIF',
};

const DESIGN_COLORS: Record<string, string> = {
  '.pdf': '#c0392b', '.indd': '#2c3e8c', '.ai': '#e8821a', '.eps': '#27ae60', '.psd': '#1a6bb5',
  '.jpg': '#7c3aed', '.jpeg': '#7c3aed', '.png': '#0891b2', '.tif': '#0f766e', '.tiff': '#0f766e',
};

const EMOJIS: Record<string, string> = {
  '.pdf': '📄', '.indd': '📐', '.ai': '✏️', '.eps': '📋', '.psd': '🖼️',
  '.jpg': '🖼️', '.jpeg': '🖼️', '.png': '🖼️', '.tif': '🖼️', '.tiff': '🖼️',
};

const NORM_EXT: Record<string, string> = { '.jpeg': '.jpg', '.tiff': '.tif' };

const GRID_COLS: Record<ThumbSize, string> = {
  sm: 'repeat(auto-fill, minmax(120px, 160px))',
  md: 'repeat(auto-fill, minmax(180px, 220px))',
  lg: 'repeat(auto-fill, minmax(240px, 300px))',
  xl: 'repeat(auto-fill, minmax(320px, 400px))',
};

const GALLERY_COLS: Record<ThumbSize, string> = {
  sm: 'repeat(auto-fill, minmax(80px, 1fr))',
  md: 'repeat(auto-fill, minmax(130px, 1fr))',
  lg: 'repeat(auto-fill, minmax(200px, 1fr))',
  xl: 'repeat(auto-fill, minmax(280px, 1fr))',
};

const LIST_THUMB: Record<ThumbSize, { img: string; icon: string; text: string }> = {
  sm: { img: 'w-8 h-8', icon: 'w-8 h-8 text-sm', text: 'text-sm' },
  md: { img: 'w-12 h-12', icon: 'w-12 h-12 text-lg', text: 'text-lg' },
  lg: { img: 'w-20 h-20', icon: 'w-20 h-20 text-2xl', text: 'text-2xl' },
  xl: { img: 'w-28 h-28', icon: 'w-28 h-28 text-3xl', text: 'text-3xl' },
};

const GROUPS_PER_BATCH = 20;
const RECENTLY_VIEWED_KEY = 'fo_recently_viewed_v2';
const SETTINGS_KEY = 'fo_view_settings';
const SCAN_BASELINE_KEY = 'fo_scan_baseline';

const sortOptions: [SortMode, string][] = [['newest','Neueste zuerst'],['oldest','Älteste zuerst'],['alpha','A \u2013 Z']];
const groupOptions: [GroupMode, string][] = [['project','Nach Projekt'],['type','Nach Dateityp'],['flat','Keine Gruppierung']];

// ── Versionserkennung ────────────────────────────────────────
function normalizeForVersioning(nameWithoutExt: string): string {
  return nameWithoutExt
    .replace(/[-_ ](v|V)\d+\b/g, '')
    .replace(/[-_ ](final|FINAL|Final)\b/g, '')
    .replace(/[-_ ](korr(ektur)?|KORR)\d*\b/gi, '')
    .replace(/[-_ ](RZ|rz)\d*\b/g, '')
    .replace(/[-_ ](entwurf)\d*\b/gi, '')
    .toLowerCase()
    .trim();
}

function getVersionRank(nameWithoutExt: string): number {
  if (/[-_ ](final|rz)\b/i.test(nameWithoutExt)) return 100_000;
  const vm = nameWithoutExt.match(/[-_ ]v(\d+)\b/i);
  if (vm) return parseInt(vm[1]);
  const km = nameWithoutExt.match(/[-_ ]korr(?:ektur)?(\d+)\b/i);
  if (km) return 500 + parseInt(km[1]);
  if (/[-_ ]korr\b/i.test(nameWithoutExt)) return 500;
  return 0;
}

function getVersionLabel(nameWithoutExt: string): string | null {
  if (/[-_ ]final\b/i.test(nameWithoutExt)) return 'FINAL';
  if (/[-_ ]rz\b/i.test(nameWithoutExt)) return 'RZ';
  const vm = nameWithoutExt.match(/[-_ ]v(\d+)\b/i);
  if (vm) return `v${vm[1]}`;
  const km = nameWithoutExt.match(/[-_ ]korr(?:ektur)?(\d+)\b/i);
  if (km) return `K${km[1]}`;
  if (/[-_ ]korr\b/i.test(nameWithoutExt)) return 'Korr';
  if (/[-_ ]entwurf\b/i.test(nameWithoutExt)) return 'Entw.';
  return null;
}

function versionBadgeStyle(label: string): string {
  if (label === 'FINAL' || label === 'RZ') return '#16a34a';
  if (/^v\d/.test(label)) return '#2563eb';
  return '#ea580c';
}

interface VersionGroup {
  key: string;
  latest: ProjectFile;
  older: ProjectFile[];
}

function groupByVersion(files: ProjectFile[]): VersionGroup[] {
  const buckets = new Map<string, ProjectFile[]>();
  for (const f of files) {
    const base = f.name.slice(0, f.name.length - f.ext.length);
    const norm = normalizeForVersioning(base);
    const key = `${norm}\x00${f.ext}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(f);
  }
  const groups: VersionGroup[] = [];
  for (const [key, fs] of buckets) {
    if (fs.length <= 1) {
      groups.push({ key, latest: fs[0], older: [] });
    } else {
      const sorted = [...fs].sort((a, b) => {
        const ra = getVersionRank(a.name.slice(0, a.name.length - a.ext.length));
        const rb = getVersionRank(b.name.slice(0, b.name.length - b.ext.length));
        return rb - ra;
      });
      groups.push({ key, latest: sorted[0], older: sorted.slice(1) });
    }
  }
  return groups;
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

// ── Types for recent files ──
interface RecentFile {
  filePath: string;
  fileName: string;
  projectName: string;
  projektNr: string;
  folder: string;
  thumbId: string | null;
  ext: string;
}

interface NewFilesInfo {
  count: number;
  projectCount: number;
  paths: Set<string>;
}

// ── Types for outer groups ──
interface FlatItem { file: ProjectFile; project: Project; }

interface OuterGroup {
  key: string;
  label: string;
  color: string | null;
  isArchiv: boolean;
  missingLinks: boolean;
  folder: string | null;
  projData: (Project & { vGroups: VersionGroup[] }) | null;
  flatItems: FlatItem[];
  count: number;
  shownCount: number;
}

export default function DateienTab({ projects, query, canOpenFiles = true }: DateienTabProps) {
  // ── State ──
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set());
  const [activeYear, setActiveYear] = useState<YearFilter>('all');
  const [activeClient, setActiveClient] = useState('all');
  const [showArchiv, setShowArchiv] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [groupMode, setGroupMode] = useState<GroupMode>('project');
  const [thumbSize, setThumbSize] = useState<ThumbSize>('md');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [showOnlyLatest, setShowOnlyLatest] = useState(true);
  const [expandedVersions, setExpandedVersions] = useState<Set<string>>(new Set());
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [groupDropdownOpen, setGroupDropdownOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(GROUPS_PER_BATCH);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [newFilesInfo, setNewFilesInfo] = useState<NewFilesInfo | null>(null);
  const [showOnlyNew, setShowOnlyNew] = useState(false);

  const loadMoreRef = useRef<HTMLDivElement>(null);

  // ── Load settings from localStorage ──
  useEffect(() => {
    try {
      const settingsRaw = localStorage.getItem(SETTINGS_KEY);
      if (settingsRaw) {
        const s = JSON.parse(settingsRaw);
        if (['grid', 'list', 'gallery'].includes(s.viewMode)) setViewMode(s.viewMode);
        if (['project', 'type', 'flat'].includes(s.groupMode)) setGroupMode(s.groupMode);
        if (['sm', 'md', 'lg', 'xl'].includes(s.thumbSize)) setThumbSize(s.thumbSize);
        if (['newest', 'oldest', 'alpha'].includes(s.sortMode)) setSortMode(s.sortMode);
      }
    } catch { /* ignore */ }
    setSettingsLoaded(true);

    // Load recent files
    try {
      setRecentFiles(JSON.parse(localStorage.getItem(RECENTLY_VIEWED_KEY) ?? '[]'));
    } catch { /* ignore */ }

    // Was ist neu?
    const baselineRaw = localStorage.getItem(SCAN_BASELINE_KEY);
    if (baselineRaw) {
      try {
        const baseline = new Set<string>(JSON.parse(baselineRaw));
        const newPaths = new Set<string>();
        const affectedProjects = new Set<string>();
        for (const p of projects) {
          for (const f of p.files) {
            if (f.filePath && !baseline.has(f.filePath)) {
              newPaths.add(f.filePath);
              affectedProjects.add(p.meta.projekt_nr || p.folder);
            }
          }
        }
        if (newPaths.size > 0) {
          setNewFilesInfo({ count: newPaths.size, projectCount: affectedProjects.size, paths: newPaths });
        }
      } catch { /* ignore */ }
      localStorage.removeItem(SCAN_BASELINE_KEY);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Persist settings ──
  useEffect(() => {
    if (!settingsLoaded) return;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ viewMode, groupMode, thumbSize, sortMode }));
    } catch { /* ignore */ }
  }, [viewMode, groupMode, thumbSize, sortMode, settingsLoaded]);

  // ── Derived filter data ──
  const allTypes = useMemo(() => [...new Set(
    projects.flatMap(p => p.files.map(f => NORM_EXT[f.ext] ?? f.ext))
            .filter(e => e !== '.indd')
  )].sort(), [projects]);

  const allYears = useMemo(() => [...new Set(projects.map(p => p.meta.jahr).filter(Boolean))].sort().reverse(), [projects]);
  const allClients = useMemo(() => [...new Set(projects.map(p => p.meta.client).filter(Boolean))].sort(), [projects]);

  // ── Filtered projects ──
  const filtered = useMemo(() =>
    projects
      .filter(p => showArchiv || !p.isArchiv)
      .filter(p => activeClient === 'all' || p.meta.client === activeClient)
      .filter(p => activeYear === 'all' || p.meta.jahr === activeYear)
      .flatMap(p => {
        const files = p.files.filter(f => {
          if (f.ext === '.indd') return false;
          if (showOnlyNew && newFilesInfo && !newFilesInfo.paths.has(f.filePath)) return false;
          const normExt = NORM_EXT[f.ext] ?? f.ext;
          if (activeTypes.size > 0 && !activeTypes.has(normExt)) return false;
          if (!query) return true;
          return f.search.includes(query.toLowerCase());
        });
        return files.length ? [{ ...p, files }] : [];
      })
      .sort((a, b) => {
        if (sortMode === 'alpha') return a.meta.name.localeCompare(b.meta.name);
        const na = parseInt(a.meta.projekt_nr.replace(/\D/g, '') || '0');
        const nb = parseInt(b.meta.projekt_nr.replace(/\D/g, '') || '0');
        return sortMode === 'newest' ? nb - na : na - nb;
      }),
    [projects, showArchiv, activeClient, activeYear, activeTypes, query, sortMode, showOnlyNew, newFilesInfo]
  );

  // ── Filtered with version groups ──
  const filteredGrouped = useMemo(() =>
    filtered.map(proj => {
      const doGroup = showOnlyLatest && !query;
      return {
        ...proj,
        vGroups: doGroup
          ? groupByVersion(proj.files)
          : proj.files.map(f => ({ key: f.filePath, latest: f, older: [] as ProjectFile[] }))
      };
    }),
    [filtered, showOnlyLatest, query]
  );

  // ── Outer groups ──
  const outerGroups: OuterGroup[] = useMemo(() => {
    if (groupMode === 'project') {
      return filteredGrouped.map(p => ({
        key: p.id || p.folder,
        label: `${p.meta.projekt_nr}${p.meta.projekt_nr ? ' — ' : ''}${p.meta.name}`,
        color: null,
        isArchiv: p.isArchiv,
        missingLinks: p.missingLinks,
        folder: p.folder,
        projData: p,
        flatItems: [],
        count: p.files.length,
        shownCount: p.vGroups.length,
      }));
    }
    const flat: FlatItem[] = filtered.flatMap(p => p.files.map(f => ({ file: f, project: p })));
    if (groupMode === 'type') {
      const byType = new Map<string, FlatItem[]>();
      for (const item of flat) {
        const ext = NORM_EXT[item.file.ext] ?? item.file.ext;
        if (!byType.has(ext)) byType.set(ext, []);
        byType.get(ext)!.push(item);
      }
      return [...byType.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([ext, items]) => ({
          key: ext,
          label: DESIGN_LABELS[ext] ?? ext.toUpperCase(),
          color: DESIGN_COLORS[ext] ?? null,
          isArchiv: false,
          missingLinks: false,
          folder: null,
          projData: null,
          flatItems: items,
          count: items.length,
          shownCount: items.length,
        }));
    }
    // flat
    return flat.length ? [{
      key: '_all',
      label: 'Alle Dateien',
      color: null,
      isArchiv: false,
      missingLinks: false,
      folder: null,
      projData: null,
      flatItems: flat,
      count: flat.length,
      shownCount: flat.length,
    }] : [];
  }, [filteredGrouped, filtered, groupMode]);

  const totalFileCount = useMemo(() => outerGroups.reduce((a, g) => a + g.count, 0), [outerGroups]);

  // Reset visible count when outer groups change
  useEffect(() => {
    setVisibleCount(GROUPS_PER_BATCH);
  }, [outerGroups]);

  const visibleGroups = useMemo(() => outerGroups.slice(0, visibleCount), [outerGroups, visibleCount]);

  // ── Infinite scroll ──
  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount(prev => Math.min(prev + GROUPS_PER_BATCH, outerGroups.length));
        }
      },
      { rootMargin: '400px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [outerGroups.length]);

  const sortLabel = sortOptions.find(o => o[0] === sortMode)?.[1] ?? 'Sortierung';
  const groupLabel = groupOptions.find(o => o[0] === groupMode)?.[1] ?? 'Gruppierung';

  // ── Actions ──
  const toggleType = useCallback((ext: string) => {
    setActiveTypes(prev => {
      const next = new Set(prev);
      if (next.has(ext)) next.delete(ext); else next.add(ext);
      return next;
    });
  }, []);

  const toggleCollapse = useCallback((key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => setCollapsed(new Set(outerGroups.map(g => g.key))), [outerGroups]);
  const expandAll = useCallback(() => setCollapsed(new Set()), []);

  const toggleVersionGroup = useCallback((key: string) => {
    setExpandedVersions(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const copyPath = useCallback(async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
      setCopiedPath(path);
      setTimeout(() => setCopiedPath(null), 1500);
    } catch { /* ignore */ }
  }, []);

  function loadRecent(): RecentFile[] {
    try { return JSON.parse(localStorage.getItem(RECENTLY_VIEWED_KEY) ?? '[]'); } catch { return []; }
  }

  const trackOpen = useCallback((entry: RecentFile) => {
    try {
      const recent = loadRecent().filter(r => r.filePath !== entry.filePath);
      const updated = [entry, ...recent].slice(0, 6);
      localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(updated));
      setRecentFiles(updated);
    } catch { /* ignore */ }
  }, []);

  const openFile = useCallback(async (file: { filePath: string; name: string; thumbId: string | null; ext: string }, proj: { folder: string; meta: { name: string; projekt_nr: string } }) => {
    if (!canOpenFiles) {
      await copyPath(file.filePath);
      return;
    }
    trackOpen({
      filePath: file.filePath,
      fileName: file.name,
      projectName: proj.meta.name,
      projektNr: proj.meta.projekt_nr,
      folder: proj.folder,
      thumbId: file.thumbId,
      ext: file.ext,
    });
    await fetch('/api/open-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: file.filePath }),
    });
  }, [canOpenFiles, copyPath, trackOpen]);

  const openFolder = useCallback(async (folder: string) => {
    if (!canOpenFiles) {
      await copyPath(folder);
      return;
    }
    await fetch('/api/open-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder }),
    });
  }, [canOpenFiles, copyPath]);

  const openRecentFile = useCallback(async (r: RecentFile) => {
    if (!canOpenFiles) {
      await copyPath(r.filePath);
      return;
    }
    trackOpen(r);
    await fetch('/api/open-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: r.filePath }),
    });
  }, [canOpenFiles, copyPath, trackOpen]);

  // ── Render helpers ──
  function CardFooter({ color, name, datum, filePath, folder }: { color: string; name: string; datum?: string; filePath: string; folder: string }) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-t border-foreground/5 bg-muted/30 mt-auto">
        <div className="w-1.5 h-1.5 rounded-full shrink-0 opacity-70" style={{ background: color }} />
        <span className="text-[10px] text-muted-foreground/70 truncate flex-1">{name}</span>
        {datum && <span className="text-[10px] text-muted-foreground/40 shrink-0">{datum}</span>}
        <button
          className="p-1 rounded text-muted-foreground/40 hover:text-foreground hover:bg-foreground/8 border-0 cursor-pointer transition-colors shrink-0"
          onClick={(e) => { e.stopPropagation(); copyPath(filePath); }}
          title="Dateipfad kopieren">
          {copiedPath === filePath ? <Check className="size-3.5 text-green-600" /> : <Copy className="size-3.5" />}
        </button>
        <button
          className="p-1 rounded text-muted-foreground/40 hover:text-foreground hover:bg-foreground/8 border-0 cursor-pointer transition-colors shrink-0"
          onClick={(e) => { e.stopPropagation(); openFolder(folder); }}
          title="Ordner öffnen">
          <FolderInput className="size-3.5" />
        </button>
      </div>
    );
  }

  function GalleryActions({ filePath, folder }: { filePath: string; folder: string }) {
    return (
      <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover/thumb:opacity-100 transition-opacity">
        <button
          className="text-white/80 hover:text-white bg-black/50 hover:bg-black/70 backdrop-blur-sm w-6 h-6 rounded-md flex items-center justify-center border-0 cursor-pointer transition-colors"
          onClick={(e) => { e.stopPropagation(); copyPath(filePath); }}
          title="Dateipfad kopieren">
          {copiedPath === filePath ? <Check className="size-3.5 text-green-400" /> : <Copy className="size-3.5" />}
        </button>
        <button
          className="text-white/80 hover:text-white bg-black/50 hover:bg-black/70 backdrop-blur-sm w-6 h-6 rounded-md flex items-center justify-center border-0 cursor-pointer transition-colors"
          onClick={(e) => { e.stopPropagation(); openFolder(folder); }}
          title="Ordner öffnen">
          <FolderInput className="size-3.5" />
        </button>
      </div>
    );
  }

  function RowActions({ filePath, folder }: { filePath: string; folder: string }) {
    return (
      <div className="opacity-0 group-hover/row:opacity-100 transition-opacity flex items-center gap-0.5 px-2 shrink-0">
        <button
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/8 border-0 cursor-pointer transition-colors"
          onClick={() => copyPath(filePath)}
          title="Dateipfad kopieren">
          {copiedPath === filePath ? <Check className="size-4 text-green-600" /> : <Copy className="size-4" />}
        </button>
        <button
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/8 border-0 cursor-pointer transition-colors"
          onClick={() => openFolder(folder)}
          title="Ordner öffnen">
          <FolderInput className="size-4" />
        </button>
      </div>
    );
  }

  // ── Grid/Gallery/List card for project mode ──
  function renderProjectGroup(proj: Project & { vGroups: VersionGroup[] }) {
    if (viewMode === 'grid') {
      return (
        <div className="grid gap-3" style={{ gridTemplateColumns: GRID_COLS[thumbSize] }}>
          {proj.vGroups.map(vg => {
            const vgKey = vg.key + '§' + proj.folder;
            const isExpanded = expandedVersions.has(vgKey);
            const files = isExpanded ? [vg.latest, ...vg.older] : [vg.latest];
            return [
              ...files.map((file, fi) => {
                const label = DESIGN_LABELS[file.ext] ?? file.ext.toUpperCase();
                const color = DESIGN_COLORS[file.ext] ?? '#888';
                const base = file.name.slice(0, file.name.length - file.ext.length);
                const vLabel = getVersionLabel(base);
                const isOlder = fi > 0;
                return (
                  <div key={file.filePath} className={`group/card flex flex-col rounded-xl overflow-hidden ring-1 ring-foreground/10 hover:ring-foreground/20 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-150 bg-card ${isOlder ? 'opacity-55' : ''}`}>
                    <button className="flex flex-col text-left border-0 p-0 cursor-pointer bg-transparent flex-1" onClick={() => openFile(file, proj)}>
                      {file.thumbId ? (
                        <img className="w-full aspect-[3/4] object-contain bg-muted block shrink-0" src={`/api/thumb/${file.thumbId}`} loading="lazy" alt="" />
                      ) : (
                        <div className="w-full aspect-[3/4] flex items-center justify-center text-4xl bg-muted shrink-0" style={{ color }}>
                          {EMOJIS[file.ext] ?? '📄'}
                        </div>
                      )}
                      <div className="px-3 pt-2.5 pb-2.5 flex flex-col">
                        <div className="flex items-center justify-between gap-1 mb-1.5">
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="text-[10px] text-muted-foreground font-medium truncate">{proj.meta.projekt_nr}</span>
                            {vLabel && <span className="text-[8px] font-extrabold text-white px-1 py-0.5 rounded shrink-0" style={{ background: versionBadgeStyle(vLabel) }}>{vLabel}</span>}
                          </div>
                          <span className="text-[9px] font-extrabold text-white px-1.5 py-0.5 rounded-md shrink-0" style={{ background: color }}>{label}</span>
                        </div>
                        <div className="text-[12px] font-semibold leading-snug text-foreground line-clamp-2">{file.name}</div>
                      </div>
                    </button>
                    <CardFooter color={color} name={proj.meta.name} datum={file.datum} filePath={file.filePath} folder={proj.folder} />
                  </div>
                );
              }),
              showOnlyLatest && vg.older.length > 0 && (
                <button
                  key={vgKey + '_toggle'}
                  className="mt-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground bg-muted/60 hover:bg-muted py-1.5 px-3 rounded-lg border-0 cursor-pointer transition-colors text-left w-full leading-none"
                  onClick={() => toggleVersionGroup(vgKey)}>
                  {isExpanded ? '▾ Ausblenden' : `▸ ${vg.older.length} ältere Version${vg.older.length > 1 ? 'en' : ''}`}
                </button>
              ),
            ];
          })}
        </div>
      );
    }

    if (viewMode === 'gallery') {
      return (
        <div className="grid gap-1.5" style={{ gridTemplateColumns: GALLERY_COLS[thumbSize] }}>
          {proj.vGroups.map(vg => {
            const vgKey = vg.key + '§' + proj.folder;
            const isExpanded = expandedVersions.has(vgKey);
            const files = isExpanded ? [vg.latest, ...vg.older] : [vg.latest];
            return [
              ...files.map((file, fi) => {
                const label = DESIGN_LABELS[file.ext] ?? file.ext.toUpperCase();
                const color = DESIGN_COLORS[file.ext] ?? '#888';
                const isOlder = fi > 0;
                return (
                  <div
                    key={file.filePath}
                    className={`group/thumb relative aspect-[3/4] overflow-hidden rounded-lg cursor-pointer bg-muted ${isOlder ? 'opacity-55' : ''}`}
                    onClick={() => openFile(file, proj)}
                    onKeyDown={(e) => { if (e.key === 'Enter') openFile(file, proj); }}
                    role="button" tabIndex={0}
                    title={`${file.name} — ${proj.meta.projekt_nr} ${proj.meta.name}`}>
                    {file.thumbId ? (
                      <img className="w-full h-full object-contain bg-muted block" src={`/api/thumb/${file.thumbId}`} loading="lazy" alt="" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-3xl" style={{ color }}>
                        {EMOJIS[file.ext] ?? '📄'}
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent pt-6 pb-2 px-2 opacity-0 group-hover/thumb:opacity-100 transition-opacity">
                      <div className="flex items-center gap-1 mb-0.5">
                        <span className="text-[8px] font-extrabold text-white px-1 py-0.5 rounded shrink-0" style={{ background: color }}>{label}</span>
                        <span className="text-[9px] text-white/70 truncate">{proj.meta.projekt_nr}</span>
                      </div>
                      <div className="text-[10px] font-semibold text-white truncate">{file.name}</div>
                    </div>
                    <GalleryActions filePath={file.filePath} folder={proj.folder} />
                  </div>
                );
              }),
              showOnlyLatest && vg.older.length > 0 && !isExpanded && (
                <button
                  key={vgKey + '_toggle'}
                  className="aspect-[3/4] rounded-lg border-2 border-dashed border-muted-foreground/20 hover:border-muted-foreground/40 bg-transparent cursor-pointer flex items-center justify-center transition-colors"
                  onClick={() => toggleVersionGroup(vgKey)}
                  title="Ältere Versionen anzeigen">
                  <span className="text-[10px] text-muted-foreground/50 font-medium">+{vg.older.length}</span>
                </button>
              ),
            ];
          })}
        </div>
      );
    }

    // list view
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
        {proj.vGroups.map(vg => {
          const vgKey = vg.key + '§' + proj.folder;
          const isExpanded = expandedVersions.has(vgKey);
          const files = isExpanded ? [vg.latest, ...vg.older] : [vg.latest];
          return [
            ...files.map((file, fi) => {
              const label = DESIGN_LABELS[file.ext] ?? file.ext.toUpperCase();
              const color = DESIGN_COLORS[file.ext] ?? '#888';
              const base = file.name.slice(0, file.name.length - file.ext.length);
              const vLabel = getVersionLabel(base);
              const isOlder = fi > 0;
              return (
                <div key={file.filePath} className={`group/row flex items-center bg-card rounded-xl ring-1 ring-foreground/10 hover:ring-foreground/20 hover:shadow-sm transition-all duration-150 overflow-hidden ${isOlder ? 'opacity-55' : ''}`}>
                  <div className="w-[3px] self-stretch shrink-0" style={{ background: color }} />
                  <button className="flex items-center gap-3 px-3 py-2.5 flex-1 min-w-0 border-0 cursor-pointer text-left bg-transparent" onClick={() => openFile(file, proj)}>
                    {file.thumbId ? (
                      <img className={`${LIST_THUMB[thumbSize].img} rounded-md object-contain bg-muted shrink-0`} src={`/api/thumb/${file.thumbId}`} loading="lazy" alt="" />
                    ) : (
                      <div className={`${LIST_THUMB[thumbSize].icon} rounded-md bg-muted flex items-center justify-center shrink-0`} style={{ color }}>
                        {EMOJIS[file.ext] ?? '📄'}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-semibold text-foreground truncate">{file.name}</span>
                        {vLabel && <span className="text-[8px] font-extrabold text-white px-1 py-0.5 rounded shrink-0" style={{ background: versionBadgeStyle(vLabel) }}>{vLabel}</span>}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">{proj.meta.projekt_nr}{proj.meta.projekt_nr ? ' · ' : ''}{proj.meta.name}</div>
                    </div>
                    {file.datum && <span className="text-[11px] text-muted-foreground shrink-0 hidden md:block">{file.datum}</span>}
                    <span className="text-[9px] font-extrabold text-white px-1.5 py-0.5 rounded-md shrink-0" style={{ background: color }}>{label}</span>
                  </button>
                  <RowActions filePath={file.filePath} folder={proj.folder} />
                </div>
              );
            }),
            showOnlyLatest && vg.older.length > 0 && (
              <button
                key={vgKey + '_toggle'}
                className="text-[10px] font-medium text-muted-foreground hover:text-foreground bg-muted/60 hover:bg-muted py-1.5 px-3 rounded-lg border-0 cursor-pointer transition-colors text-left col-span-full leading-none"
                onClick={() => toggleVersionGroup(vgKey)}>
                {isExpanded ? '▾ Ausblenden' : `▸ ${vg.older.length} ältere Version${vg.older.length > 1 ? 'en' : ''}`}
              </button>
            ),
          ];
        })}
      </div>
    );
  }

  // ── Flat/type mode rendering ──
  function renderFlatGroup(items: FlatItem[]) {
    if (viewMode === 'grid') {
      return (
        <div className="grid gap-3" style={{ gridTemplateColumns: GRID_COLS[thumbSize] }}>
          {items.map(({ file, project }) => {
            const label = DESIGN_LABELS[file.ext] ?? file.ext.toUpperCase();
            const color = DESIGN_COLORS[file.ext] ?? '#888';
            const base = file.name.slice(0, file.name.length - file.ext.length);
            const vLabel = getVersionLabel(base);
            return (
              <div key={file.filePath} className="group/card flex flex-col rounded-xl overflow-hidden ring-1 ring-foreground/10 hover:ring-foreground/20 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-150 bg-card">
                <button className="flex flex-col text-left border-0 p-0 cursor-pointer bg-transparent flex-1" onClick={() => openFile(file, project)}>
                  {file.thumbId ? (
                    <img className="w-full aspect-[3/4] object-contain bg-muted block shrink-0" src={`/api/thumb/${file.thumbId}`} loading="lazy" alt="" />
                  ) : (
                    <div className="w-full aspect-[3/4] flex items-center justify-center text-4xl bg-muted shrink-0" style={{ color }}>
                      {EMOJIS[file.ext] ?? '📄'}
                    </div>
                  )}
                  <div className="px-3 pt-2.5 pb-2.5 flex flex-col">
                    <div className="flex items-center justify-between gap-1 mb-1.5">
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="text-[10px] text-muted-foreground font-medium truncate">{project.meta.projekt_nr}</span>
                        {vLabel && <span className="text-[8px] font-extrabold text-white px-1 py-0.5 rounded shrink-0" style={{ background: versionBadgeStyle(vLabel) }}>{vLabel}</span>}
                      </div>
                      <span className="text-[9px] font-extrabold text-white px-1.5 py-0.5 rounded-md shrink-0" style={{ background: color }}>{label}</span>
                    </div>
                    <div className="text-[12px] font-semibold leading-snug text-foreground line-clamp-2">{file.name}</div>
                  </div>
                </button>
                <CardFooter color={color} name={project.meta.name} datum={file.datum} filePath={file.filePath} folder={project.folder} />
              </div>
            );
          })}
        </div>
      );
    }

    if (viewMode === 'gallery') {
      return (
        <div className="grid gap-1.5" style={{ gridTemplateColumns: GALLERY_COLS[thumbSize] }}>
          {items.map(({ file, project }) => {
            const label = DESIGN_LABELS[file.ext] ?? file.ext.toUpperCase();
            const color = DESIGN_COLORS[file.ext] ?? '#888';
            return (
              <div
                key={file.filePath}
                className="group/thumb relative aspect-[3/4] overflow-hidden rounded-lg cursor-pointer bg-muted"
                onClick={() => openFile(file, project)}
                onKeyDown={(e) => { if (e.key === 'Enter') openFile(file, project); }}
                role="button" tabIndex={0}
                title={`${file.name} — ${project.meta.projekt_nr} ${project.meta.name}`}>
                {file.thumbId ? (
                  <img className="w-full h-full object-contain bg-muted block" src={`/api/thumb/${file.thumbId}`} loading="lazy" alt="" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-3xl" style={{ color }}>
                    {EMOJIS[file.ext] ?? '📄'}
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent pt-6 pb-2 px-2 opacity-0 group-hover/thumb:opacity-100 transition-opacity">
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className="text-[8px] font-extrabold text-white px-1 py-0.5 rounded shrink-0" style={{ background: color }}>{label}</span>
                    <span className="text-[9px] text-white/70 truncate">{project.meta.projekt_nr}</span>
                  </div>
                  <div className="text-[10px] font-semibold text-white truncate">{file.name}</div>
                </div>
                <GalleryActions filePath={file.filePath} folder={project.folder} />
              </div>
            );
          })}
        </div>
      );
    }

    // list view
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
        {items.map(({ file, project }) => {
          const label = DESIGN_LABELS[file.ext] ?? file.ext.toUpperCase();
          const color = DESIGN_COLORS[file.ext] ?? '#888';
          const base = file.name.slice(0, file.name.length - file.ext.length);
          const vLabel = getVersionLabel(base);
          return (
            <div key={file.filePath} className="group/row flex items-center bg-card rounded-xl ring-1 ring-foreground/10 hover:ring-foreground/20 hover:shadow-sm transition-all duration-150 overflow-hidden">
              <div className="w-[3px] self-stretch shrink-0" style={{ background: color }} />
              <button className="flex items-center gap-3 px-3 py-2.5 flex-1 min-w-0 border-0 cursor-pointer text-left bg-transparent" onClick={() => openFile(file, project)}>
                {file.thumbId ? (
                  <img className={`${LIST_THUMB[thumbSize].img} rounded-md object-contain bg-muted shrink-0`} src={`/api/thumb/${file.thumbId}`} loading="lazy" alt="" />
                ) : (
                  <div className={`${LIST_THUMB[thumbSize].icon} rounded-md bg-muted flex items-center justify-center shrink-0`} style={{ color }}>
                    {EMOJIS[file.ext] ?? '📄'}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-semibold text-foreground truncate">{file.name}</span>
                    {vLabel && <span className="text-[8px] font-extrabold text-white px-1 py-0.5 rounded shrink-0" style={{ background: versionBadgeStyle(vLabel) }}>{vLabel}</span>}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">{project.meta.projekt_nr}{project.meta.projekt_nr ? ' · ' : ''}{project.meta.name}</div>
                </div>
                {file.datum && <span className="text-[11px] text-muted-foreground shrink-0 hidden md:block">{file.datum}</span>}
                <span className="text-[9px] font-extrabold text-white px-1.5 py-0.5 rounded-md shrink-0" style={{ background: color }}>{label}</span>
              </button>
              <RowActions filePath={file.filePath} folder={project.folder} />
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <>
      {/* Zuletzt geöffnet */}
      {recentFiles.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Zuletzt geöffnet</span>
            <button
              className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground bg-transparent border-0 cursor-pointer p-0 ml-auto"
              onClick={() => { localStorage.removeItem(RECENTLY_VIEWED_KEY); setRecentFiles([]); }}>
              Leeren
            </button>
          </div>
          <div className="flex gap-2.5 overflow-x-auto pb-1">
            {recentFiles.map(r => {
              const color = DESIGN_COLORS[r.ext] ?? '#888';
              const label = DESIGN_LABELS[r.ext] ?? r.ext.toUpperCase();
              return (
                <button
                  key={r.filePath}
                  className="flex-shrink-0 w-[140px] bg-card rounded-xl overflow-hidden ring-1 ring-foreground/10 hover:ring-foreground/25 hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 flex flex-col border-0 p-0 cursor-pointer text-left"
                  onClick={() => openRecentFile(r)}
                  title={r.filePath}>
                  {r.thumbId ? (
                    <img className="w-full aspect-[3/4] object-contain bg-muted block" src={`/api/thumb/${r.thumbId}`} loading="lazy" alt="" />
                  ) : (
                    <div className="w-full aspect-[3/4] flex items-center justify-center text-2xl bg-muted" style={{ color }}>
                      {EMOJIS[r.ext] ?? '📄'}
                    </div>
                  )}
                  <div className="px-2.5 py-2 flex flex-col gap-0.5">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[9px] text-muted-foreground truncate">{r.projektNr}</span>
                      <span className="text-[8px] font-extrabold text-white px-1 py-0.5 rounded shrink-0" style={{ background: color }}>{label}</span>
                    </div>
                    <div className="text-[11px] font-semibold leading-tight text-foreground break-all line-clamp-2">{r.fileName}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Was ist neu? */}
      {newFilesInfo && (
        <div className="mb-4 flex items-center gap-3 bg-amber-50 border border-amber-200/80 rounded-xl px-4 py-2.5">
          <span className="text-sm">✦</span>
          <span className="text-sm font-semibold text-amber-800">
            {fmtCount(newFilesInfo.count)} neue {newFilesInfo.count === 1 ? 'Datei' : 'Dateien'}
            {' '}in {newFilesInfo.projectCount} {newFilesInfo.projectCount === 1 ? 'Projekt' : 'Projekten'} seit dem letzten Scan
          </span>
          <button
            className="text-xs font-semibold text-amber-700 hover:text-amber-900 bg-amber-100 hover:bg-amber-200 px-2.5 py-1 rounded-md border-0 cursor-pointer transition-colors"
            onClick={() => setShowOnlyNew(!showOnlyNew)}>
            {showOnlyNew ? 'Alle anzeigen' : 'Nur Neue'}
          </button>
          <button
            className="ml-auto text-amber-400 hover:text-amber-700 bg-transparent border-0 cursor-pointer text-base leading-none p-0.5"
            onClick={() => { setNewFilesInfo(null); setShowOnlyNew(false); }}>
            ✕
          </button>
        </div>
      )}

      {/* Controls */}
      <div className="mb-5 flex flex-col gap-2.5">
        {/* Client filter */}
        {allClients.length > 1 && (
          <div className="flex gap-1 flex-wrap items-center">
            <button
              className={`px-2 py-1 rounded-md text-xs font-medium border cursor-pointer transition-colors ${activeClient === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-foreground border-border hover:bg-muted'}`}
              onClick={() => setActiveClient('all')}>
              Alle Kunden
            </button>
            {allClients.map(client => (
              <button
                key={client}
                className={`px-2 py-1 rounded-md text-xs font-medium border cursor-pointer transition-colors ${activeClient === client ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-foreground border-border hover:bg-muted'}`}
                onClick={() => setActiveClient(client)}>
                {client}
              </button>
            ))}
          </div>
        )}

        {/* Type filter pills */}
        <div className="flex gap-1.5 flex-wrap items-center">
          {allTypes.map(ext => {
            const label = DESIGN_LABELS[ext] ?? ext.toUpperCase();
            const color = DESIGN_COLORS[ext] ?? '#888';
            return (
              <button
                key={ext}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold text-white cursor-pointer transition-opacity border-0 ${activeTypes.has(ext) ? 'opacity-100 shadow-sm' : 'opacity-35 hover:opacity-60'}`}
                style={{ background: color }}
                onClick={() => toggleType(ext)}>
                {label}
              </button>
            );
          })}
        </div>

        {/* Row 2: Filter + Ansichts-Optionen */}
        <div className="flex gap-1.5 items-center flex-wrap">
          <div className="flex gap-1">
            <button
              className={`px-2 py-1 rounded-md text-xs font-medium border cursor-pointer transition-colors ${activeYear === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-foreground border-border hover:bg-muted'}`}
              onClick={() => setActiveYear('all')}>
              Alle Jahre
            </button>
            {allYears.map(year => (
              <button
                key={year}
                className={`px-2 py-1 rounded-md text-xs font-medium border cursor-pointer transition-colors ${activeYear === year ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-foreground border-border hover:bg-muted'}`}
                onClick={() => setActiveYear(year)}>
                {year}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer ml-1 select-none">
            <input type="checkbox" checked={showArchiv} onChange={(e) => setShowArchiv(e.target.checked)} className="w-3.5 h-3.5 accent-primary rounded" />
            Archiv
          </label>

          {/* Sort dropdown */}
          <div className="relative ml-1">
            <button
              className="text-xs px-2 py-1 border border-border rounded-md bg-background text-foreground cursor-pointer h-6 flex items-center gap-1 hover:bg-muted transition-colors"
              onClick={() => setSortDropdownOpen(!sortDropdownOpen)}>
              {sortLabel} <span className="text-[9px] text-muted-foreground">▾</span>
            </button>
            {sortDropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSortDropdownOpen(false)} />
                <div className="absolute top-full left-0 mt-1 z-50 bg-background border border-border rounded-lg shadow-lg py-1 min-w-[140px]">
                  {sortOptions.map(([val, label]) => (
                    <button
                      key={val}
                      className={`w-full text-left text-xs px-3 py-1.5 border-0 cursor-pointer transition-colors ${sortMode === val ? 'bg-[#890813]/10 text-[#890813] font-medium' : 'bg-transparent text-foreground hover:bg-muted'}`}
                      onClick={() => { setSortMode(val); setSortDropdownOpen(false); }}>
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Group dropdown */}
          <div className="relative ml-0.5">
            <button
              className="text-xs px-2 py-1 border border-border rounded-md bg-background text-foreground cursor-pointer h-6 flex items-center gap-1 hover:bg-muted transition-colors"
              onClick={() => setGroupDropdownOpen(!groupDropdownOpen)}>
              {groupLabel} <span className="text-[9px] text-muted-foreground">▾</span>
            </button>
            {groupDropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setGroupDropdownOpen(false)} />
                <div className="absolute top-full left-0 mt-1 z-50 bg-background border border-border rounded-lg shadow-lg py-1 min-w-[160px]">
                  {groupOptions.map(([val, label]) => (
                    <button
                      key={val}
                      className={`w-full text-left text-xs px-3 py-1.5 border-0 cursor-pointer transition-colors ${groupMode === val ? 'bg-[#890813]/10 text-[#890813] font-medium' : 'bg-transparent text-foreground hover:bg-muted'}`}
                      onClick={() => { setGroupMode(val as GroupMode); setGroupDropdownOpen(false); }}>
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Versionsgrupierung Toggle */}
          {groupMode === 'project' && (
            <button
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium cursor-pointer border-0 transition-all ${showOnlyLatest ? 'bg-foreground/10 text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5'}`}
              onClick={() => { setShowOnlyLatest(!showOnlyLatest); setExpandedVersions(new Set()); }}
              title={showOnlyLatest ? 'Zeigt nur neueste Version je Datei — klicken um alle anzuzeigen' : 'Alle Versionen werden angezeigt'}>
              {showOnlyLatest ? '⟳ Neueste' : '⟳ Alle Versionen'}
            </button>
          )}

          <span className="text-xs text-muted-foreground ml-auto">
            {fmtCount(totalFileCount)} Dateien
          </span>

          {/* Thumbnail-Größe */}
          <div className="flex gap-0 bg-muted rounded-lg p-0.5 ml-1">
            {(['sm', 'md', 'lg', 'xl'] as const).map(size => (
              <button
                key={size}
                className={`w-6 h-5 rounded text-[10px] font-bold cursor-pointer border-0 transition-colors ${thumbSize === size ? 'bg-background shadow-sm text-foreground' : 'bg-transparent text-muted-foreground hover:text-foreground'}`}
                onClick={() => setThumbSize(size)}
                title={`Vorschaugröße: ${size.toUpperCase()}`}>
                {size.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Ansicht umschalten */}
          <div className="flex gap-0.5 bg-muted rounded-lg p-0.5 ml-0.5">
            <button
              className={`px-2.5 py-1 rounded-md text-xs cursor-pointer border-0 transition-colors ${viewMode === 'grid' ? 'bg-background shadow-sm text-foreground' : 'bg-transparent text-muted-foreground hover:text-foreground'}`}
              onClick={() => setViewMode('grid')} title="Kachelansicht">⊞</button>
            <button
              className={`px-2.5 py-1 rounded-md text-xs cursor-pointer border-0 transition-colors ${viewMode === 'gallery' ? 'bg-background shadow-sm text-foreground' : 'bg-transparent text-muted-foreground hover:text-foreground'}`}
              onClick={() => setViewMode('gallery')} title="Galerie">▦</button>
            <button
              className={`px-2.5 py-1 rounded-md text-xs cursor-pointer border-0 transition-colors ${viewMode === 'list' ? 'bg-background shadow-sm text-foreground' : 'bg-transparent text-muted-foreground hover:text-foreground'}`}
              onClick={() => setViewMode('list')} title="Listenansicht">☰</button>
          </div>
        </div>
      </div>

      {/* Ergebnisse */}
      {outerGroups.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">Keine Ergebnisse gefunden.</div>
      ) : (
        <>
          {/* Alle ein-/ausklappen */}
          {outerGroups.length > 1 && (
            <div className="flex gap-2 mb-2">
              <button className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground bg-transparent border-0 cursor-pointer p-0" onClick={expandAll}>Alle aufklappen</button>
              <span className="text-muted-foreground/30 text-[10px]">|</span>
              <button className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground bg-transparent border-0 cursor-pointer p-0" onClick={collapseAll}>Alle zuklappen</button>
            </div>
          )}

          {visibleGroups.map(oGroup => (
            <div key={oGroup.key} className="mt-6">
              {/* Gruppen-Header */}
              <div
                className="flex items-center gap-2 mb-3 w-full text-left cursor-pointer p-0 group/header"
                onClick={() => toggleCollapse(oGroup.key)}
                onKeyDown={(e) => { if (e.key === 'Enter') toggleCollapse(oGroup.key); }}
                role="button" tabIndex={0}>
                <span className={`text-[10px] text-muted-foreground/40 transition-transform duration-150 inline-block ${collapsed.has(oGroup.key) ? '' : 'rotate-90'}`}>▶</span>
                {oGroup.color && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: oGroup.color }} />}
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground group-hover/header:text-foreground transition-colors">
                  {oGroup.label}
                </span>
                <span className="text-[10px] text-muted-foreground/50">
                  {groupMode === 'project' && showOnlyLatest && oGroup.shownCount < oGroup.count
                    ? `${fmtCount(oGroup.shownCount)} von ${fmtCount(oGroup.count)} Dateien`
                    : `${fmtCount(oGroup.count)} ${oGroup.count === 1 ? 'Datei' : 'Dateien'}`
                  }
                </span>
                {oGroup.isArchiv && (
                  <span className="text-[10px] h-4 px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">Archiv</span>
                )}
                {oGroup.missingLinks && <span className="text-sm" title="INDD hat fehlende Links">⚠️</span>}
                {oGroup.folder && (
                  <button
                    className="flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-foreground ml-auto bg-transparent border-0 cursor-pointer p-1 rounded transition-all opacity-0 group-hover/header:opacity-100"
                    onClick={(e) => { e.stopPropagation(); openFolder(oGroup.folder!); }}
                    title="Ordner öffnen">
                    <FolderOpen className="size-3.5" />
                    <span>Ordner</span>
                  </button>
                )}
              </div>

              {!collapsed.has(oGroup.key) ? (
                <>
                  <hr className="mb-3 border-border" />
                  {oGroup.projData
                    ? renderProjectGroup(oGroup.projData)
                    : renderFlatGroup(oGroup.flatItems)
                  }
                </>
              ) : (
                <hr className="mb-1 opacity-30 border-border" />
              )}
            </div>
          ))}

          {visibleCount < outerGroups.length && (
            <div ref={loadMoreRef} className="h-10 flex items-center justify-center text-xs text-muted-foreground">
              Weitere laden...
            </div>
          )}
        </>
      )}
    </>
  );
}
