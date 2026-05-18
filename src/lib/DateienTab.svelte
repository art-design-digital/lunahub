<!-- src/lib/DateienTab.svelte -->
<script lang="ts">
  import type { Project } from './types.js';

  let { projects, query }: { projects: Project[]; query: string } = $props();

  type SortMode = 'newest' | 'oldest' | 'alpha';
  type YearFilter = string | 'all';

  let activeTypes: Set<string> = $state(new Set());
  let activeYear: YearFilter = $state('all');
  let showArchiv = $state(false);
  let sortMode: SortMode = $state('newest');

  const DESIGN_LABELS: Record<string, [string, string]> = {
    '.pdf':  ['PDF',  '#c0392b'],
    '.indd': ['INDD', '#2c3e8c'],
    '.ai':   ['AI',   '#e8821a'],
    '.eps':  ['EPS',  '#27ae60'],
    '.psd':  ['PSD',  '#1a6bb5'],
  };

  const EMOJIS: Record<string, string> = {
    '.pdf': '📄', '.indd': '📐', '.ai': '✏️', '.eps': '📋', '.psd': '🖼️'
  };

  let allTypes = $derived([...new Set(projects.flatMap(p => p.files.map(f => f.ext)))].sort());
  let allYears = $derived([...new Set(projects.map(p => p.meta.jahr).filter(Boolean))].sort().reverse());

  let filtered = $derived(
    projects
      .filter(p => showArchiv || !p.isArchiv)
      .filter(p => activeYear === 'all' || p.meta.jahr === activeYear)
      .flatMap(p => {
        const files = p.files.filter(f => {
          if (activeTypes.size > 0 && !activeTypes.has(f.ext)) return false;
          if (!query) return true;
          return f.search.includes(query.toLowerCase());
        });
        return files.length ? [{ ...p, files }] : [];
      })
      .sort((a, b) => {
        if (sortMode === 'alpha') return a.meta.name.localeCompare(b.meta.name);
        const na = parseInt(a.meta.projekt_nr.replace(/\D/g, ''));
        const nb = parseInt(b.meta.projekt_nr.replace(/\D/g, ''));
        return sortMode === 'newest' ? nb - na : na - nb;
      })
  );

  function toggleType(ext: string) {
    if (activeTypes.has(ext)) activeTypes.delete(ext);
    else activeTypes.add(ext);
    activeTypes = new Set(activeTypes);
  }

  const RECENTLY_VIEWED_KEY = 'fo_recently_viewed';
  function getRecentlyViewed(): string[] {
    try { return JSON.parse(localStorage.getItem(RECENTLY_VIEWED_KEY) ?? '[]'); } catch { return []; }
  }
  function trackOpen(folder: string) {
    const recent = getRecentlyViewed().filter(f => f !== folder);
    recent.unshift(folder);
    localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(recent.slice(0, 5)));
  }
</script>

