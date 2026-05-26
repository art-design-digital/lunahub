// src/lib/server/auto-scan.ts
// Auto-scan timer — replaces the SvelteKit hooks.server.ts scan logic
// Called lazily when the first API request comes in.
// IMPORTANT: Next.js must run in single-worker mode (default for `next start`).
// Multi-worker setups would cause parallel scans and split globalThis state.
import { existsSync } from 'fs';
import { join } from 'path';
import { config } from './config';
import { runFullScan, runIncrementalScan } from './scanner';
import { populateStore } from './scan-store';
import { store } from '@/lib/store';
import { db } from './db';
import type { Project } from '@/lib/types';

const MIN_SCAN_INTERVAL_MS = 10 * 60 * 1000; // 10 Minuten Mindestabstand
const SCAN_WATCHDOG_MS = 60 * 60 * 1000; // 1 Stunde max. Scan-Dauer

async function doScan() {
  if (store.scanning) return;
  if (store.lastScan && (Date.now() - store.lastScan.getTime()) < MIN_SCAN_INTERVAL_MS) return;

  // Skip scan if config has no clients (fallback config)
  if (config.clients.length === 0) {
    console.log('[scan] Keine Clients konfiguriert – übersprungen');
    return;
  }

  // NAS-Erreichbarkeit prüfen bevor Store geleert wird
  const firstClientPath = join(config.volume, config.clients[0].folder);
  if (!existsSync(firstClientPath)) {
    console.log('[scan] NAS nicht erreichbar – übersprungen');
    return;
  }

  const isIncremental = store.projects.length > 0;
  store.scanning = true;
  store.scanStartedAt = Date.now();
  store.scanError = null;
  if (!isIncremental) {
    // Alten Store leeren um Heap freizugeben vor dem ersten / vollen Scan
    store.projects = [];
    store.linksMap = {};
    store.inddMap = {};
    store.searchIndex = null;
  }
  const scanStart = Date.now();
  console.log(`[scan] Start... (${isIncremental ? 'inkrementell' : 'voll'})`);
  try {
    const projects = (isIncremental
      ? await runIncrementalScan(store.projects)
      : await runFullScan()
    ) as (Project & { _inddLinks: Record<string, string[]>; _filePaths: string[] })[];
    console.log(`[scan] ${projects.length} Projekte gefunden`);

    populateStore(projects, scanStart);
    if (store.lastScan) {
      console.log(`[scan] Fertig. Letzter Scan: ${store.lastScan.toISOString()} (${store.scanDuration}ms)`);
    }
  } catch (err) {
    store.scanError = err instanceof Error ? err.message : 'Unbekannter Fehler';
    console.error('[scan] Fehler:', store.scanError);
  } finally {
    store.scanning = false;
    store.scanStartedAt = null;
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __foScanStarted: boolean | undefined;
}

export function ensureScanStarted(): void {
  if (globalThis.__foScanStarted) return;
  globalThis.__foScanStarted = true;

  setTimeout(doScan, 1000);
  setInterval(() => {
    // Watchdog: Reset stuck scanning flag
    if (store.scanning && store.scanStartedAt && (Date.now() - store.scanStartedAt) > SCAN_WATCHDOG_MS) {
      console.error('[scan] Watchdog: scanning flag stuck for >1h, resetting');
      store.scanning = false;
      store.scanStartedAt = null;
    }
    doScan();
    db.deleteExpiredSessions();
  }, 30 * 60 * 1000);
}
