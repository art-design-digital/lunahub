import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { store } from '$lib/store.js';
import { runFullScan } from '$lib/server/scanner.js';
import { populateStore } from '$lib/server/scan-store.js';
import type { Project } from '$lib/types.js';

const REFRESH_COOLDOWN_MS = 5 * 60 * 1000;

export const POST: RequestHandler = async ({ locals }) => {
  if (!locals.user) error(401);
  if (store.scanning) return json({ status: 'already_scanning' });
  if (store.lastScan && (Date.now() - store.lastScan.getTime()) < REFRESH_COOLDOWN_MS) {
    const remaining = Math.ceil((REFRESH_COOLDOWN_MS - (Date.now() - store.lastScan.getTime())) / 60_000);
    return json({ status: 'cooldown', remaining });
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

  return json({ status: 'scan_started' });
};
