import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { store } from '$lib/store.js';

export const GET: RequestHandler = ({ locals }) => {
  if (!locals.user) error(401);
  return json(store.projects);
};
