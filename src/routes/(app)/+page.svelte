<!-- src/routes/(app)/+page.svelte -->
<script lang="ts">
  import type { PageData } from './$types';
  import DateienTab from '$lib/DateienTab.svelte';
  import VerlinkungsTab from '$lib/VerlinkungsTab.svelte';
  import TextsucheTab from '$lib/TextsucheTab.svelte';

  let { data }: { data: PageData } = $props();

  let activeTab: 'dateien' | 'verlinkungen' | 'textsuche' = $state('dateien');
  let searchQuery = $state('');
  let lastScan = $state(data.lastScan);
  let scanning = $state(false);

  async function refresh() {
    scanning = true;
    await fetch('/api/refresh', { method: 'POST' });
    const poll = setInterval(async () => {
      const s = await fetch('/api/status').then(r => r.json());
      if (!s.scanning) {
        clearInterval(poll);
        lastScan = s.lastScan;
        scanning = false;
        window.location.reload();
      }
    }, 2000);
  }

  function formatLastScan(iso: string | null): string {
    if (!iso) return 'Noch kein Scan';
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
    if (diff < 1) return 'Gerade eben';
    if (diff < 60) return `vor ${diff} Min.`;
    return `vor ${Math.floor(diff / 60)} Std.`;
  }

  async function logout() {
    await fetch('/logout', { method: 'POST' });
    window.location.href = '/login';
  }
</script>

<div class="app">
  <header>
    <span class="logo">📁 Projekt-Index</span>

    <nav class="tabs">
      <button class:active={activeTab === 'dateien'} onclick={() => activeTab = 'dateien'}>Dateien</button>
      <button class:active={activeTab === 'verlinkungen'} onclick={() => activeTab = 'verlinkungen'}>Verlinkungen</button>
      <button class:active={activeTab === 'textsuche'} onclick={() => activeTab = 'textsuche'}>Textsuche</button>
    </nav>

    {#if activeTab === 'dateien'}
      <input class="search" type="text" bind:value={searchQuery}
        placeholder="Suchen: Artikel, Projekt-Nr., Format …" autofocus />
    {/if}

    <div class="header-right">
      <button class="refresh-btn" onclick={refresh} disabled={scanning} title="Index neu aufbauen">
        {scanning ? '⏳' : '↻'}
      </button>
      <span class="last-scan">{formatLastScan(lastScan)}</span>
      <button class="logout-btn" onclick={logout}>Abmelden</button>
    </div>
  </header>

  <main>
    {#if activeTab === 'dateien'}
      <DateienTab projects={data.initialProjects} query={searchQuery} />
    {:else if activeTab === 'verlinkungen'}
      <VerlinkungsTab />
    {:else}
      <TextsucheTab />
    {/if}
  </main>
</div>

<style>
  .app { min-height: 100vh; display: flex; flex-direction: column; }
  header {
    background: #1a1a1a; color: white;
    padding: 10px 20px;
    position: sticky; top: 0; z-index: 100;
    display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
    box-shadow: 0 2px 8px rgba(0,0,0,0.35);
  }
  .logo { font-size: 15px; font-weight: 700; white-space: nowrap; }
  .tabs { display: flex; gap: 2px; background: #333; border-radius: 6px; padding: 3px; }
  .tabs button {
    padding: 5px 13px; border-radius: 4px; border: none;
    font-size: 12px; font-weight: 600; cursor: pointer;
    background: transparent; color: #999; transition: all 0.15s;
  }
  .tabs button.active { background: #555; color: white; }
  .search {
    flex: 1; min-width: 180px; max-width: 420px;
    padding: 7px 13px; border: none; border-radius: 6px;
    font-size: 14px; background: #333; color: white; outline: none;
  }
  .search::placeholder { color: #777; }
  .search:focus { background: #444; }
  .header-right { display: flex; align-items: center; gap: 10px; margin-left: auto; }
  .refresh-btn {
    background: none; border: none; color: #aaa; font-size: 18px;
    cursor: pointer; padding: 4px; line-height: 1;
  }
  .refresh-btn:hover { color: white; }
  .last-scan { font-size: 11px; color: #666; white-space: nowrap; }
  .logout-btn {
    font-size: 11px; color: #666; background: none; border: none;
    cursor: pointer; padding: 4px 8px;
  }
  .logout-btn:hover { color: #aaa; }
  main { flex: 1; padding: 16px 20px 48px; }
</style>
