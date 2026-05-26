// src/lib/store.ts
// globalThis ensures a true singleton in Vite dev mode (SSR modules re-evaluated per request)
import type { Project, InddLinkEntry, InddEntry } from './types.js';
import type MiniSearch from 'minisearch';
import type { SearchDoc } from './server/search-index.js';

interface AppStore {
  projects: Project[];
  linksMap: Record<string, InddLinkEntry[]>;   // bildname → INDDs
  inddMap: Record<string, InddEntry>;           // inddname → Bilder
  thumbMap: Map<string, string>;               // thumbId → filePath
  textMap: Map<string, string>;                // filePath → textContent (for snippets)
  searchIndex: MiniSearch<SearchDoc> | null;
  lastScan: Date | null;
  scanning: boolean;
  scanStartedAt: number | null;                // Timestamp when current scan started
  scanError: string | null;
  scanDuration: number | null;
}

declare global {
  // eslint-disable-next-line no-var
  var __foStore: AppStore | undefined;
}

if (!globalThis.__foStore) {
  globalThis.__foStore = {
    projects: [],
    linksMap: {},
    inddMap: {},
    thumbMap: new Map(),
    textMap: new Map(),
    searchIndex: null,
    lastScan: null,
    scanning: false,
    scanStartedAt: null,
    scanError: null,
    scanDuration: null,
  };
}

export const store: AppStore = globalThis.__foStore;
