<!-- src/routes/(app)/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { PageData } from './$types';
  import type { Project } from '$lib/types.js';
  import DateienTab from '$lib/DateienTab.svelte';
  import VerlinkungsTab from '$lib/VerlinkungsTab.svelte';
  import TextsucheTab from '$lib/TextsucheTab.svelte';
  import LinkHealthTab from '$lib/LinkHealthTab.svelte';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import logo from '$lib/assets/logo.png';

  let { data }: { data: PageData } = $props();

  let activeTab: 'dateien' | 'verlinkungen' | 'textsuche' | 'linkhealth' = $state('dateien');
  let searchQuery = $state('');
  let lastScan = $state(data.lastScan);
  let scanning = $state(false);
  let nasOnline = $state(true);
  let smbUrl = $state<string | null>(null);
  let mountingNas = $state(false);
  let scanError = $state<string | null>(null);
  let scanDuration = $state<number | null>(null);
  let cooldownMsg = $state<string | null>(null);
  let projects: Project[] = $state([]);
  let loadingProjects = $state(true);
  let canOpenFiles = $state(true);

  let loadError = $state<string | null>(null);

  onMount(async () => {
    try {
      const [s, p] = await Promise.all([
        fetch('/api/status').then(r => r.json()),
        fetch('/api/projects').then(r => r.json()),
      ]);
      nasOnline = s.nasOnline;
      smbUrl = s.smbUrl;
      scanError = s.scanError ?? null;
      scanDuration = s.scanDuration ?? null;
      canOpenFiles = s.canOpenFiles ?? true;
      projects = p;
    } catch (err) {
      loadError = err instanceof Error ? err.message : 'Laden fehlgeschlagen';
    } finally {
      loadingProjects = false;
    }
  });

  async function refresh() {
    // Baseline aller aktuellen Dateipfade sichern, damit nach dem Scan neue Dateien erkannt werden
    try {
      const allPaths = projects.flatMap(p => p.files.map(f => f.filePath)).filter(Boolean);
      if (allPaths.length > 0) localStorage.setItem('fo_scan_baseline', JSON.stringify(allPaths));
    } catch { /* ignore */ }

    scanning = true;
    try {
      const res = await fetch('/api/refresh', { method: 'POST' }).then(r => r.json());
      if (res.status === 'cooldown') {
        scanning = false;
        cooldownMsg = `Bitte ${res.remaining} Min. warten`;
        setTimeout(() => { cooldownMsg = null; }, 4000);
        return;
      }
    } catch {
      scanning = false;
      scanError = 'Refresh-Anfrage fehlgeschlagen';
      return;
    }
    let pollCount = 0;
    const MAX_POLLS = 150; // 5 Minuten bei 2s Interval
    const poll = setInterval(async () => {
      try {
        if (++pollCount > MAX_POLLS) {
          clearInterval(poll);
          scanning = false;
          scanError = 'Scan-Timeout';
          return;
        }
        const s = await fetch('/api/status').then(r => r.json());
        if (!s.scanning) {
          clearInterval(poll);
          lastScan = s.lastScan;
          nasOnline = s.nasOnline;
          scanError = s.scanError ?? null;
          scanDuration = s.scanDuration ?? null;
          scanning = false;
          const p = await fetch('/api/projects').then(r => r.json());
          projects = p;
        }
      } catch {
        clearInterval(poll);
        scanning = false;
        scanError = 'Status-Abfrage fehlgeschlagen';
      }
    }, 2000);
  }

  async function mountNas() {
    mountingNas = true;
    try {
      await fetch('/api/mount-nas', { method: 'POST' });
    } catch { /* ignore */ }
    setTimeout(async () => {
      try {
        const s = await fetch('/api/status').then(r => r.json());
        nasOnline = s.nasOnline;
      } catch { /* ignore */ }
      mountingNas = false;
    }, 4000);
  }

  function formatLastScan(iso: string | null): string {
    if (!iso) return 'Noch kein Scan';
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
    if (diff < 1) return 'Gerade eben';
    if (diff < 60) return `vor ${diff} Min.`;
    return `vor ${Math.floor(diff / 60)} Std.`;
  }

  function formatScanDuration(ms: number | null): string {
    if (ms === null) return '';
    if (ms < 1000) return `(${ms}ms)`;
    return `(${Math.round(ms / 1000)}s)`;
  }

  async function logout() {
    await fetch('/logout', { method: 'POST' });
    window.location.href = '/login';
  }
