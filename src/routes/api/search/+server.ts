import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { store } from '$lib/store.js';

function extractSnippet(text: string, query: string, contextChars = 40): string | null {
  const lower = text.toLowerCase();
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length >= 2);
  for (const term of terms) {
    const idx = lower.indexOf(term);
    if (idx === -1) continue;
    const start = Math.max(0, idx - contextChars);
    const end = Math.min(text.length, idx + term.length + contextChars);
    const before = start > 0 ? '\u2026' : '';
    const after = end < text.length ? '\u2026' : '';
    return before + text.slice(start, end).replace(/\s+/g, ' ').trim() + after;
  }
  return null;
}

export const GET: RequestHandler = ({ locals, url }) => {
  if (!locals.user) error(401);
  const q = url.searchParams.get('q')?.trim();
  if (!q || q.length < 2) return json([]);
  if (!store.searchIndex) return json([]);

  const raw = store.searchIndex.search(q).slice(0, 50);

  const results = raw.map(r => {
    const text = store.textMap.get(r.id);
    const snippet = text ? extractSnippet(text, q) : null;
    return { ...r, snippet };
  });

  return json(results);
};
