'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { InddLinkEntry, InddEntry } from '@/lib/types';

interface VerlinkungsTabProps {
  canOpenFiles?: boolean;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[\u2010-\u2015\u2212\u00ad]/g, '-');
}

export default function VerlinkungsTab({ canOpenFiles = true }: VerlinkungsTabProps) {
  const [linksMap, setLinksMap] = useState<Record<string, InddLinkEntry[]>>({});
  const [inddMap, setInddMap] = useState<Record<string, InddEntry>>({});
  const [loaded, setLoaded] = useState(false);
  const [activeSubtab, setActiveSubtab] = useState<'bild' | 'indd'>('bild');
  const [bildQuery, setBildQuery] = useState('');
  const [inddQuery, setInddQuery] = useState('');
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [links, indd] = await Promise.all([
          fetch('/api/links').then(r => r.json()),
          fetch('/api/indd').then(r => r.json()),
        ]);
        setLinksMap(links);
        setInddMap(indd);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Laden fehlgeschlagen');
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const bildResults = useMemo(() =>
    bildQuery.length >= 2
      ? Object.entries(linksMap).filter(([k]) => norm(k).includes(norm(bildQuery)))
      : [],
    [linksMap, bildQuery]
  );

  const inddResults = useMemo(() =>
    inddQuery.length >= 2
      ? Object.entries(inddMap).filter(([k]) => norm(k).includes(norm(inddQuery)))
      : [],
    [inddMap, inddQuery]
  );

  const openFolder = useCallback(async (folder: string) => {
    if (!canOpenFiles) {
      try {
        await navigator.clipboard.writeText(folder);
        setCopiedPath(folder);
        setTimeout(() => setCopiedPath(null), 1500);
      } catch { /* ignore */ }
      return;
    }
    await fetch('/api/open-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder }),
    });
  }, [canOpenFiles]);

  if (!loaded) {
    return <div className="text-center py-16 text-muted-foreground">Lade Verlinkungen …</div>;
  }

  if (loadError) {
    return <div className="text-center py-16 text-red-600">Fehler: {loadError}</div>;
  }

  return (
    <>
      {/* Subtab bar */}
      <div className="flex gap-0.5 bg-muted rounded-lg p-0.5 w-fit mb-5">
        <button
          className={`px-3.5 py-1.5 rounded-md text-xs font-medium cursor-pointer border-0 transition-colors ${activeSubtab === 'bild' ? 'bg-background shadow-sm text-foreground' : 'bg-transparent text-muted-foreground hover:text-foreground'}`}
          onClick={() => setActiveSubtab('bild')}>
          Bild → INDDs
        </button>
        <button
          className={`px-3.5 py-1.5 rounded-md text-xs font-medium cursor-pointer border-0 transition-colors ${activeSubtab === 'indd' ? 'bg-background shadow-sm text-foreground' : 'bg-transparent text-muted-foreground hover:text-foreground'}`}
          onClick={() => setActiveSubtab('indd')}>
          INDD → Bilder
        </button>
      </div>

      {activeSubtab === 'bild' ? (
        <>
          <input
            className="flex h-9 w-full max-w-xl rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring mb-5"
            type="text" value={bildQuery} onChange={(e) => setBildQuery(e.target.value)}
            placeholder="Bildname suchen, z.B. foto_sommer.jpg …" />

          {bildQuery.length < 2 ? (
            <div className="text-center py-16 text-muted-foreground text-sm">Mindestens 2 Zeichen eingeben.</div>
          ) : bildResults.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground text-sm">Kein Treffer — Dateiname prüfen.</div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {bildResults.map(([filename, usages]) => (
                <div key={filename} className="rounded-xl border border-border bg-card overflow-hidden">
                  <div className="py-3 px-4 border-b border-border">
                    <span className="text-[12px] font-bold break-all text-foreground">{filename}</span>
                  </div>
                  <div className="py-2.5 px-4 flex flex-col gap-2">
                    {usages.map((u, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-[12px] font-mono text-[#2c3e8c] flex-1 truncate">{u.indd}</span>
                        <span className="text-[11px] text-muted-foreground truncate">{u.proj} · {u.name}</span>
                        <button
                          className="text-xs px-2 py-1 rounded-md bg-transparent hover:bg-muted border-0 cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => openFolder(u.folder)}>
                          {copiedPath === u.folder ? 'Pfad kopiert ✓' : (canOpenFiles ? 'Ordner ↗' : 'Pfad kopieren')}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <input
            className="flex h-9 w-full max-w-xl rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring mb-5"
            type="text" value={inddQuery} onChange={(e) => setInddQuery(e.target.value)}
            placeholder="INDD suchen, z.B. P260031 oder Layout …" />

          {inddQuery.length < 2 ? (
            <div className="text-center py-16 text-muted-foreground text-sm">Mindestens 2 Zeichen eingeben.</div>
          ) : inddResults.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground text-sm">Kein Treffer — INDD-Namen prüfen.</div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {inddResults.map(([inddName, inddData]) => (
                <div key={inddName} className="rounded-xl border border-border bg-card overflow-hidden">
                  <div className="py-3 px-4 border-b border-border">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-bold break-all text-foreground flex-1">{inddName}</span>
                      <button
                        className="text-xs px-2 py-1 rounded-md bg-transparent hover:bg-muted border-0 cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => openFolder(inddData.folder)}>
                        {copiedPath === inddData.folder ? 'Pfad kopiert ✓' : (canOpenFiles ? 'Ordner ↗' : 'Pfad kopieren')}
                      </button>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {inddData.proj} · {inddData.name} · {inddData.links.length} verlinkte Dateien
                    </span>
                  </div>
                  <div className="py-2.5 px-4 flex flex-col gap-1.5">
                    {inddData.links.map((img, i) => (
                      <span key={i} className="text-[12px] font-mono text-[#2c3e8c]">{img}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
