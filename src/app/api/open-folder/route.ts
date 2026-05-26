import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { getSessionUser } from '@/lib/server/auth';
import { config } from '@/lib/server/config';

const execFileAsync = promisify(execFile);

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const target: string = body.path ?? body.folder;

  if (!target || typeof target !== 'string') {
    return NextResponse.json({ error: 'Missing path' }, { status: 400 });
  }

  // Restrict to paths within the configured NAS volume
  const resolved = resolve(target);
  const volumeRoot = resolve(config.volume);
  if (!resolved.startsWith(volumeRoot + '/') && resolved !== volumeRoot) {
    return NextResponse.json({ error: 'Zugriff nur auf Projektdateien erlaubt' }, { status: 403 });
  }

  if (!existsSync(resolved)) {
    return NextResponse.json({ error: 'Path not found' }, { status: 404 });
  }

  if (process.platform !== 'darwin') {
    return NextResponse.json({ ok: false, reason: 'not-darwin' });
  }

  try {
    await execFileAsync('open', [resolved], { timeout: 5_000 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, reason: 'open-failed' });
  }
}
