'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface TextsucheTabProps {
  canOpenFiles?: boolean;
}

interface SearchResult {
  id: string;
  fileName: string;
  projectName: string;
  projektnr: string;
  folder: string;
  ext: string;
  snippet: string | null;
}

const BADGE_COLORS: Record<string, string> = {
  '.pdf': '#c0392b', '.indd': '#2c3e8c', '.ai': '#e8821a', '.eps': '#27ae60', '.psd': '#1a6bb5',
};

function highlightSnippet(snippet: string, q: string): Array<{ text: string; bold: boolean }> {
  const terms = q.toLowerCase().split(/\s+/).filter(t => t.length >= 2);
  if (terms.length === 0) return [{ text: snippet, bold: false }];
  const pattern = new RegExp(`(${terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  const parts: Array<{ text: string; bold: boolean }> = [];
  let lastIndex = 0;
  for (const match of snippet.matchAll(pattern)) {
    if (match.index! > lastIndex) parts.push({ text: snippet.slice(lastIndex, match.index!), bold: false });
    parts.push({ text: match[0], bold: true });
    lastIndex = match.index! + match[0].length;
  }
  if (lastIndex < snippet.length) parts.push({ text: snippet.slice(lastIndex), bold: false });
  return parts.length > 0 ? parts : [{ text: snippet, bold: false }];
}

export default function TextsucheTab({ canOpenFiles = true }: TextsucheTabProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const q = query.trim();
    clearTimeout(debounceRef.current);
    if (q.length < 2) {
      setResults([]);
      setSearched(false);
      setSearchError(null);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        setResults(await res.json());
        setSearched(true);
        setSearchError(null);
      } catch {
        setSearchError('Suche fehlgeschlagen');
        setSearched(true);
      }
    }, 200);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const openFile = useCallback(async (filePath: string) => {
    if (!canOpenFiles) {
      try {
        await navigator.clipboard.writeText(filePath);
        setCopiedPath(filePath);
        setTimeout(() => setCopiedPath(null), 1500);
      } catch { /* ignore */ }
      return;
    }
    await fetch('/api/open-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath }),
    });
  }, [canOpenFiles]);

  return (
    <div className="max-w-2xl">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Produktnummer, Text, Artikel …"
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring mb-2"
      />

      <p className="text-xs text-muted-foreground mb-5">
        Durchsucht PDF-Text und INDD-Strings. Ergebnisse erscheinen beim Tippen.
      </p>

      {copiedPath && (
        <div className="mb-3 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          Pfad kopiert
        </div>
      )}

      {searchError ? (
        <div className="text-center py-16 text-red-600">{searchError}</div>
      ) : query.trim().length >= 2 && searched && results.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">Kein Treffer.</div>
      ) : results.length > 0 ? (
        <div className="flex flex-col gap-2">
          {results.map(r => {
            const color = BADGE_COLORS[r.ext] ?? '#888';
            return (
              <div
                key={r.id}
                className="group flex items-center bg-card rounded-xl ring-1 ring-foreground/10 hover:ring-foreground/20 hover:shadow-md transition-all duration-150 overflow-hidden">
                <div className="w-[3px] self-stretch shrink-0" style={{ background: color }} />
                <button
                  className="flex items-center gap-2 px-3 py-2.5 flex-1 min-w-0 border-0 bg-transparent cursor-pointer text-left"
                  onClick={() => openFile(r.id)}
                  title={canOpenFiles ? 'Datei öffnen' : 'Dateipfad kopieren'}>
                  <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                    <span className="text-[11px] text-muted-foreground truncate">{r.projektnr} · {r.projectName}</span>
                    <div className="text-[13px] font-semibold text-foreground truncate">{r.fileName}</div>
                    {r.snippet && (
                      <span className="text-[10px] text-muted-foreground/70 truncate font-mono">
                        {highlightSnippet(r.snippet, query).map((part, i) =>
                          part.bold
                            ? <strong key={i} className="text-foreground font-bold">{part.text}</strong>
                            : <span key={i}>{part.text}</span>
                        )}
                      </span>
                    )}
                  </div>
                  <span
                    className="text-[9px] font-extrabold text-white px-1.5 py-0.5 rounded-md shrink-0"
                    style={{ background: color }}>
                    {r.ext.toUpperCase().slice(1)}
                  </span>
                </button>
                <button
                  className="text-[11px] text-muted-foreground hover:text-[#890813] font-medium px-2 py-2.5 bg-transparent border-0 cursor-pointer transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                  onClick={() => { navigator.clipboard.writeText(r.id); setCopiedPath(r.id); setTimeout(() => setCopiedPath(null), 1500); }}
                  title="Dateipfad kopieren">
                  {copiedPath === r.id ? '\u2713' : '\u2398'}
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
