import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server/auth';
import { store } from '@/lib/store';
import { ensureScanStarted } from '@/lib/server/auto-scan';

export async function GET() {
  ensureScanStarted();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const cleaned = store.projects.map(p => {
    const { _inddLinks, _filePaths, ...proj } = p as any;
    return {
      ...proj,
      files: proj.files.map(({ textContent, ...f }: any) => f),
    };
  });
  return NextResponse.json(cleaned);
}
