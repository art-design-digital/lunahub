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

  let filePath: string | null = null;
  for (const proj of store.projects) {
    for (const file of proj.files) {
      if (file.thumbId === id) {
        filePath = `${proj.folder}/${file.name}`;
        break;
      }
    }
    if (filePath) break;
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
      'Cache-Control': 'public, max-age=86400',
    },
  });
};
