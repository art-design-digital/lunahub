// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { redirect, error } from '@sveltejs/kit';
import { getSessionUser } from '$lib/server/auth.js';
import { runFullScan } from '$lib/server/scanner.js';
import { buildSearchIndex } from '$lib/server/search-index.js';
import { store } from '$lib/store.js';
import type { Project, InddLinkEntry, InddEntry } from '$lib/types.js';

async function doScan() {
  if (store.scanning) return;
  store.scanning = true;
  try {
    const projects = await runFullScan() as (Project & { _inddLinks: Record<string, string[]>; _filePaths: string[] })[];

    // Verlinkungen-Indizes aufbauen
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

    const searchIndex = buildSearchIndex(projects);

    store.projects = projects;
    store.linksMap = linksMap;
    store.inddMap = inddMap;
    store.searchIndex = searchIndex;
    store.lastScan = new Date();
  } finally {
    store.scanning = false;
  }
}

// Initialer Scan beim Start
doScan();

// Automatischer Rescan alle 30 Minuten
setInterval(doScan, 30 * 60 * 1000);

export const handle: Handle = async ({ event, resolve }) => {
  const user = getSessionUser(event);
  event.locals.user = user;
  const isLoginPage = event.url.pathname === '/login';
  if (!user && !isLoginPage) {
    if (event.url.pathname.startsWith('/api/')) error(401, 'Unauthorized');
    redirect(302, '/login');
  }
  if (user && isLoginPage) redirect(302, '/');
  return resolve(event);
};
