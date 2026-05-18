<!-- src/lib/TextsucheTab.svelte -->
<script lang="ts">
  let query = $state('');
  let results: Array<{
    fileName: string; projectName: string;
    projektnr: string; folder: string; ext: string;
  }> = $state([]);
  let searching = $state(false);
  let searched = $state(false);

  const BADGE_COLORS: Record<string, string> = {
    '.pdf': '#c0392b', '.indd': '#2c3e8c',
  };

  async function search() {
    if (query.trim().length < 2) return;
    searching = true;
    searched = false;
    const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
    results = await res.json();
    searching = false;
    searched = true;
  }
</script>

<div class="wrap">
  <form onsubmit={(e) => { e.preventDefault(); search(); }} class="search-form">
    <input
      type="text" bind:value={query}
      placeholder="Produktnummer, Text, Artikel …"
      autofocus />
    <button type="submit" disabled={searching || query.length < 2}>
      {searching ? '…' : 'Suchen'}
    </button>
  </form>

  <p class="hint">Durchsucht PDF-Text (zuverlässig) und INDD-Strings (best-effort).</p>

  {#if searching}
    <div class="empty">Suche läuft …</div>
  {:else if searched && results.length === 0}
    <div class="empty">Kein Treffer für „{query}".</div>
  {:else if results.length > 0}
    <div class="results">
      {#each results as r}
        <a class="result-card" href={`file://${r.folder}`}>
          <div class="result-top">
            <span class="proj">{r.projektnr} · {r.projectName}</span>
            <span class="badge" style="background:{BADGE_COLORS[r.ext] ?? '#888'}">
              {r.ext.toUpperCase().slice(1)}
            </span>
          </div>
          <div class="filename">{r.fileName}</div>
        </a>
      {/each}
    </div>
  {/if}
</div>

<style>
  .wrap { max-width: 700px; }
  .search-form { display: flex; gap: 8px; margin-bottom: 8px; }
  input {
    flex: 1; padding: 10px 14px; border: 1px solid #ddd;
    border-radius: 6px; font-size: 15px; outline: none;
  }
  input:focus { border-color: #1a1a1a; }
  button {
    padding: 10px 20px; background: #1a1a1a; color: white;
    border: none; border-radius: 6px; font-size: 14px;
    font-weight: 600; cursor: pointer;
  }
  button:disabled { opacity: 0.4; cursor: default; }
  .hint { font-size: 11px; color: #aaa; margin-bottom: 20px; }
  .empty { text-align: center; padding: 60px; color: #bbb; }
  .results { display: flex; flex-direction: column; gap: 8px; }
  .result-card {
    background: white; border-radius: 8px; padding: 12px 16px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.09);
    display: flex; flex-direction: column; gap: 4px;
    transition: box-shadow 0.12s;
  }
  .result-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.14); }
  .result-top { display: flex; align-items: center; justify-content: space-between; }
  .proj { font-size: 11px; color: #aaa; }
  .badge { font-size: 9px; font-weight: 800; color: white; padding: 2px 5px; border-radius: 3px; }
  .filename { font-size: 13px; font-weight: 600; color: #333; font-family: monospace; }
</style>
