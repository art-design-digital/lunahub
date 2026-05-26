import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getSessionUser } from '@/lib/server/auth';
import { config } from '@/lib/server/config';

const execFileAsync = promisify(execFile);

export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const smbUrl = config.smbUrl;
  if (!smbUrl) return NextResponse.json({ ok: false, reason: 'no-smb-url' });

  // Validate URL scheme to prevent opening arbitrary local resources
  try {
    const parsed = new URL(smbUrl);
    if (!['smb:', 'afp:', 'cifs:'].includes(parsed.protocol)) {
      return NextResponse.json({ ok: false, reason: 'invalid-url-scheme' });
    }
  } catch {
    return NextResponse.json({ ok: false, reason: 'invalid-url' });
  }

  if (process.platform !== 'darwin') {
    return NextResponse.json({ ok: false, reason: 'not-darwin' });
  }

  // Öffnet den Finder-Verbindungsdialog für das SMB-Share
  try {
    await execFileAsync('open', [smbUrl], { timeout: 5_000 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, reason: 'open-failed' });
  }
}
