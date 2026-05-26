import { json, error } from '@sveltejs/kit';
import { existsSync } from 'fs';
import { join } from 'path';
import type { RequestHandler } from './$types';
import { store } from '$lib/store.js';
import { config } from '$lib/server/config.js';

export const GET: RequestHandler = ({ locals }) => {
  if (!locals.user) error(401);
  const firstClientPath = join(config.volume, config.clients[0]?.folder ?? '');
  const nasOnline = existsSync(firstClientPath);
  return json({
    lastScan: store.lastScan?.toISOString() ?? null,
    scanning: store.scanning,
    scanError: store.scanError,
    scanDuration: store.scanDuration,
    projectCount: store.projects.length,
    fileCount: store.projects.reduce((acc, p) => acc + p.files.length, 0),
    nasOnline,
    smbUrl: config.smbUrl ?? null,
    canOpenFiles: process.platform === 'darwin',
  });
};
