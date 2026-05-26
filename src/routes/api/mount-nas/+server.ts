import { json, error } from '@sveltejs/kit';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { RequestHandler } from './$types';
import { config } from '$lib/server/config.js';

const execFileAsync = promisify(execFile);

export const POST: RequestHandler = async ({ locals }) => {
  if (!locals.user) error(401);

  const smbUrl = config.smbUrl;
  if (!smbUrl) return json({ ok: false, reason: 'no-smb-url' });

  // Validate URL scheme to prevent opening arbitrary local resources
  try {
    const parsed = new URL(smbUrl);
    if (!['smb:', 'afp:', 'cifs:'].includes(parsed.protocol)) {
      return json({ ok: false, reason: 'invalid-url-scheme' });
    }
  } catch {
    return json({ ok: false, reason: 'invalid-url' });
  }

  if (process.platform !== 'darwin') {
    return json({ ok: false, reason: 'not-darwin' });
  }

  // Öffnet den Finder-Verbindungsdialog für das SMB-Share
  try {
    await execFileAsync('open', [smbUrl], { timeout: 5_000 });
    return json({ ok: true });
  } catch {
    return json({ ok: false, reason: 'open-failed' });
  }
};