</script>

<div class="min-h-screen flex flex-col bg-[#F5F5F5]">
  <!-- Header -->
  <header class="bg-[#3A3A3A] text-white sticky top-0 z-50 shadow-md">
    <div class="flex items-center gap-4 px-5 py-0 h-14">
      <!-- Logo -->
      <img src={logo} alt="art&design" class="h-7 brightness-0 invert shrink-0" />

      <!-- Divider -->
      <div class="w-px h-6 bg-white/20 shrink-0"></div>

      <!-- Tab nav -->
      <nav class="flex gap-0.5">
        {#each [['dateien','Dateien'],['verlinkungen','Verlinkungen'],['textsuche','Textsuche'],['linkhealth','Link Health']] as [id, label]}
          <button
            class="px-3.5 py-1.5 rounded text-xs font-medium cursor-pointer transition-all border-0
                   {activeTab === id
                     ? 'bg-[#890813] text-white'
                     : 'bg-transparent text-white/60 hover:text-white hover:bg-white/10'}"
            onclick={() => activeTab = id as typeof activeTab}>
            {label}
          </button>
        {/each}
      </nav>

      <!-- Search -->
      {#if activeTab === 'dateien'}
        <Input
          class="flex-1 min-w-[180px] max-w-[380px] h-8 bg-white/10 border-white/15 text-white text-sm
                 placeholder:text-white/35 focus-visible:bg-white/15 focus-visible:border-white/30
                 focus-visible:ring-[#890813]"
          type="text" bind:value={searchQuery}
          placeholder="Suchen: Artikel, Projekt-Nr., Format …" />
      {/if}

      <!-- Right -->
      <div class="flex items-center gap-2 ml-auto">
        {#if !nasOnline && smbUrl}
          <button
            class="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded
                   bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-400/30
                   cursor-pointer transition-colors disabled:opacity-50"
            onclick={mountNas} disabled={mountingNas}>
            {mountingNas ? '⏳' : '⚠'} NAS verbinden
          </button>
        {:else if !nasOnline}
          <span class="text-xs text-amber-300">⚠ NAS offline</span>
        {/if}

        <button
          class="text-white/50 hover:text-white text-lg leading-none p-1.5 bg-transparent border-0
                 cursor-pointer transition-colors rounded hover:bg-white/10 disabled:opacity-30"
          onclick={refresh} disabled={scanning} title="Index neu aufbauen">
          {scanning ? '⏳' : '↻'}
        </button>
        {#if cooldownMsg}
          <span class="text-xs text-amber-300 whitespace-nowrap">{cooldownMsg}</span>
        {/if}
        {#if scanError}
          <span
            class="text-xs text-red-400 cursor-default select-none"
            title={scanError}>⚠</span>
        {/if}
        <span class="text-xs text-white/35 whitespace-nowrap hidden lg:block">
          {formatLastScan(lastScan)}{scanDuration ? ` ${formatScanDuration(scanDuration)}` : ''}
        </span>
        <button
          class="text-xs text-white/40 hover:text-white/70 bg-transparent border-0 cursor-pointer
                 px-2 py-1 rounded hover:bg-white/10 transition-colors"
          onclick={logout}>
          Abmelden
        </button>
      </div>
    </div>

    <div class="h-px bg-white/10"></div>
  </header>

  <!-- Content -->
  <main class="flex-1 px-5 py-5 pb-16 max-w-screen-2xl mx-auto w-full">
    {#if loadError}
      <div class="text-center py-20 text-red-600">Fehler: {loadError}</div>
    {:else if loadingProjects}
      <div class="text-center py-20 text-muted-foreground">Projekte laden...</div>
    {:else if activeTab === 'dateien'}
      <DateienTab {projects} query={searchQuery} {canOpenFiles} />
    {:else if activeTab === 'verlinkungen'}
      <VerlinkungsTab {canOpenFiles} />
    {:else if activeTab === 'textsuche'}
      <TextsucheTab {canOpenFiles} />
    {:else}
      <LinkHealthTab {canOpenFiles} />
    {/if}
  </main>
</div>
