<!-- src/lib/VerlinkungsTab.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { InddLinkEntry, InddEntry } from './types.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import { Card, CardContent, CardHeader } from '$lib/components/ui/card/index.js';
  import { Separator } from '$lib/components/ui/separator/index.js';

  let { canOpenFiles = true }: { canOpenFiles?: boolean } = $props();

  let linksMap: Record<string, InddLinkEntry[]> = $state({});
  let inddMap: Record<string, InddEntry> = $state({});
  let loaded = $state(false);
  let activeSubtab: 'bild' | 'indd' = $state('bild');
  let bildQuery = $state('');
  let inddQuery = $state('');
  let copiedPath: string | null = $state(null);
  let loadError: string | null = $state(null);

  onMount(async () => {
    try {
      [linksMap, inddMap] = await Promise.all([
        fetch('/api/links').then(r => r.json()),
        fetch('/api/indd').then(r => r.json()),
      ]);
    } catch (err) {
      loadError = err instanceof Error ? err.message : 'Laden fehlgeschlagen';
    } finally {
      loaded = true;
    }
  });

  function norm(s: string): string {
    return s.toLowerCase().replace(/[\u2010-\u2015\u2212\u00ad]/g, '-');
  }

  let bildResults = $derived(
    bildQuery.length >= 2
      ? Object.entries(linksMap).filter(([k]) => norm(k).includes(norm(bildQuery)))
      : []
  );

  async function openFolder(folder: string) {
    if (!canOpenFiles) {
      try {
        await navigator.clipboard.writeText(folder);
        copiedPath = folder;
        setTimeout(() => { copiedPath = null; }, 1500);
      } catch { /* ignore */ }
      return;
    }
    await fetch('/api/open-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder }),
    });
  }

  let inddResults = $derived(
    inddQuery.length >= 2
      ? Object.entries(inddMap).filter(([k]) => norm(k).includes(norm(inddQuery)))
      : []
  );
</script>

{#if !loaded}
  <div class="text-center py-16 text-muted-foreground">Lade Verlinkungen …</div>
{:else if loadError}
  <div class="text-center py-16 text-red-600">Fehler: {loadError}</div>
{:else}
  <!-- Subtab bar -->
  <div class="flex gap-0.5 bg-muted rounded-lg p-0.5 w-fit mb-5">
    <button
      class="px-3.5 py-1.5 rounded-md text-xs font-medium cursor-pointer border-0 transition-colors
             {activeSubtab === 'bild' ? 'bg-background shadow-sm text-foreground' : 'bg-transparent text-muted-foreground hover:text-foreground'}"
      onclick={() => activeSubtab = 'bild'}>
      Bild → INDDs
    </button>
    <button
      class="px-3.5 py-1.5 rounded-md text-xs font-medium cursor-pointer border-0 transition-colors
             {activeSubtab === 'indd' ? 'bg-background shadow-sm text-foreground' : 'bg-transparent text-muted-foreground hover:text-foreground'}"
      onclick={() => activeSubtab = 'indd'}>
      INDD → Bilder
    </button>
  </div>

  {#if activeSubtab === 'bild'}
    <Input
      class="max-w-xl mb-5"
      type="text" bind:value={bildQuery}
      placeholder="Bildname suchen, z.B. foto_sommer.jpg …" />

    {#if bildQuery.length < 2}
      <div class="text-center py-16 text-muted-foreground text-sm">Mindestens 2 Zeichen eingeben.</div>
    {:else if bildResults.length === 0}
      <div class="text-center py-16 text-muted-foreground text-sm">Kein Treffer — Dateiname prüfen.</div>
    {:else}
      <div class="flex flex-col gap-2.5">
        {#each bildResults as [filename, usages]}
          <Card>
            <CardHeader class="py-3 border-b border-border">
              <span class="text-[12px] font-bold break-all text-foreground">{filename}</span>
            </CardHeader>
            <CardContent class="py-2.5 flex flex-col gap-2">
              {#each usages as u}
                <div class="flex items-center gap-2">
                  <span class="text-[12px] font-mono text-[#2c3e8c] flex-1 truncate">{u.indd}</span>
                  <span class="text-[11px] text-muted-foreground truncate">{u.proj} · {u.name}</span>
                  <Button variant="ghost" size="xs" onclick={() => openFolder(u.folder)}>
                    {copiedPath === u.folder ? 'Pfad kopiert ✓' : (canOpenFiles ? 'Ordner ↗' : 'Pfad kopieren')}
                  </Button>
                </div>
              {/each}
            </CardContent>
          </Card>
        {/each}
      </div>
    {/if}

  {:else}
    <Input
      class="max-w-xl mb-5"
      type="text" bind:value={inddQuery}
      placeholder="INDD suchen, z.B. P260031 oder Layout …" />

    {#if inddQuery.length < 2}
      <div class="text-center py-16 text-muted-foreground text-sm">Mindestens 2 Zeichen eingeben.</div>
    {:else if inddResults.length === 0}
      <div class="text-center py-16 text-muted-foreground text-sm">Kein Treffer — INDD-Namen prüfen.</div>
    {:else}
      <div class="flex flex-col gap-2.5">
        {#each inddResults as [inddName, inddData]}
          <Card>
            <CardHeader class="py-3 border-b border-border">
              <div class="flex items-center gap-2">
                <span class="text-[12px] font-bold break-all text-foreground flex-1">{inddName}</span>
                <Button variant="ghost" size="xs" onclick={() => openFolder(inddData.folder)}>
                  {copiedPath === inddData.folder ? 'Pfad kopiert ✓' : (canOpenFiles ? 'Ordner ↗' : 'Pfad kopieren')}
                </Button>
              </div>
              <span class="text-[11px] text-muted-foreground">
                {inddData.proj} · {inddData.name} · {inddData.links.length} verlinkte Dateien
              </span>
            </CardHeader>
            <CardContent class="py-2.5 flex flex-col gap-1.5">
              {#each inddData.links as img}
                <span class="text-[12px] font-mono text-[#2c3e8c]">{img}</span>
              {/each}
            </CardContent>
          </Card>
        {/each}
      </div>
    {/if}
  {/if}
{/if}
