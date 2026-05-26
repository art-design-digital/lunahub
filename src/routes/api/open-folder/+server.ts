import { error, json } from '@sveltejs/kit';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { resolve } from 'path';
import type { RequestHandler } from './$types';
import { config } from '$lib/server/config.js';

const execFileAsync = promisify(execFile);

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) error(401);

  const body = await request.json();
  const target: string = body.path ?? body.folder;

  if (!target || typeof target !== 'string') error(400, 'Missing path');

  // Restrict to paths within the configured NAS volume
  const resolved = resolve(target);
  const volumeRoot = resolve(config.volume);
  if (!resolved.startsWith(volumeRoot + '/') && resolved !== volumeRoot) {
    error(403, 'Zugriff nur auf Projektdateien erlaubt');
  }

  if (!existsSync(resolved)) error(404, 'Path not found');

  if (process.platform !== 'darwin') {
    return json({ ok: false, reason: 'not-darwin' });
  }

  try {
    await execFileAsync('open', [resolved], { timeout: 5_000 });
    return json({ ok: true });
  } catch {
    return json({ ok: false, reason: 'open-failed' });
  }
};
