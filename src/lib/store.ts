// src/lib/store.ts
import type { Project, InddLinkEntry, InddEntry } from './types.js';
import type MiniSearch from 'minisearch';
import type { SearchDoc } from './server/search-index.js';

interface AppStore {
  projects: Project[];
  linksMap: Record<string, InddLinkEntry[]>;   // bildname → INDDs
  inddMap: Record<string, InddEntry>;           // inddname → Bilder
  searchIndex: MiniSearch<SearchDoc> | null;
  lastScan: Date | null;
  scanning: boolean;
}

export const store: AppStore = {
  projects: [],
  linksMap: {},
  inddMap: {},
  searchIndex: null,
  lastScan: null,
  scanning: false,
};
