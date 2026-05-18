// src/routes/logout/+server.ts
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { destroySession } from '$lib/server/auth.js';

export const POST: RequestHandler = (event) => {
  destroySession(event);
  redirect(302, '/login');
};
