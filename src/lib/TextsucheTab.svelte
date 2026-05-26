<!-- src/lib/TextsucheTab.svelte -->
<script lang="ts">
  import { Input } from '$lib/components/ui/input/index.js';

  let { canOpenFiles = true }: { canOpenFiles?: boolean } = $props();

  let query = $state('');
  let results: Array<{
    id: string; fileName: string; projectName: string;
    projektnr: string; folder: string; ext: string;
    snippet: string | null;
  }> = $state([]);
  let searched = $state(false);
  let copiedPath: string | null = $state(null);

  const BADGE_COLORS: Record<string, string> = {
    '.pdf': '#c0392b', '.indd': '#2c3e8c', '.ai': '#e8821a', '.eps': '#27ae60', '.psd': '#1a6bb5',
  };

  let searchError: string | null = $state(null);
  let debounceTimer: ReturnType<typeof setTimeout>;

  $effect(() => {
    const q = query.trim();
    clearTimeout(debounceTimer);
    if (q.length < 2) {
      results = [];
      searched = false;
      searchError = null;
      return;
    }
    debounceTimer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        results = await res.json();
        searched = true;
        searchError = null;
      } catch {
        searchError = 'Suche fehlgeschlagen';
        searched = true;
      }
    }, 200);
    return () => clearTimeout(debounceTimer);
  });

  function highlightSnippet(snippet: string, q: string): Array<{ text: string; bold: boolean }> {
    const terms = q.toLowerCase().split(/\s+/).filter(t => t.length >= 2);
    if (terms.length === 0) return [{ text: snippet, bold: false }];
    const pattern = new RegExp(`(${terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
    const parts: Array<{ text: string; bold: boolean }> = [];
    let lastIndex = 0;
    for (const match of snippet.matchAll(pattern)) {
      if (match.index > lastIndex) parts.push({ text: snippet.slice(lastIndex, match.index), bold: false });
      parts.push({ text: match[0], bold: true });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < snippet.length) parts.push({ text: snippet.slice(lastIndex), bold: false });
    return parts.length > 0 ? parts : [{ text: snippet, bold: false }];
  }

  async function openFile(filePath: string) {
    if (!canOpenFiles) {
      try {
        await navigator.clipboard.writeText(filePath);
        copiedPath = filePath;
        setTimeout(() => { copiedPath = null; }, 1500);
      } catch { /* ignore */ }
      return;
    }
    await fetch('/api/open-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath }),
    });
  }
</script>

<div class="max-w-2xl">
  <Input
    type="text" bind:value={query}
    placeholder="Produktnummer, Text, Artikel …"
    class="h-9 text-base mb-2" />

  <p class="text-xs text-muted-foreground mb-5">
    Durchsucht PDF-Text und INDD-Strings. Ergebnisse erscheinen beim Tippen.
  </p>

  {#if copiedPath}
    <div class="mb-3 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
      Pfad kopiert
    </div>
  {/if}

  {#if searchError}
    <div class="text-center py-16 text-red-600">{searchError}</div>
  {:else if query.trim().length >= 2 && searched && results.length === 0}
    <div class="text-center py-16 text-muted-foreground">Kein Treffer.</div>
  {:else if results.length > 0}
    <div class="flex flex-col gap-2">
      {#each results as r}
        {@const color = BADGE_COLORS[r.ext] ?? '#888'}
        <div
          class="group flex items-center bg-card rounded-xl ring-1 ring-foreground/10
                 hover:ring-foreground/20 hover:shadow-md transition-all duration-150
                 overflow-hidden">
          <div class="w-[3px] self-stretch shrink-0" style="background:{color}"></div>
          <button
            class="flex items-center gap-2 px-3 py-2.5 flex-1 min-w-0 border-0 bg-transparent
                   cursor-pointer text-left"
            onclick={() => openFile(r.id)}
            title={canOpenFiles ? 'Datei öffnen' : 'Dateipfad kopieren'}>
            <div class="flex flex-col gap-0.5 min-w-0 flex-1">
              <span class="text-[11px] text-muted-foreground truncate">{r.projektnr} · {r.projectName}</span>
              <div class="text-[13px] font-semibold text-foreground truncate">{r.fileName}</div>
              {#if r.snippet}
                <span class="text-[10px] text-muted-foreground/70 truncate font-mono">
                  {#each highlightSnippet(r.snippet, query) as part}
                    {#if part.bold}<strong class="text-foreground font-bold">{part.text}</strong>{:else}{part.text}{/if}
                  {/each}
                </span>
              {/if}
            </div>
            <span
              class="text-[9px] font-extrabold text-white px-1.5 py-0.5 rounded-md shrink-0"
              style="background:{color}">
              {r.ext.toUpperCase().slice(1)}
            </span>
          </button>
          <button
            class="text-[11px] text-muted-foreground hover:text-[#890813] font-medium
                   px-2 py-2.5 bg-transparent border-0 cursor-pointer transition-colors
                   opacity-0 group-hover:opacity-100 shrink-0"
            onclick={() => { navigator.clipboard.writeText(r.id); copiedPath = r.id; setTimeout(() => copiedPath = null, 1500); }}
            title="Dateipfad kopieren">
            {copiedPath === r.id ? '\u2713' : '\u2398'}
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>
