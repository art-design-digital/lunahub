<!-- src/lib/DateienTab.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { Project, ProjectFile } from './types.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Separator } from '$lib/components/ui/separator/index.js';
  import Copy from '@lucide/svelte/icons/copy';
  import Check from '@lucide/svelte/icons/check';
  import FolderOpen from '@lucide/svelte/icons/folder-open';
  import FolderInput from '@lucide/svelte/icons/folder-input';

  let { projects, query, canOpenFiles = true }: { projects: Project[]; query: string; canOpenFiles?: boolean } = $props();

  // ── Types ────────────────────────────────────────────────────
  type SortMode = 'newest' | 'oldest' | 'alpha';
  type YearFilter = string | 'all';
  type GroupMode = 'project' | 'type' | 'flat';
  type ThumbSize = 'sm' | 'md' | 'lg' | 'xl';
  type ViewMode = 'grid' | 'list' | 'gallery';

  // ── State ────────────────────────────────────────────────────
  let activeTypes: Set<string> = $state(new Set());
  let activeYear: YearFilter = $state('all');
  let activeClient = $state('all');
  let showArchiv = $state(false);
  let sortMode: SortMode = $state('newest');
  let viewMode: ViewMode = $state('grid');
  let groupMode: GroupMode = $state('project');
  let thumbSize: ThumbSize = $state('md');
  let collapsed: Set<string> = $state(new Set());
  let settingsLoaded = $state(false);
  let showOnlyLatest = $state(true);
  let expandedVersions: Set<string> = $state(new Set());
  let sortDropdownOpen = $state(false);
  let groupDropdownOpen = $state(false);

  const sortOptions: [SortMode, string][] = [['newest','Neueste zuerst'],['oldest','Älteste zuerst'],['alpha','A \u2013 Z']];
  const groupOptions: [GroupMode, string][] = [['project','Nach Projekt'],['type','Nach Dateityp'],['flat','Keine Gruppierung']];
  let sortLabel = $derived(sortOptions.find(o => o[0] === sortMode)?.[1] ?? 'Sortierung');
  let groupLabel = $derived(groupOptions.find(o => o[0] === groupMode)?.[1] ?? 'Gruppierung');

  // ── Progressive rendering ────────────────────────────────────
  const GROUPS_PER_BATCH = 20;
  let visibleCount = $state(GROUPS_PER_BATCH);

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

  // ── Abgeleitete Filter-Daten ─────────────────────────────────
  let allTypes = $derived([...new Set(
    projects.flatMap(p => p.files.map(f => NORM_EXT[f.ext] ?? f.ext))
            .filter(e => e !== '.indd')
  )].sort());
  let allYears = $derived([...new Set(projects.map(p => p.meta.jahr).filter(Boolean))].sort().reverse());
  let allClients = $derived([...new Set(projects.map(p => p.meta.client).filter(Boolean))].sort());

  let filtered = $derived(
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
      })
  );

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
    if (label === 'FINAL' || label === 'RZ') return 'background:#16a34a';
    if (/^v\d/.test(label)) return 'background:#2563eb';
    return 'background:#ea580c';
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

  // Wenn eine Suche aktiv ist, Versionsgrupierung deaktivieren
  let filteredGrouped = $derived(
    filtered.map(proj => {
      const doGroup = showOnlyLatest && !query;
      return {
        ...proj,
        vGroups: doGroup
          ? groupByVersion(proj.files)
          : proj.files.map(f => ({ key: f.filePath, latest: f, older: [] as ProjectFile[] }))
      };
    })
  );

  // ── Outer Groups (Gruppierung nach Projekt/Typ/Flat) ─────────
  interface FlatItem { file: ProjectFile; project: Project; }

  interface OuterGroup {
    key: string;
    label: string;
    color: string | null;
    isArchiv: boolean;
    missingLinks: boolean;
    folder: string | null;
    projData: (typeof filteredGrouped)[number] | null;
    flatItems: FlatItem[];
    count: number;
    shownCount: number;
  }

  let outerGroups: OuterGroup[] = $derived.by(() => {
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
  });

  let totalFileCount = $derived(outerGroups.reduce((a, g) => a + g.count, 0));

  let visibleGroups = $derived(outerGroups.slice(0, visibleCount));

  $effect(() => {
    outerGroups; // track dependency
    visibleCount = GROUPS_PER_BATCH;
  });

  // ── Aktionen ─────────────────────────────────────────────────
  function toggleType(ext: string) {
    if (activeTypes.has(ext)) activeTypes.delete(ext);
    else activeTypes.add(ext);
    activeTypes = new Set(activeTypes);
  }

  function toggleCollapse(key: string) {
    if (collapsed.has(key)) collapsed.delete(key);
    else collapsed.add(key);
    collapsed = new Set(collapsed);
  }

  function collapseAll() {
    collapsed = new Set(outerGroups.map(g => g.key));
  }

  function expandAll() {
    collapsed = new Set();
  }

  function toggleVersionGroup(key: string) {
    if (expandedVersions.has(key)) expandedVersions.delete(key);
    else expandedVersions.add(key);
    expandedVersions = new Set(expandedVersions);
  }

  // ── Zuletzt geöffnet ────────────────────────────────────────
  interface RecentFile {
    filePath: string;
    fileName: string;
    projectName: string;
    projektNr: string;
    folder: string;
    thumbId: string | null;
    ext: string;
  }

  const RECENTLY_VIEWED_KEY = 'fo_recently_viewed_v2';

  function loadRecent(): RecentFile[] {
    try { return JSON.parse(localStorage.getItem(RECENTLY_VIEWED_KEY) ?? '[]'); } catch { return []; }
  }

  let recentFiles: RecentFile[] = $state(loadRecent());

  function trackOpen(entry: RecentFile) {
    try {
      const recent = loadRecent().filter(r => r.filePath !== entry.filePath);
      const updated = [entry, ...recent].slice(0, 6);
      localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(updated));
      recentFiles = updated;
    } catch { /* ignore */ }
  }

  async function openFile(file: { filePath: string; name: string; thumbId: string | null; ext: string }, proj: { folder: string; meta: { name: string; projekt_nr: string } }) {
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
  }

  async function openFolder(folder: string) {
    if (!canOpenFiles) {
      await copyPath(folder);
      return;
    }
    await fetch('/api/open-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder }),
    });
  }

  // ── Pfad kopieren ───────────────────────────────────────────
  let copiedPath: string | null = $state(null);

  async function copyPath(path: string) {
    try {
      await navigator.clipboard.writeText(path);
      copiedPath = path;
      setTimeout(() => { copiedPath = null; }, 1500);
    } catch { /* ignore */ }
  }

  // ── Was ist neu? ─────────────────────────────────────────────
  const SCAN_BASELINE_KEY = 'fo_scan_baseline';

  interface NewFilesInfo {
    count: number;
    projectCount: number;
    paths: Set<string>;
  }

  let newFilesInfo: NewFilesInfo | null = $state(null);
  let showOnlyNew = $state(false);

  // ── Einstellungen persistieren ────────────────────────────────
  const SETTINGS_KEY = 'fo_view_settings';

  onMount(() => {
    // Ansichts-Einstellungen laden
    try {
      const settingsRaw = localStorage.getItem(SETTINGS_KEY);
      if (settingsRaw) {
        const s = JSON.parse(settingsRaw);
        if (['grid', 'list', 'gallery'].includes(s.viewMode)) viewMode = s.viewMode;
        if (['project', 'type', 'flat'].includes(s.groupMode)) groupMode = s.groupMode;
        if (['sm', 'md', 'lg', 'xl'].includes(s.thumbSize)) thumbSize = s.thumbSize;
        if (['newest', 'oldest', 'alpha'].includes(s.sortMode)) sortMode = s.sortMode;
      }
    } catch { /* ignore */ }
    settingsLoaded = true;

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
          newFilesInfo = { count: newPaths.size, projectCount: affectedProjects.size, paths: newPaths };
        }
      } catch { /* ignore */ }
      localStorage.removeItem(SCAN_BASELINE_KEY);
    }
  });

  $effect(() => {
    const s = { viewMode, groupMode, thumbSize, sortMode };
    if (!settingsLoaded) return;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
  });

  function fmtCount(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
    return String(n);
  }

  function loadMore(node: HTMLElement) {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          visibleCount = Math.min(visibleCount + GROUPS_PER_BATCH, outerGroups.length);
        }
      },
      { rootMargin: '400px' }
    );
    observer.observe(node);
    return { destroy: () => observer.disconnect() };
  }

  async function openRecentFile(r: RecentFile) {
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
  }
