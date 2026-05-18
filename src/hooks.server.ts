// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { getSessionUser } from '$lib/server/auth.js';

export const handle: Handle = async ({ event, resolve }) => {
  const user = getSessionUser(event);
  event.locals.user = user;

  const isLoginPage = event.url.pathname === '/login';

  if (!user && !isLoginPage) {
    redirect(302, '/login');
  }

  if (user && isLoginPage) {
    redirect(302, '/');
  }

  return resolve(event);
};
