'use client';

import { useState, useEffect, useCallback } from 'react';
import type { InddLinkEntry } from '@/lib/types';

interface LinkHealthTabProps {
  canOpenFiles?: boolean;
}

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

export default function LinkHealthTab({ canOpenFiles = true }: LinkHealthTabProps) {
  const [loaded, setLoaded] = useState(false);
  const [projectsWithMissing, setProjectsWithMissing] = useState<ProjectWithMissing[]>([]);
  const [topImages, setTopImages] = useState<TopImage[]>([]);
  const [stats, setStats] = useState<Stats>({ totalIndds: 0, totalLinks: 0, inddsWithIssues: 0 });
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetch('/api/link-health').then(r => r.json());
        setProjectsWithMissing(data.projectsWithMissing);
        setTopImages(data.topImages);
        setStats(data.stats);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Laden fehlgeschlagen');
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

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
    return <div className="text-center py-16 text-muted-foreground">Lade Link Health …</div>;
  }

  if (loadError) {
    return <div className="text-center py-16 text-red-600">Fehler: {loadError}</div>;
  }

  return (
    <>
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-6 max-w-2xl">
        <div className="rounded-lg border border-border bg-background px-4 py-3">
          <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">INDDs gesamt</div>
          <div className="text-2xl font-bold text-foreground">{stats.totalIndds}</div>
        </div>
        <div className="rounded-lg border border-border bg-background px-4 py-3">
          <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">Links gesamt</div>
          <div className="text-2xl font-bold text-foreground">{stats.totalLinks}</div>
        </div>
        <div className={`rounded-lg border bg-background px-4 py-3 ${stats.inddsWithIssues > 0 ? 'border-[#890813]/40 bg-[#890813]/5' : 'border-border'}`}>
          <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">Fehlende Links</div>
          <div className={`text-2xl font-bold ${stats.inddsWithIssues > 0 ? 'text-[#890813]' : 'text-foreground'}`}>{stats.inddsWithIssues}</div>
        </div>
      </div>

      {/* Projects with missing links */}
      <div className="mb-8">
        <h2 className="text-[13px] font-semibold text-foreground mb-3">
          Projekte mit fehlenden Links
          {projectsWithMissing.length > 0 && (
            <span className="ml-1.5 text-[11px] font-normal text-[#890813]">{projectsWithMissing.length} Projekte</span>
          )}
        </h2>

        {projectsWithMissing.length === 0 ? (
          <div className="text-[12px] text-muted-foreground py-6 text-center border border-dashed border-border rounded-lg">
            Keine fehlenden Links gefunden.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {projectsWithMissing.map(project => (
              <div key={project.id} className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="py-2.5 px-4 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <span className="text-[12px] font-bold text-foreground">{project.projektnr}</span>
                    <span className="text-[11px] text-muted-foreground ml-2 truncate">{project.name}</span>
                  </div>
                  <button
                    className="text-xs px-2 py-1 rounded-md bg-transparent hover:bg-muted border-0 cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => openFolder(project.folder)}>
                    {copiedPath === project.folder ? 'Pfad kopiert ✓' : (canOpenFiles ? 'Ordner ↗' : 'Pfad kopieren')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Most-used images */}
      <div>
        <h2 className="text-[13px] font-semibold text-foreground mb-3">
          Meistverwendete Bilder
          <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">Top 20</span>
        </h2>

        {topImages.length === 0 ? (
          <div className="text-[12px] text-muted-foreground py-6 text-center border border-dashed border-border rounded-lg">
            Keine verlinkten Bilder gefunden.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {topImages.map(img => (
              <div key={img.name} className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="py-2.5 px-4 border-b border-border">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-bold break-all text-foreground flex-1">{img.name}</span>
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap">{img.count} {img.count === 1 ? 'INDD' : 'INDDs'}</span>
                  </div>
                </div>
                <div className="py-2 px-4 flex flex-wrap gap-x-4 gap-y-1">
                  {img.usages.map((u, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <span className="text-[11px] font-mono text-[#2c3e8c] truncate max-w-[220px]">{u.indd}</span>
                      <span className="text-[11px] text-muted-foreground">·</span>
                      <span className="text-[11px] text-muted-foreground">{u.proj}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