</script>

{#snippet cardFooter(color: string, name: string, datum: string | undefined, filePath: string, folder: string)}
  <div class="flex items-center gap-1.5 px-3 py-1.5 border-t border-foreground/5 bg-muted/30 mt-auto">
    <div class="w-1.5 h-1.5 rounded-full shrink-0 opacity-70" style="background:{color}"></div>
    <span class="text-[10px] text-muted-foreground/70 truncate flex-1">{name}</span>
    {#if datum}
      <span class="text-[10px] text-muted-foreground/40 shrink-0">{datum}</span>
    {/if}
    <button
      class="p-1 rounded text-muted-foreground/40 hover:text-foreground hover:bg-foreground/8
             border-0 cursor-pointer transition-colors shrink-0"
      onclick={(e) => { e.stopPropagation(); copyPath(filePath); }}
      title="Dateipfad kopieren">
      {#if copiedPath === filePath}
        <Check class="size-3.5 text-green-600" />
      {:else}
        <Copy class="size-3.5" />
      {/if}
    </button>
    <button
      class="p-1 rounded text-muted-foreground/40 hover:text-foreground hover:bg-foreground/8
             border-0 cursor-pointer transition-colors shrink-0"
      onclick={(e) => { e.stopPropagation(); openFolder(folder); }}
      title="Ordner öffnen">
      <FolderInput class="size-3.5" />
    </button>
  </div>
{/snippet}

{#snippet galleryActions(filePath: string, folder: string)}
  <div class="absolute top-1 right-1 flex gap-0.5
              opacity-0 group-hover/thumb:opacity-100 transition-opacity">
    <button
      class="text-white/80 hover:text-white bg-black/50 hover:bg-black/70 backdrop-blur-sm
             w-6 h-6 rounded-md flex items-center justify-center border-0 cursor-pointer transition-colors"
      onclick={(e) => { e.stopPropagation(); copyPath(filePath); }}
      title="Dateipfad kopieren">
      {#if copiedPath === filePath}
        <Check class="size-3.5 text-green-400" />
      {:else}
        <Copy class="size-3.5" />
      {/if}
    </button>
    <button
      class="text-white/80 hover:text-white bg-black/50 hover:bg-black/70 backdrop-blur-sm
             w-6 h-6 rounded-md flex items-center justify-center border-0 cursor-pointer transition-colors"
      onclick={(e) => { e.stopPropagation(); openFolder(folder); }}
      title="Ordner öffnen">
      <FolderInput class="size-3.5" />
    </button>
  </div>
{/snippet}

{#snippet rowActions(filePath: string, folder: string)}
  <div class="opacity-0 group-hover/row:opacity-100 transition-opacity flex items-center gap-0.5 px-2 shrink-0">
    <button
      class="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/8
             border-0 cursor-pointer transition-colors"
      onclick={() => copyPath(filePath)}
      title="Dateipfad kopieren">
      {#if copiedPath === filePath}
        <Check class="size-4 text-green-600" />
      {:else}
        <Copy class="size-4" />
      {/if}
    </button>
    <button
      class="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/8
             border-0 cursor-pointer transition-colors"
      onclick={() => openFolder(folder)}
      title="Ordner öffnen">
      <FolderInput class="size-4" />
    </button>
  </div>
{/snippet}

<!-- Zuletzt geöffnet -->
{#if recentFiles.length > 0}
  <div class="mb-5">
    <div class="flex items-center gap-2 mb-2.5">
      <span class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Zuletzt geöffnet</span>
      <button
        class="text-[10px] text-muted-foreground/50 hover:text-muted-foreground bg-transparent border-0 cursor-pointer p-0 ml-auto"
        onclick={() => { localStorage.removeItem(RECENTLY_VIEWED_KEY); recentFiles = []; }}>
        Leeren
      </button>
    </div>
    <div class="flex gap-2.5 overflow-x-auto pb-1">
      {#each recentFiles as r}
        {@const color = DESIGN_COLORS[r.ext] ?? '#888'}
        {@const label = DESIGN_LABELS[r.ext] ?? r.ext.toUpperCase()}
        <button
          class="flex-shrink-0 w-[140px] bg-card rounded-xl overflow-hidden ring-1 ring-foreground/10
                 hover:ring-foreground/25 hover:shadow-md hover:-translate-y-0.5
                 transition-all duration-150 flex flex-col border-0 p-0 cursor-pointer text-left"
          onclick={() => openRecentFile(r)}
          title={r.filePath}>
          {#if r.thumbId}
            <img class="w-full aspect-[3/4] object-contain bg-muted block" src={`/api/thumb/${r.thumbId}`} loading="lazy" alt="" />
          {:else}
            <div class="w-full aspect-[3/4] flex items-center justify-center text-2xl bg-muted" style="color:{color}">
              {EMOJIS[r.ext] ?? '📄'}
            </div>
          {/if}
          <div class="px-2.5 py-2 flex flex-col gap-0.5">
            <div class="flex items-center justify-between gap-1">
              <span class="text-[9px] text-muted-foreground truncate">{r.projektNr}</span>
              <span class="text-[8px] font-extrabold text-white px-1 py-0.5 rounded shrink-0" style="background:{color}">{label}</span>
            </div>
            <div class="text-[11px] font-semibold leading-tight text-foreground break-all line-clamp-2">{r.fileName}</div>
          </div>
        </button>
      {/each}
    </div>
  </div>
{/if}

<!-- Was ist neu? -->
{#if newFilesInfo}
  <div class="mb-4 flex items-center gap-3 bg-amber-50 border border-amber-200/80 rounded-xl px-4 py-2.5">
    <span class="text-sm">✦</span>
    <span class="text-sm font-semibold text-amber-800">
      {fmtCount(newFilesInfo.count)} neue {newFilesInfo.count === 1 ? 'Datei' : 'Dateien'}
      in {newFilesInfo.projectCount} {newFilesInfo.projectCount === 1 ? 'Projekt' : 'Projekten'} seit dem letzten Scan
    </span>
    <button
      class="text-xs font-semibold text-amber-700 hover:text-amber-900 bg-amber-100 hover:bg-amber-200
             px-2.5 py-1 rounded-md border-0 cursor-pointer transition-colors"
      onclick={() => showOnlyNew = !showOnlyNew}>
      {showOnlyNew ? 'Alle anzeigen' : 'Nur Neue'}
    </button>
    <button
      class="ml-auto text-amber-400 hover:text-amber-700 bg-transparent border-0 cursor-pointer text-base leading-none p-0.5"
      onclick={() => { newFilesInfo = null; showOnlyNew = false; }}>
      ✕
    </button>
  </div>
{/if}

<!-- Controls -->
<div class="mb-5 flex flex-col gap-2.5">
  <!-- Client filter (nur anzeigen wenn mehr als ein Kunde) -->
  {#if allClients.length > 1}
    <div class="flex gap-1 flex-wrap items-center">
      <Button variant={activeClient === 'all' ? 'default' : 'outline'} size="xs" onclick={() => activeClient = 'all'}>
        Alle Kunden
      </Button>
      {#each allClients as client}
        <Button variant={activeClient === client ? 'default' : 'outline'} size="xs" onclick={() => activeClient = client}>
          {client}
        </Button>
      {/each}
    </div>
  {/if}

  <!-- Type filter pills -->
  <div class="flex gap-1.5 flex-wrap items-center">
    {#each allTypes as ext}
      {@const label = DESIGN_LABELS[ext] ?? ext.toUpperCase()}
      {@const color = DESIGN_COLORS[ext] ?? '#888'}
      <button
        class="px-2.5 py-1 rounded-md text-[11px] font-bold text-white cursor-pointer transition-opacity border-0
               {activeTypes.has(ext) ? 'opacity-100 shadow-sm' : 'opacity-35 hover:opacity-60'}"
        style="background:{color}"
        onclick={() => toggleType(ext)}>
        {label}
      </button>
    {/each}
  </div>

  <!-- Row 2: Filter + Ansichts-Optionen -->
  <div class="flex gap-1.5 items-center flex-wrap">
    <div class="flex gap-1">
      <Button variant={activeYear === 'all' ? 'default' : 'outline'} size="xs" onclick={() => activeYear = 'all'}>
        Alle Jahre
      </Button>
      {#each allYears as year}
        <Button variant={activeYear === year ? 'default' : 'outline'} size="xs" onclick={() => activeYear = year}>
          {year}
        </Button>
      {/each}
    </div>

    <label class="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer ml-1 select-none">
      <input type="checkbox" bind:checked={showArchiv} class="w-3.5 h-3.5 accent-primary rounded" />
      Archiv
    </label>

    <div class="relative ml-1">
      <button
        class="text-xs px-2 py-1 border border-border rounded-md bg-background text-foreground
               cursor-pointer h-6 flex items-center gap-1 hover:bg-muted transition-colors"
        onclick={() => sortDropdownOpen = !sortDropdownOpen}>
        {sortLabel} <span class="text-[9px] text-muted-foreground">▾</span>
      </button>
      {#if sortDropdownOpen}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="fixed inset-0 z-40" onclick={() => sortDropdownOpen = false}></div>
        <div class="absolute top-full left-0 mt-1 z-50 bg-background border border-border rounded-lg shadow-lg py-1 min-w-[140px]">
          {#each sortOptions as [val, label]}
            <button
              class="w-full text-left text-xs px-3 py-1.5 border-0 cursor-pointer transition-colors
                     {sortMode === val ? 'bg-[#890813]/10 text-[#890813] font-medium' : 'bg-transparent text-foreground hover:bg-muted'}"
              onclick={() => { sortMode = val as SortMode; sortDropdownOpen = false; }}>
              {label}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <div class="relative ml-0.5">
      <button
        class="text-xs px-2 py-1 border border-border rounded-md bg-background text-foreground
               cursor-pointer h-6 flex items-center gap-1 hover:bg-muted transition-colors"
        onclick={() => groupDropdownOpen = !groupDropdownOpen}>
        {groupLabel} <span class="text-[9px] text-muted-foreground">▾</span>
      </button>
      {#if groupDropdownOpen}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="fixed inset-0 z-40" onclick={() => groupDropdownOpen = false}></div>
        <div class="absolute top-full left-0 mt-1 z-50 bg-background border border-border rounded-lg shadow-lg py-1 min-w-[160px]">
          {#each groupOptions as [val, label]}
            <button
              class="w-full text-left text-xs px-3 py-1.5 border-0 cursor-pointer transition-colors
                     {groupMode === val ? 'bg-[#890813]/10 text-[#890813] font-medium' : 'bg-transparent text-foreground hover:bg-muted'}"
              onclick={() => { groupMode = val as GroupMode; groupDropdownOpen = false; }}>
              {label}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Versionsgrupierung Toggle (nur in Projekt-Modus) -->
    {#if groupMode === 'project'}
      <button
        class="px-2.5 py-1 rounded-md text-[11px] font-medium cursor-pointer border-0 transition-all
               {showOnlyLatest
                 ? 'bg-foreground/10 text-foreground'
                 : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5'}"
        onclick={() => { showOnlyLatest = !showOnlyLatest; expandedVersions = new Set(); }}
        title={showOnlyLatest ? 'Zeigt nur neueste Version je Datei — klicken um alle anzuzeigen' : 'Alle Versionen werden angezeigt'}>
        {showOnlyLatest ? '⟳ Neueste' : '⟳ Alle Versionen'}
      </button>
    {/if}

    <span class="text-xs text-muted-foreground ml-auto">
      {fmtCount(totalFileCount)} Dateien
    </span>

    <!-- Thumbnail-Größe -->
    <div class="flex gap-0 bg-muted rounded-lg p-0.5 ml-1">
      {#each (['sm', 'md', 'lg', 'xl'] as const) as size}
        <button
          class="w-6 h-5 rounded text-[10px] font-bold cursor-pointer border-0 transition-colors
                 {thumbSize === size ? 'bg-background shadow-sm text-foreground' : 'bg-transparent text-muted-foreground hover:text-foreground'}"
          onclick={() => thumbSize = size}
          title="Vorschaugröße: {size.toUpperCase()}">
          {size.toUpperCase()}
        </button>
      {/each}
    </div>

    <!-- Ansicht umschalten -->
    <div class="flex gap-0.5 bg-muted rounded-lg p-0.5 ml-0.5">
      <button
        class="px-2.5 py-1 rounded-md text-xs cursor-pointer border-0 transition-colors
               {viewMode === 'grid' ? 'bg-background shadow-sm text-foreground' : 'bg-transparent text-muted-foreground hover:text-foreground'}"
        onclick={() => viewMode = 'grid'} title="Kachelansicht">⊞</button>
      <button
        class="px-2.5 py-1 rounded-md text-xs cursor-pointer border-0 transition-colors
               {viewMode === 'gallery' ? 'bg-background shadow-sm text-foreground' : 'bg-transparent text-muted-foreground hover:text-foreground'}"
        onclick={() => viewMode = 'gallery'} title="Galerie">▦</button>
      <button
        class="px-2.5 py-1 rounded-md text-xs cursor-pointer border-0 transition-colors
               {viewMode === 'list' ? 'bg-background shadow-sm text-foreground' : 'bg-transparent text-muted-foreground hover:text-foreground'}"
        onclick={() => viewMode = 'list'} title="Listenansicht">☰</button>
    </div>
  </div>
</div>

<!-- ══════════════════════════════════════════════════════════════ -->
<!-- Ergebnisse                                                    -->
<!-- ══════════════════════════════════════════════════════════════ -->
{#if outerGroups.length === 0}
  <div class="text-center py-20 text-muted-foreground">Keine Ergebnisse gefunden.</div>
{:else}
  <!-- Alle ein-/ausklappen (nur bei mehreren Gruppen) -->
  {#if outerGroups.length > 1}
    <div class="flex gap-2 mb-2">
      <button
        class="text-[10px] text-muted-foreground/60 hover:text-muted-foreground bg-transparent border-0 cursor-pointer p-0"
        onclick={expandAll}>Alle aufklappen</button>
      <span class="text-muted-foreground/30 text-[10px]">|</span>
      <button
        class="text-[10px] text-muted-foreground/60 hover:text-muted-foreground bg-transparent border-0 cursor-pointer p-0"
        onclick={collapseAll}>Alle zuklappen</button>
    </div>
  {/if}

  {#each visibleGroups as oGroup (oGroup.key)}
    <div class="mt-6">
      <!-- Gruppen-Header (klickbar zum Ein-/Ausklappen) -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="flex items-center gap-2 mb-3 w-full text-left cursor-pointer p-0 group/header"
        onclick={() => toggleCollapse(oGroup.key)}
        onkeydown={(e) => { if (e.key === 'Enter') toggleCollapse(oGroup.key); }}
        role="button" tabindex="0">
        <span class="text-[10px] text-muted-foreground/40 transition-transform duration-150 inline-block {collapsed.has(oGroup.key) ? '' : 'rotate-90'}">▶</span>
        {#if oGroup.color}
          <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:{oGroup.color}"></span>
        {/if}
        <span class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground group-hover/header:text-foreground transition-colors">
          {oGroup.label}
        </span>
        <span class="text-[10px] text-muted-foreground/50">
          {#if groupMode === 'project' && showOnlyLatest && oGroup.shownCount < oGroup.count}
            {fmtCount(oGroup.shownCount)} von {fmtCount(oGroup.count)} Dateien
          {:else}
            {fmtCount(oGroup.count)} {oGroup.count === 1 ? 'Datei' : 'Dateien'}
          {/if}
        </span>
        {#if oGroup.isArchiv}
          <Badge variant="secondary" class="text-[10px] h-4">Archiv</Badge>
        {/if}
        {#if oGroup.missingLinks}
          <span class="text-sm" title="INDD hat fehlende Links">⚠️</span>
        {/if}
        {#if oGroup.folder}
          <button
            class="flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-foreground ml-auto
                   bg-transparent border-0 cursor-pointer p-1 rounded transition-all
                   opacity-0 group-hover/header:opacity-100"
            onclick={(e) => { e.stopPropagation(); openFolder(oGroup.folder!); }}
            title="Ordner öffnen">
            <FolderOpen class="size-3.5" />
            <span>Ordner</span>
          </button>
        {/if}
      </div>

      {#if !collapsed.has(oGroup.key)}
        <Separator class="mb-3" />

        <!-- ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ -->
        <!-- PROJEKT-MODUS (mit Versionsgrupierung)              -->
        <!-- ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ -->
        {#if oGroup.projData}
          {@const proj = oGroup.projData}

          {#if viewMode === 'grid'}
            <div class="grid gap-3" style="grid-template-columns: {GRID_COLS[thumbSize]}">
              {#each proj.vGroups as vg}
                {@const vgKey = vg.key + '§' + proj.folder}
                {@const isExpanded = expandedVersions.has(vgKey)}
                {#each (isExpanded ? [vg.latest, ...vg.older] : [vg.latest]) as file, fi}
                  {@const label = DESIGN_LABELS[file.ext] ?? file.ext.toUpperCase()}
                  {@const color = DESIGN_COLORS[file.ext] ?? '#888'}
                  {@const base = file.name.slice(0, file.name.length - file.ext.length)}
                  {@const vLabel = getVersionLabel(base)}
                  {@const isOlder = fi > 0}
                  <div class="group/card flex flex-col rounded-xl overflow-hidden ring-1 ring-foreground/10
                              hover:ring-foreground/20 hover:shadow-lg hover:-translate-y-0.5
                              transition-all duration-150 bg-card {isOlder ? 'opacity-55' : ''}">
                    <!-- Klickbereich: Datei öffnen -->
                    <button
                      class="flex flex-col text-left border-0 p-0 cursor-pointer bg-transparent flex-1"
                      onclick={() => openFile(file, proj)}>
                      {#if file.thumbId}
                        <img class="w-full aspect-[3/4] object-contain bg-muted block shrink-0" src={`/api/thumb/${file.thumbId}`} loading="lazy" alt="" />
                      {:else}
                        <div class="w-full aspect-[3/4] flex items-center justify-center text-4xl bg-muted shrink-0" style="color:{color}">
                          {EMOJIS[file.ext] ?? '📄'}
                        </div>
                      {/if}
                      <div class="px-3 pt-2.5 pb-2.5 flex flex-col">
                        <div class="flex items-center justify-between gap-1 mb-1.5">
                          <div class="flex items-center gap-1 min-w-0">
                            <span class="text-[10px] text-muted-foreground font-medium truncate">{proj.meta.projekt_nr}</span>
                            {#if vLabel}
                              <span class="text-[8px] font-extrabold text-white px-1 py-0.5 rounded shrink-0"
                                    style={versionBadgeStyle(vLabel)}>{vLabel}</span>
                            {/if}
                          </div>
                          <span class="text-[9px] font-extrabold text-white px-1.5 py-0.5 rounded-md shrink-0" style="background:{color}">{label}</span>
                        </div>
                        <div class="text-[12px] font-semibold leading-snug text-foreground line-clamp-2">{file.name}</div>
                      </div>
                    </button>
                    {@render cardFooter(color, proj.meta.name, file.datum, file.filePath, proj.folder)}
                  </div>
                {/each}
                {#if showOnlyLatest && vg.older.length > 0}
                  <button
                    class="mt-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground
                           bg-muted/60 hover:bg-muted py-1.5 px-3 rounded-lg border-0 cursor-pointer
                           transition-colors text-left w-full leading-none"
                    onclick={() => toggleVersionGroup(vgKey)}>
                    {isExpanded
                      ? '▾ Ausblenden'
                      : `▸ ${vg.older.length} ältere Version${vg.older.length > 1 ? 'en' : ''}`}
                  </button>
                {/if}
              {/each}
            </div>

          {:else if viewMode === 'gallery'}
            <div class="grid gap-1.5" style="grid-template-columns: {GALLERY_COLS[thumbSize]}">
              {#each proj.vGroups as vg}
                {@const vgKey = vg.key + '§' + proj.folder}
                {@const isExpanded = expandedVersions.has(vgKey)}
                {#each (isExpanded ? [vg.latest, ...vg.older] : [vg.latest]) as file, fi}
                  {@const label = DESIGN_LABELS[file.ext] ?? file.ext.toUpperCase()}
                  {@const color = DESIGN_COLORS[file.ext] ?? '#888'}
                  {@const isOlder = fi > 0}
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    class="group/thumb relative aspect-[3/4] overflow-hidden rounded-lg cursor-pointer bg-muted
                           {isOlder ? 'opacity-55' : ''}"
                    onclick={() => openFile(file, proj)}
                    onkeydown={(e) => { if (e.key === 'Enter') openFile(file, proj); }}
                    role="button" tabindex="0"
                    title="{file.name} — {proj.meta.projekt_nr} {proj.meta.name}">
                    {#if file.thumbId}
                      <img class="w-full h-full object-contain bg-muted block" src={`/api/thumb/${file.thumbId}`} loading="lazy" alt="" />
                    {:else}
                      <div class="w-full h-full flex items-center justify-center text-3xl" style="color:{color}">
                        {EMOJIS[file.ext] ?? '📄'}
                      </div>
                    {/if}
                    <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent
                                pt-6 pb-2 px-2 opacity-0 group-hover/thumb:opacity-100 transition-opacity">
                      <div class="flex items-center gap-1 mb-0.5">
                        <span class="text-[8px] font-extrabold text-white px-1 py-0.5 rounded shrink-0" style="background:{color}">{label}</span>
                        <span class="text-[9px] text-white/70 truncate">{proj.meta.projekt_nr}</span>
                      </div>
                      <div class="text-[10px] font-semibold text-white truncate">{file.name}</div>
                    </div>
                    {@render galleryActions(file.filePath, proj.folder)}
                  </div>
                {/each}
                {#if showOnlyLatest && vg.older.length > 0 && !isExpanded}
                  <button
                    class="aspect-[3/4] rounded-lg border-2 border-dashed border-muted-foreground/20
                           hover:border-muted-foreground/40 bg-transparent cursor-pointer
                           flex items-center justify-center transition-colors"
                    onclick={() => toggleVersionGroup(vgKey)}
                    title="Ältere Versionen anzeigen">
                    <span class="text-[10px] text-muted-foreground/50 font-medium">+{vg.older.length}</span>
                  </button>
                {/if}
              {/each}
            </div>

          {:else}
            <!-- Listenansicht -->
            <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
              {#each proj.vGroups as vg}
                {@const vgKey = vg.key + '§' + proj.folder}
                {@const isExpanded = expandedVersions.has(vgKey)}
                {#each (isExpanded ? [vg.latest, ...vg.older] : [vg.latest]) as file, fi}
                  {@const label = DESIGN_LABELS[file.ext] ?? file.ext.toUpperCase()}
                  {@const color = DESIGN_COLORS[file.ext] ?? '#888'}
                  {@const base = file.name.slice(0, file.name.length - file.ext.length)}
                  {@const vLabel = getVersionLabel(base)}
                  {@const isOlder = fi > 0}
                  <div class="group/row flex items-center bg-card rounded-xl ring-1 ring-foreground/10
                              hover:ring-foreground/20 hover:shadow-sm transition-all duration-150 overflow-hidden
                              {isOlder ? 'opacity-55' : ''}">
                    <div class="w-[3px] self-stretch shrink-0" style="background:{color}"></div>
                    <button
                      class="flex items-center gap-3 px-3 py-2.5 flex-1 min-w-0
                             border-0 cursor-pointer text-left bg-transparent"
                      onclick={() => openFile(file, proj)}>
                      {#if file.thumbId}
                        <img class="{LIST_THUMB[thumbSize].img} rounded-md object-contain bg-muted shrink-0" src={`/api/thumb/${file.thumbId}`} loading="lazy" alt="" />
                      {:else}
                        <div class="{LIST_THUMB[thumbSize].icon} rounded-md bg-muted flex items-center justify-center shrink-0" style="color:{color}">
                          {EMOJIS[file.ext] ?? '📄'}
                        </div>
                      {/if}
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-1.5">
                          <span class="text-[13px] font-semibold text-foreground truncate">{file.name}</span>
                          {#if vLabel}
                            <span class="text-[8px] font-extrabold text-white px-1 py-0.5 rounded shrink-0"
                                  style={versionBadgeStyle(vLabel)}>{vLabel}</span>
                          {/if}
                        </div>
                        <div class="text-[11px] text-muted-foreground truncate">{proj.meta.projekt_nr}{proj.meta.projekt_nr ? ' · ' : ''}{proj.meta.name}</div>
                      </div>
                      {#if file.datum}
                        <span class="text-[11px] text-muted-foreground shrink-0 hidden md:block">{file.datum}</span>
                      {/if}
                      <span class="text-[9px] font-extrabold text-white px-1.5 py-0.5 rounded-md shrink-0" style="background:{color}">{label}</span>
                    </button>
                    {@render rowActions(file.filePath, proj.folder)}
                  </div>
                {/each}
                {#if showOnlyLatest && vg.older.length > 0}
                  <button
                    class="text-[10px] font-medium text-muted-foreground hover:text-foreground
                           bg-muted/60 hover:bg-muted py-1.5 px-3 rounded-lg border-0 cursor-pointer
                           transition-colors text-left col-span-full leading-none"
                    onclick={() => toggleVersionGroup(vgKey)}>
                    {isExpanded
                      ? '▾ Ausblenden'
                      : `▸ ${vg.older.length} ältere Version${vg.older.length > 1 ? 'en' : ''}`}
                  </button>
                {/if}
              {/each}
            </div>
          {/if}

        <!-- ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ -->
        <!-- TYP / FLAT-MODUS (ohne Versionsgrupierung)         -->
        <!-- ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ -->
        {:else}

          {#if viewMode === 'grid'}
            <div class="grid gap-3" style="grid-template-columns: {GRID_COLS[thumbSize]}">
              {#each oGroup.flatItems as { file, project }}
                {@const label = DESIGN_LABELS[file.ext] ?? file.ext.toUpperCase()}
                {@const color = DESIGN_COLORS[file.ext] ?? '#888'}
                {@const base = file.name.slice(0, file.name.length - file.ext.length)}
                {@const vLabel = getVersionLabel(base)}
                <div class="group/card flex flex-col rounded-xl overflow-hidden ring-1 ring-foreground/10
                            hover:ring-foreground/20 hover:shadow-lg hover:-translate-y-0.5
                            transition-all duration-150 bg-card">
                  <!-- Klickbereich: Datei öffnen -->
                  <button
                    class="flex flex-col text-left border-0 p-0 cursor-pointer bg-transparent flex-1"
                    onclick={() => openFile(file, project)}>
                    {#if file.thumbId}
                      <img class="w-full aspect-[3/4] object-contain bg-muted block shrink-0" src={`/api/thumb/${file.thumbId}`} loading="lazy" alt="" />
                    {:else}
                      <div class="w-full aspect-[3/4] flex items-center justify-center text-4xl bg-muted shrink-0" style="color:{color}">
                        {EMOJIS[file.ext] ?? '📄'}
                      </div>
                    {/if}
                    <div class="px-3 pt-2.5 pb-2.5 flex flex-col">
                      <div class="flex items-center justify-between gap-1 mb-1.5">
                        <div class="flex items-center gap-1 min-w-0">
                          <span class="text-[10px] text-muted-foreground font-medium truncate">{project.meta.projekt_nr}</span>
                          {#if vLabel}
                            <span class="text-[8px] font-extrabold text-white px-1 py-0.5 rounded shrink-0"
                                  style={versionBadgeStyle(vLabel)}>{vLabel}</span>
                          {/if}
                        </div>
                        <span class="text-[9px] font-extrabold text-white px-1.5 py-0.5 rounded-md shrink-0" style="background:{color}">{label}</span>
                      </div>
                      <div class="text-[12px] font-semibold leading-snug text-foreground line-clamp-2">{file.name}</div>
                    </div>
                  </button>
                  {@render cardFooter(color, project.meta.name, file.datum, file.filePath, project.folder)}
                </div>
              {/each}
            </div>

          {:else if viewMode === 'gallery'}
            <div class="grid gap-1.5" style="grid-template-columns: {GALLERY_COLS[thumbSize]}">
              {#each oGroup.flatItems as { file, project }}
                {@const label = DESIGN_LABELS[file.ext] ?? file.ext.toUpperCase()}
                {@const color = DESIGN_COLORS[file.ext] ?? '#888'}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="group/thumb relative aspect-[3/4] overflow-hidden rounded-lg cursor-pointer bg-muted"
                  onclick={() => openFile(file, project)}
                  onkeydown={(e) => { if (e.key === 'Enter') openFile(file, project); }}
                  role="button" tabindex="0"
                  title="{file.name} — {project.meta.projekt_nr} {project.meta.name}">
                  {#if file.thumbId}
                    <img class="w-full h-full object-contain bg-muted block" src={`/api/thumb/${file.thumbId}`} loading="lazy" alt="" />
                  {:else}
                    <div class="w-full h-full flex items-center justify-center text-3xl" style="color:{color}">
                      {EMOJIS[file.ext] ?? '📄'}
                    </div>
                  {/if}
                  <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent
                              pt-6 pb-2 px-2 opacity-0 group-hover/thumb:opacity-100 transition-opacity">
                    <div class="flex items-center gap-1 mb-0.5">
                      <span class="text-[8px] font-extrabold text-white px-1 py-0.5 rounded shrink-0" style="background:{color}">{label}</span>
                      <span class="text-[9px] text-white/70 truncate">{project.meta.projekt_nr}</span>
                    </div>
                    <div class="text-[10px] font-semibold text-white truncate">{file.name}</div>
                  </div>
                  {@render galleryActions(file.filePath, project.folder)}
                </div>
              {/each}
            </div>

          {:else}
            <!-- Listenansicht -->
            <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
              {#each oGroup.flatItems as { file, project }}
                {@const label = DESIGN_LABELS[file.ext] ?? file.ext.toUpperCase()}
                {@const color = DESIGN_COLORS[file.ext] ?? '#888'}
                {@const base = file.name.slice(0, file.name.length - file.ext.length)}
                {@const vLabel = getVersionLabel(base)}
                <div class="group/row flex items-center bg-card rounded-xl ring-1 ring-foreground/10
                            hover:ring-foreground/20 hover:shadow-sm transition-all duration-150 overflow-hidden">
                  <div class="w-[3px] self-stretch shrink-0" style="background:{color}"></div>
                  <button
                    class="flex items-center gap-3 px-3 py-2.5 flex-1 min-w-0
                           border-0 cursor-pointer text-left bg-transparent"
                    onclick={() => openFile(file, project)}>
                    {#if file.thumbId}
                      <img class="{LIST_THUMB[thumbSize].img} rounded-md object-contain bg-muted shrink-0" src={`/api/thumb/${file.thumbId}`} loading="lazy" alt="" />
                    {:else}
                      <div class="{LIST_THUMB[thumbSize].icon} rounded-md bg-muted flex items-center justify-center shrink-0" style="color:{color}">
                        {EMOJIS[file.ext] ?? '📄'}
                      </div>
                    {/if}
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-1.5">
                        <span class="text-[13px] font-semibold text-foreground truncate">{file.name}</span>
                        {#if vLabel}
                          <span class="text-[8px] font-extrabold text-white px-1 py-0.5 rounded shrink-0"
                                style={versionBadgeStyle(vLabel)}>{vLabel}</span>
                        {/if}
                      </div>
                      <div class="text-[11px] text-muted-foreground truncate">{project.meta.projekt_nr}{project.meta.projekt_nr ? ' · ' : ''}{project.meta.name}</div>
                    </div>
                    {#if file.datum}
                      <span class="text-[11px] text-muted-foreground shrink-0 hidden md:block">{file.datum}</span>
                    {/if}
                    <span class="text-[9px] font-extrabold text-white px-1.5 py-0.5 rounded-md shrink-0" style="background:{color}">{label}</span>
                  </button>
                  {@render rowActions(file.filePath, project.folder)}
                </div>
              {/each}
            </div>
          {/if}

        {/if}
      {:else}
        <!-- Eingeklappt: dezente Trennlinie -->
        <Separator class="mb-1 opacity-30" />
      {/if}
    </div>
  {/each}

  {#if visibleCount < outerGroups.length}
    <div
      class="h-10 flex items-center justify-center text-xs text-muted-foreground"
      use:loadMore>
      Weitere laden...
    </div>
  {/if}
{/if}
