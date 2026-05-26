import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server/auth';
import { store } from '@/lib/store';
import { runFullScan } from '@/lib/server/scanner';
import { populateStore } from '@/lib/server/scan-store';
import { ensureScanStarted } from '@/lib/server/auto-scan';
import type { Project } from '@/lib/types';

const REFRESH_COOLDOWN_MS = 5 * 60 * 1000;

export async function POST() {
  ensureScanStarted();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (store.scanning) return NextResponse.json({ status: 'already_scanning' });
  if (store.lastScan && (Date.now() - store.lastScan.getTime()) < REFRESH_COOLDOWN_MS) {
    const remaining = Math.ceil((REFRESH_COOLDOWN_MS - (Date.now() - store.lastScan.getTime())) / 60_000);
    return NextResponse.json({ status: 'cooldown', remaining });
  }

  store.scanning = true;
  store.scanStartedAt = Date.now();
  store.scanError = null;
  (async () => {
    const scanStart = Date.now();
    try {
      const projects = await runFullScan() as (Project & { _inddLinks: Record<string, string[]>; _filePaths: string[] })[];
      populateStore(projects, scanStart);
    } catch (err) {
      console.error('[refresh] Scan fehlgeschlagen:', err);
      store.scanError = err instanceof Error ? err.message : 'Unbekannter Fehler';
    } finally {
      store.scanning = false;
      store.scanStartedAt = null;
    }
  })();

  return NextResponse.json({ status: 'scan_started' });
}
