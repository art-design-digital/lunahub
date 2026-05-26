import { NextResponse } from 'next/server';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { getSessionUser } from '@/lib/server/auth';
import { store } from '@/lib/store';
import { getThumbPath, generateThumb } from '@/lib/server/thumbnails';
import { ensureScanStarted } from '@/lib/server/auto-scan';

const CACHE_DIR = process.env.DATA_DIR ? `${process.env.DATA_DIR}/thumbs` : './data/thumbs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  ensureScanStarted();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!/^[0-9a-f]{16}$/.test(id)) {
    return NextResponse.json({ error: 'Invalid thumb id' }, { status: 400 });
  }

  // Try fast O(1) lookup first, fall back to linear scan if thumbMap not yet populated
  let filePath = store.thumbMap.get(id);
  if (!filePath) {
    for (const proj of store.projects) {
      for (let i = 0; i < proj.files.length; i++) {
        if (proj.files[i].thumbId === id) {
          const fps = (proj as any)._filePaths as string[] | undefined;
          filePath = fps?.[i] ?? `${proj.folder}/${proj.files[i].name}`;
          break;
        }
      }
      if (filePath) break;
    }
  }
  if (!filePath) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const thumbPath = getThumbPath(CACHE_DIR, id);

  if (!existsSync(thumbPath)) {
    const ok = await generateThumb(filePath, thumbPath);
    if (!ok) {
      return NextResponse.json({ error: 'Thumbnail could not be generated' }, { status: 404 });
    }
  }

  const data = await readFile(thumbPath);
  return new NextResponse(data, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'private, max-age=86400',
    },
  });
}
