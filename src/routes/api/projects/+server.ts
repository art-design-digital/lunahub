import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { store } from '$lib/store.js';

export const GET: RequestHandler = ({ locals }) => {
  if (!locals.user) error(401);
  const cleaned = store.projects.map(p => {
    const { _inddLinks, _filePaths, ...proj } = p as any;
    return {
      ...proj,
      files: proj.files.map(({ textContent, ...f }: any) => f),
    };
  });
  return json(cleaned);
};
