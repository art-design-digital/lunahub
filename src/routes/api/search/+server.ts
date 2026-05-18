import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { store } from '$lib/store.js';

export const GET: RequestHandler = ({ locals, url }) => {
  if (!locals.user) error(401);
  const q = url.searchParams.get('q')?.trim();
  if (!q || q.length < 2) return json([]);
  if (!store.searchIndex) return json([]);
  const results = store.searchIndex.search(q, { limit: 50 });
  return json(results);
};
