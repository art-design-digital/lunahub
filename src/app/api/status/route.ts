import { NextResponse } from 'next/server';
import { existsSync } from 'fs';
import { join } from 'path';
import { getSessionUser } from '@/lib/server/auth';
import { store } from '@/lib/store';
import { config } from '@/lib/server/config';
import { ensureScanStarted } from '@/lib/server/auto-scan';

export async function GET() {
  ensureScanStarted();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const firstClientPath = join(config.volume, config.clients[0]?.folder ?? '');
  const nasOnline = existsSync(firstClientPath);
  return NextResponse.json({
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
}
