import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { store } from '$lib/store.js';
import { runFullScan } from '$lib/server/scanner.js';
import { buildSearchIndex } from '$lib/server/search-index.js';
import type { Project, InddLinkEntry, InddEntry } from '$lib/types.js';

export const POST: RequestHandler = async ({ locals }) => {
  if (!locals.user) error(401);
  if (store.scanning) return json({ status: 'already_scanning' });

  store.scanning = true;
  (async () => {
    try {
      const projects = await runFullScan() as (Project & { _inddLinks: Record<string, string[]>; _filePaths: string[] })[];
      const linksMap: Record<string, InddLinkEntry[]> = {};
      const inddMap: Record<string, InddEntry> = {};
      for (const proj of projects) {
        for (const [inddName, links] of Object.entries(proj._inddLinks ?? {})) {
          inddMap[inddName] = { proj: proj.meta.projekt_nr, name: proj.meta.name, folder: proj.folder, links };
          for (const img of links) {
            const key = img.toLowerCase();
            linksMap[key] ??= [];
            if (!linksMap[key].some(e => e.indd === inddName)) {
              linksMap[key].push({ indd: inddName, proj: proj.meta.projekt_nr, name: proj.meta.name, folder: proj.folder });
            }
          }
        }
      }
      store.projects = projects;
      store.linksMap = linksMap;
      store.inddMap = inddMap;
      store.searchIndex = buildSearchIndex(projects);
      store.lastScan = new Date();
    } finally {
      store.scanning = false;
    }
  })();

  return json({ status: 'scan_started' });
};
