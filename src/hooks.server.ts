// src/hooks.server.ts
import { existsSync } from 'fs';
import { join } from 'path';
import type { Handle } from '@sveltejs/kit';
import { redirect, error } from '@sveltejs/kit';
import { getSessionUser } from '$lib/server/auth.js';
import { db } from '$lib/server/db.js';
import { config } from '$lib/server/config.js';
import { runFullScan, runIncrementalScan } from '$lib/server/scanner.js';
import { populateStore } from '$lib/server/scan-store.js';
import { store } from '$lib/store.js';
import type { Project } from '$lib/types.js';

const MIN_SCAN_INTERVAL_MS = 10 * 60 * 1000; // 10 Minuten Mindestabstand

async function doScan() {
  if (store.scanning) return;
  if (store.lastScan && (Date.now() - store.lastScan.getTime()) < MIN_SCAN_INTERVAL_MS) return;

  // NAS-Erreichbarkeit prüfen bevor Store geleert wird
  const firstClientPath = join(config.volume, config.clients[0]?.folder ?? '');
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

// Singleton-Guard: Scan-Timer nur einmal starten (Vite HMR lädt Modul neu)
const SCAN_WATCHDOG_MS = 60 * 60 * 1000; // 1 Stunde max. Scan-Dauer

if (!(globalThis as any).__foScanStarted) {
  (globalThis as any).__foScanStarted = true;
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

export const handle: Handle = async ({ event, resolve }) => {
  const user = getSessionUser(event);
  event.locals.user = user;
  const isPublicRoute =
    event.url.pathname === '/login' || event.url.pathname === '/logout' || event.url.pathname.startsWith('/auth/');
  if (!user && !isPublicRoute) {
    if (event.url.pathname.startsWith('/api/')) error(401, 'Unauthorized');
    redirect(302, '/login');
  }
  if (user && event.url.pathname === '/login') redirect(302, '/');
  return resolve(event);
};
