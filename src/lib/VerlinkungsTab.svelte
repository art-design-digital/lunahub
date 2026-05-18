<!-- src/lib/VerlinkungsTab.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { InddLinkEntry, InddEntry } from './types.js';

  let linksMap: Record<string, InddLinkEntry[]> = $state({});
  let inddMap: Record<string, InddEntry> = $state({});
  let loaded = $state(false);
  let activeSubtab: 'bild' | 'indd' = $state('bild');
  let bildQuery = $state('');
  let inddQuery = $state('');

  onMount(async () => {
    [linksMap, inddMap] = await Promise.all([
      fetch('/api/links').then(r => r.json()),
      fetch('/api/indd').then(r => r.json()),
    ]);
    loaded = true;
  });

  let bildResults = $derived(
    bildQuery.length >= 2
      ? Object.entries(linksMap).filter(([k]) => k.includes(bildQuery.toLowerCase()))
      : []
  );

  let inddResults = $derived(
    inddQuery.length >= 2
      ? Object.entries(inddMap).filter(([k]) => k.toLowerCase().includes(inddQuery.toLowerCase()))
      : []
  );
</script>

{#if !loaded}
  <div class="loading">Lade Verlinkungen …</div>
{:else}
  <div class="subtabs">
    <button class:active={activeSubtab === 'bild'} onclick={() => activeSubtab = 'bild'}>Bild → INDDs</button>
    <button class:active={activeSubtab === 'indd'} onclick={() => activeSubtab = 'indd'}>INDD → Bilder</button>
  </div>

  {#if activeSubtab === 'bild'}
    <input class="search" type="text" bind:value={bildQuery}
      placeholder="Bildname suchen, z.B. foto_sommer.jpg …" autofocus />
    {#if bildQuery.length < 2}
      <div class="empty">Mindestens 2 Zeichen eingeben.</div>
    {:else if bildResults.length === 0}
      <div class="empty">Kein Treffer — Dateiname prüfen.</div>
    {:else}
      {#each bildResults as [filename, usages]}
        <div class="result-group">
          <div class="result-title">{filename}</div>
          <div class="result-list">
            {#each usages as u}
              <div class="result-row">
                <span class="indd-name">{u.indd}</span>
                <span class="proj-label">{u.proj} · {u.name}</span>
                <a class="open-link" href={`file://${u.folder}`}>Ordner ↗</a>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    {/if}

  {:else}
    <input class="search" type="text" bind:value={inddQuery}
      placeholder="INDD suchen, z.B. P260031 oder Layout …" autofocus />
    {#if inddQuery.length < 2}
      <div class="empty">Mindestens 2 Zeichen eingeben.</div>
    {:else if inddResults.length === 0}
      <div class="empty">Kein Treffer — INDD-Namen prüfen.</div>
    {:else}
      {#each inddResults as [inddName, inddData]}
        <div class="result-group">
          <div class="result-title">
            {inddName}
            <a class="open-link" style="float:right;font-size:10px" href={`file://${inddData.folder}`}>Ordner ↗</a>
          </div>
          <div style="font-size:11px;color:#aaa;padding:4px 14px 4px">
            {inddData.proj} · {inddData.name} · {inddData.links.length} verlinkte Dateien
          </div>
          <div class="result-list">
            {#each inddData.links as img}
              <div class="result-row"><span class="indd-name">{img}</span></div>
            {/each}
          </div>
        </div>
      {/each}
    {/if}
  {/if}
{/if}

<style>
  .loading { text-align: center; padding: 60px; color: #bbb; }
  .subtabs { display: flex; border-bottom: 2px solid #e0e0e0; margin-bottom: 16px; }
  .subtabs button {
    padding: 8px 18px; border: none; background: none;
    font-size: 13px; font-weight: 600; color: #aaa; cursor: pointer;
    border-bottom: 2px solid transparent; margin-bottom: -2px;
  }
  .subtabs button.active { color: #333; border-bottom-color: #333; }
  .search {
    width: 100%; max-width: 500px; padding: 9px 14px;
    border: 1px solid #ddd; border-radius: 6px; font-size: 14px;
    outline: none; margin-bottom: 16px;
  }
  .search:focus { border-color: #1a1a1a; }
  .empty { text-align: center; padding: 60px; color: #bbb; }
  .result-group {
    background: white; border-radius: 8px; margin-bottom: 10px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.09); overflow: hidden;
  }
  .result-title {
    font-size: 12px; font-weight: 700; padding: 10px 14px 8px;
    border-bottom: 1px solid #f0f0f0; word-break: break-all;
  }
  .result-list { padding: 6px 14px 10px; display: flex; flex-direction: column; gap: 5px; }
  .result-row { display: flex; align-items: baseline; gap: 8px; }
  .indd-name { font-size: 12px; font-family: monospace; color: #2c3e8c; }
  .proj-label { font-size: 11px; color: #aaa; }
  .open-link { font-size: 10px; color: #2c3e8c; margin-left: auto; }
</style>
