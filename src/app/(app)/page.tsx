'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import type { Project } from '@/lib/types';
import DateienTab from '@/components/DateienTab';
import VerlinkungsTab from '@/components/VerlinkungsTab';
import TextsucheTab from '@/components/TextsucheTab';
import LinkHealthTab from '@/components/LinkHealthTab';

const TABS = [
  ['dateien', 'Dateien'],
  ['verlinkungen', 'Verlinkungen'],
  ['textsuche', 'Textsuche'],
  ['linkhealth', 'Link Health'],
] as const;

type TabId = typeof TABS[number][0];

function formatLastScan(iso: string | null): string {
  if (!iso) return 'Noch kein Scan';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diff < 1) return 'Gerade eben';
  if (diff < 60) return `vor ${diff} Min.`;
  return `vor ${Math.floor(diff / 60)} Std.`;
}

function formatScanDuration(ms: number | null): string {
  if (ms === null) return '';
  if (ms < 1000) return `(${ms}ms)`;
  return `(${Math.round(ms / 1000)}s)`;
}

export default function AppPage() {
  const [activeTab, setActiveTab] = useState<TabId>('dateien');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [nasOnline, setNasOnline] = useState(true);
  const [smbUrl, setSmbUrl] = useState<string | null>(null);
  const [mountingNas, setMountingNas] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanDuration, setScanDuration] = useState<number | null>(null);
  const [cooldownMsg, setCooldownMsg] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [canOpenFiles, setCanOpenFiles] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [sRes, pRes] = await Promise.all([
          fetch('/api/status'),
          fetch('/api/projects'),
        ]);
        if (sRes.status === 401 || pRes.status === 401) {
          window.location.href = '/login';
          return;
        }
        if (!sRes.ok || !pRes.ok) {
          setLoadError(`Server-Fehler: ${sRes.status}/${pRes.status}`);
          return;
        }
        const s = await sRes.json();
        const p = await pRes.json();
        setNasOnline(s.nasOnline);
        setSmbUrl(s.smbUrl);
        setScanError(s.scanError ?? null);
        setScanDuration(s.scanDuration ?? null);
        setCanOpenFiles(s.canOpenFiles ?? true);
        setLastScan(s.lastScan);
        setProjects(p);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Laden fehlgeschlagen');
      } finally {
        setLoadingProjects(false);
      }
    })();
  }, []);

  const refresh = useCallback(async () => {
    // Baseline aller aktuellen Dateipfade sichern
    try {
      const allPaths = projects.flatMap(p => p.files.map(f => f.filePath)).filter(Boolean);
      if (allPaths.length > 0) localStorage.setItem('fo_scan_baseline', JSON.stringify(allPaths));
    } catch { /* ignore */ }

    setScanning(true);
    try {
      const refreshRes = await fetch('/api/refresh', { method: 'POST' });
      if (refreshRes.status === 401) { window.location.href = '/login'; return; }
      const res = await refreshRes.json();
      if (res.status === 'cooldown') {
        setScanning(false);
        setCooldownMsg(`Bitte ${res.remaining} Min. warten`);
        setTimeout(() => setCooldownMsg(null), 4000);
        return;
      }
    } catch {
      setScanning(false);
      setScanError('Refresh-Anfrage fehlgeschlagen');
      return;
    }
    let pollCount = 0;
    const MAX_POLLS = 150;
    const poll = setInterval(async () => {
      try {
        if (++pollCount > MAX_POLLS) {
          clearInterval(poll);
          setScanning(false);
          setScanError('Scan-Timeout');
          return;
        }
        const sRes = await fetch('/api/status');
        if (sRes.status === 401) { clearInterval(poll); window.location.href = '/login'; return; }
        const s = await sRes.json();
        if (!s.scanning) {
          clearInterval(poll);
          setLastScan(s.lastScan);
          setNasOnline(s.nasOnline);
          setScanError(s.scanError ?? null);
          setScanDuration(s.scanDuration ?? null);
          setScanning(false);
          const pRes = await fetch('/api/projects');
          if (pRes.ok) setProjects(await pRes.json());
        }
      } catch {
        clearInterval(poll);
        setScanning(false);
        setScanError('Status-Abfrage fehlgeschlagen');
      }
    }, 2000);
  }, [projects]);

  const mountNas = useCallback(async () => {
    setMountingNas(true);
    try {
      await fetch('/api/mount-nas', { method: 'POST' });
    } catch { /* ignore */ }
    setTimeout(async () => {
      try {
        const s = await fetch('/api/status').then(r => r.json());
        setNasOnline(s.nasOnline);
      } catch { /* ignore */ }
      setMountingNas(false);
    }, 4000);
  }, []);

  const logout = useCallback(async () => {
    await fetch('/auth/logout', { method: 'POST' }).catch(() => {});
    window.location.href = '/login';
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-[#F5F5F5]">
      {/* Header */}
      <header className="bg-[#3A3A3A] text-white sticky top-0 z-50 shadow-md">
        <div className="flex items-center gap-4 px-5 py-0 h-14">
          {/* Logo */}
          <Image src="/logo.png" alt="art&design" width={140} height={28} className="h-7 w-auto brightness-0 invert shrink-0" priority />

          {/* Divider */}
          <div className="w-px h-6 bg-white/20 shrink-0" />

          {/* Tab nav */}
          <nav className="flex gap-0.5">
            {TABS.map(([id, label]) => (
              <button
                key={id}
                className={`px-3.5 py-1.5 rounded text-xs font-medium cursor-pointer transition-all border-0 ${
                  activeTab === id
                    ? 'bg-[#890813] text-white'
                    : 'bg-transparent text-white/60 hover:text-white hover:bg-white/10'
                }`}
                onClick={() => setActiveTab(id)}>
                {label}
              </button>
            ))}
          </nav>

          {/* Search */}
          {activeTab === 'dateien' && (
            <input
              className="flex-1 min-w-[180px] max-w-[380px] h-8 bg-white/10 border border-white/15 text-white text-sm rounded-md px-3 placeholder:text-white/35 focus:bg-white/15 focus:border-white/30 focus:ring-1 focus:ring-[#890813] focus:outline-none"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Suchen: Artikel, Projekt-Nr., Format …"
            />
          )}

          {/* Right */}
          <div className="flex items-center gap-2 ml-auto">
            {!nasOnline && smbUrl ? (
              <button
                className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-400/30 cursor-pointer transition-colors disabled:opacity-50"
                onClick={mountNas} disabled={mountingNas}>
                {mountingNas ? '⏳' : '⚠'} NAS verbinden
              </button>
            ) : !nasOnline ? (
              <span className="text-xs text-amber-300">⚠ NAS offline</span>
            ) : null}

            <button
              className="text-white/50 hover:text-white text-lg leading-none p-1.5 bg-transparent border-0 cursor-pointer transition-colors rounded hover:bg-white/10 disabled:opacity-30"
              onClick={refresh} disabled={scanning} title="Index neu aufbauen">
              {scanning ? '⏳' : '↻'}
            </button>
            {cooldownMsg && (
              <span className="text-xs text-amber-300 whitespace-nowrap">{cooldownMsg}</span>
            )}
            {scanError && (
              <span className="text-xs text-red-400 cursor-default select-none" title={scanError}>⚠</span>
            )}
            <span className="text-xs text-white/35 whitespace-nowrap hidden lg:block">
              {formatLastScan(lastScan)}{scanDuration ? ` ${formatScanDuration(scanDuration)}` : ''}
            </span>
            <button
              className="text-xs text-white/40 hover:text-white/70 bg-transparent border-0 cursor-pointer px-2 py-1 rounded hover:bg-white/10 transition-colors"
              onClick={logout}>
              Abmelden
            </button>
          </div>
        </div>

        <div className="h-px bg-white/10" />
      </header>

      {/* Content */}
      <main className="flex-1 px-5 py-5 pb-16 max-w-screen-2xl mx-auto w-full">
        {loadError ? (
          <div className="text-center py-20 text-red-600">Fehler: {loadError}</div>
        ) : loadingProjects ? (
          <div className="text-center py-20 text-muted-foreground">Projekte laden...</div>
        ) : activeTab === 'dateien' ? (
          <DateienTab projects={projects} query={searchQuery} canOpenFiles={canOpenFiles} />
        ) : activeTab === 'verlinkungen' ? (
          <VerlinkungsTab canOpenFiles={canOpenFiles} />
        ) : activeTab === 'textsuche' ? (
          <TextsucheTab canOpenFiles={canOpenFiles} />
        ) : (
          <LinkHealthTab canOpenFiles={canOpenFiles} />
        )}
      </main>
    </div>
  );
}
