import { error } from '@sveltejs/kit';
import { createReadStream, existsSync } from 'fs';
import type { RequestHandler } from './$types';
import { store } from '$lib/store.js';
import { getThumbPath, generateThumb } from '$lib/server/thumbnails.js';

const CACHE_DIR = process.env.DATA_DIR ? `${process.env.DATA_DIR}/thumbs` : './data/thumbs';

export const GET: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) error(401);

  const id = params.id;
  if (!/^[0-9a-f]{16}$/.test(id)) error(400, 'Invalid thumb id');

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
  if (!filePath) error(404);

  const thumbPath = getThumbPath(CACHE_DIR, id);

  if (!existsSync(thumbPath)) {
    const ok = await generateThumb(filePath, thumbPath);
    if (!ok) error(404, 'Thumbnail could not be generated');
  }

  const stream = createReadStream(thumbPath);
  return new Response(stream as unknown as ReadableStream, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'private, max-age=86400',
    },
  });
};
