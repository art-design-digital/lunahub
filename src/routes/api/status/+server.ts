import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { store } from '$lib/store.js';

export const GET: RequestHandler = ({ locals }) => {
  if (!locals.user) error(401);
  return json({
    lastScan: store.lastScan?.toISOString() ?? null,
    scanning: store.scanning,
    projectCount: store.projects.length,
    fileCount: store.projects.reduce((acc, p) => acc + p.files.length, 0),
  });
};