<div class="controls">
  <div class="type-filters">
    {#each allTypes as ext}
      {@const [label, color] = DESIGN_LABELS[ext] ?? [ext.toUpperCase(), '#888']}
      <button
        class="type-btn"
        class:active={activeTypes.has(ext)}
        style="--c:{color}"
        onclick={() => toggleType(ext)}>
        {label}
      </button>
    {/each}
  </div>

  <div class="row2">
    <div class="year-filters">
      <button class:active={activeYear === 'all'} onclick={() => activeYear = 'all'}>Alle Jahre</button>
      {#each allYears as year}
        <button class:active={activeYear === year} onclick={() => activeYear = year}>{year}</button>
      {/each}
    </div>

    <label class="archiv-toggle">
      <input type="checkbox" bind:checked={showArchiv} /> Archiv einblenden
    </label>

    <select bind:value={sortMode}>
      <option value="newest">Neueste zuerst</option>
      <option value="oldest">Älteste zuerst</option>
      <option value="alpha">Alphabetisch</option>
    </select>

    <span class="count">{filtered.reduce((a, p) => a + p.files.length, 0)} Dateien</span>
  </div>
</div>

{#if filtered.length === 0}
  <div class="empty">Keine Ergebnisse gefunden.</div>
{:else}
  {#each filtered as proj}
    <div class="section">
      <div class="section-header">
        {proj.meta.projekt_nr} — {proj.meta.name}
        {#if proj.isArchiv}<span class="archiv-badge">Archiv</span>{/if}
        {#if proj.missingLinks}<span class="missing-badge" title="INDD hat fehlende Links">⚠️</span>{/if}
      </div>
      <div class="grid">
        {#each proj.files as file}
          {@const [label, color] = DESIGN_LABELS[file.ext] ?? [file.ext.toUpperCase(), '#888']}
          <a
            class="card"
            href={`file://${proj.folder}`}
            onclick={() => trackOpen(proj.folder)}>
            {#if file.thumbId}
              <img class="thumb" src={`/api/thumb/${file.thumbId}`} loading="lazy" alt="" />
            {:else}
              <div class="thumb-placeholder">{EMOJIS[file.ext] ?? '📄'}</div>
            {/if}
            <div class="card-body">
              <div class="card-top">
                <span class="proj-nr">{proj.meta.projekt_nr} · {proj.meta.client}</span>
                <span class="badge" style="background:{color}">{label}</span>
              </div>
              <div class="card-name">{proj.meta.name}</div>
              <div class="card-file">{file.name}</div>
              {#if file.datum}<div class="card-date">{file.datum}</div>{/if}
            </div>
          </a>
        {/each}
      </div>
    </div>
  {/each}
{/if}

<style>
  .controls { margin-bottom: 16px; display: flex; flex-direction: column; gap: 8px; }
  .type-filters, .row2 { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .type-btn {
    padding: 4px 10px; border-radius: 4px; border: none;
    font-size: 11px; font-weight: 700; cursor: pointer;
    color: white; background: var(--c); opacity: 0.4; transition: opacity 0.15s;
  }
  .type-btn.active { opacity: 1; }
  .year-filters { display: flex; gap: 4px; }
  .year-filters button {
    padding: 4px 9px; border-radius: 4px; border: 1px solid #ddd;
    font-size: 11px; background: white; cursor: pointer; color: #666;
  }
  .year-filters button.active { background: #1a1a1a; color: white; border-color: #1a1a1a; }
  .archiv-toggle { font-size: 12px; color: #888; display: flex; align-items: center; gap: 5px; }
  select { font-size: 12px; padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; }
  .count { font-size: 12px; color: #999; margin-left: auto; }
  .empty { text-align: center; padding: 80px 20px; color: #bbb; font-size: 16px; }
  .section { margin-top: 24px; }
  .section-header {
    font-size: 11px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.09em; color: #999; margin-bottom: 10px;
    padding-bottom: 5px; border-bottom: 1px solid #ddd;
    display: flex; align-items: center; gap: 8px;
  }
  .archiv-badge { font-size: 10px; background: #f0f0f0; color: #aaa; padding: 1px 6px; border-radius: 3px; }
  .missing-badge { font-size: 13px; }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 12px;
  }
  .card {
    background: white; border-radius: 8px; overflow: hidden;
    box-shadow: 0 1px 4px rgba(0,0,0,0.09);
    transition: transform 0.12s, box-shadow 0.12s;
    display: flex; flex-direction: column;
  }
  .card:hover { transform: translateY(-2px); box-shadow: 0 5px 14px rgba(0,0,0,0.14); }
  .thumb { width: 100%; aspect-ratio: 3/4; object-fit: cover; object-position: top; display: block; }
  .thumb-placeholder {
    width: 100%; aspect-ratio: 3/4;
    display: flex; align-items: center; justify-content: center;
    font-size: 36px; background: #f4f4f4;
  }
  .card-body { padding: 8px 10px 10px; flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .card-top { display: flex; align-items: center; justify-content: space-between; gap: 4px; }
  .proj-nr { font-size: 10px; color: #aaa; font-weight: 500; }
  .badge { font-size: 9px; font-weight: 800; color: white; padding: 2px 5px; border-radius: 3px; }
  .card-name { font-size: 12px; font-weight: 700; line-height: 1.3; margin-top: 2px; }
  .card-file { font-size: 10px; color: #bbb; margin-top: 3px; word-break: break-all; }
  .card-date { font-size: 10px; color: #ccc; margin-top: 2px; }
</style>
