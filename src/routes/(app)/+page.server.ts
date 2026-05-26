// src/routes/(app)/+page.server.ts
import type { PageServerLoad } from './$types';
import { store } from '$lib/store.js';

export const load: PageServerLoad = ({ locals }) => {
  return {
    user: locals.user,
    lastScan: store.lastScan?.toISOString() ?? null,
    projectCount: store.projects.length,
  };
};
