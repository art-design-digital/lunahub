<!-- src/lib/LinkHealthTab.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { InddLinkEntry } from './types.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Card, CardContent, CardHeader } from '$lib/components/ui/card/index.js';

  interface ProjectWithMissing {
    id: string;
    name: string;
    projektnr: string;
    folder: string;
  }

  interface TopImage {
    name: string;
    count: number;
    usages: InddLinkEntry[];
  }

  interface Stats {
    totalIndds: number;
    totalLinks: number;
    inddsWithIssues: number;
  }

  let { canOpenFiles = true }: { canOpenFiles?: boolean } = $props();

  let loaded = $state(false);
  let projectsWithMissing = $state<ProjectWithMissing[]>([]);
  let topImages = $state<TopImage[]>([]);
  let stats = $state<Stats>({ totalIndds: 0, totalLinks: 0, inddsWithIssues: 0 });
  let copiedPath: string | null = $state(null);
  let loadError: string | null = $state(null);

  onMount(async () => {
    try {
      const data = await fetch('/api/link-health').then(r => r.json());
      projectsWithMissing = data.projectsWithMissing;
      topImages = data.topImages;
      stats = data.stats;
    } catch (err) {
      loadError = err instanceof Error ? err.message : 'Laden fehlgeschlagen';
    } finally {
      loaded = true;
    }
  });

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
</script>

{#if !loaded}
  <div class="text-center py-16 text-muted-foreground">Lade Link Health …</div>
{:else if loadError}
  <div class="text-center py-16 text-red-600">Fehler: {loadError}</div>
{:else}
  <!-- Summary cards -->
  <div class="grid grid-cols-3 gap-3 mb-6 max-w-2xl">
    <div class="rounded-lg border border-border bg-background px-4 py-3">
      <div class="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">INDDs gesamt</div>
      <div class="text-2xl font-bold text-foreground">{stats.totalIndds}</div>
    </div>
    <div class="rounded-lg border border-border bg-background px-4 py-3">
      <div class="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">Links gesamt</div>
      <div class="text-2xl font-bold text-foreground">{stats.totalLinks}</div>
    </div>
    <div class="rounded-lg border border-border bg-background px-4 py-3 {stats.inddsWithIssues > 0 ? 'border-[#890813]/40 bg-[#890813]/5' : ''}">
      <div class="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">Fehlende Links</div>
      <div class="text-2xl font-bold {stats.inddsWithIssues > 0 ? 'text-[#890813]' : 'text-foreground'}">{stats.inddsWithIssues}</div>
    </div>
  </div>

  <!-- Projects with missing links -->
  <div class="mb-8">
    <h2 class="text-[13px] font-semibold text-foreground mb-3">
      Projekte mit fehlenden Links
      {#if projectsWithMissing.length > 0}
        <span class="ml-1.5 text-[11px] font-normal text-[#890813]">{projectsWithMissing.length} Projekte</span>
      {/if}
    </h2>

    {#if projectsWithMissing.length === 0}
      <div class="text-[12px] text-muted-foreground py-6 text-center border border-dashed border-border rounded-lg">
        Keine fehlenden Links gefunden.
      </div>
    {:else}
      <div class="flex flex-col gap-2">
        {#each projectsWithMissing as project}
          <Card>
            <CardContent class="py-2.5 flex items-center gap-2">
              <div class="flex-1 min-w-0">
                <span class="text-[12px] font-bold text-foreground">{project.projektnr}</span>
                <span class="text-[11px] text-muted-foreground ml-2 truncate">{project.name}</span>
              </div>
              <Button variant="ghost" size="xs" onclick={() => openFolder(project.folder)}>
                {copiedPath === project.folder ? 'Pfad kopiert ✓' : (canOpenFiles ? 'Ordner ↗' : 'Pfad kopieren')}
              </Button>
            </CardContent>
          </Card>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Most-used images -->
  <div>
    <h2 class="text-[13px] font-semibold text-foreground mb-3">
      Meistverwendete Bilder
      <span class="ml-1.5 text-[11px] font-normal text-muted-foreground">Top 20</span>
    </h2>

    {#if topImages.length === 0}
      <div class="text-[12px] text-muted-foreground py-6 text-center border border-dashed border-border rounded-lg">
        Keine verlinkten Bilder gefunden.
      </div>
    {:else}
      <div class="flex flex-col gap-2">
        {#each topImages as img}
          <Card>
            <CardHeader class="py-2.5 border-b border-border">
              <div class="flex items-center gap-2">
                <span class="text-[12px] font-bold break-all text-foreground flex-1">{img.name}</span>
                <span class="text-[11px] text-muted-foreground whitespace-nowrap">{img.count} {img.count === 1 ? 'INDD' : 'INDDs'}</span>
              </div>
            </CardHeader>
            <CardContent class="py-2 flex flex-wrap gap-x-4 gap-y-1">
              {#each img.usages as u}
                <div class="flex items-center gap-1.5">
                  <span class="text-[11px] font-mono text-[#2c3e8c] truncate max-w-[220px]">{u.indd}</span>
                  <span class="text-[11px] text-muted-foreground">·</span>
                  <span class="text-[11px] text-muted-foreground">{u.proj}</span>
                </div>
              {/each}
            </CardContent>
          </Card>
        {/each}
      </div>
    {/if}
  </div>
{/if}
