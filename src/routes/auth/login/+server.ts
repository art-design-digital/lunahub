// src/routes/auth/login/+server.ts
import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { buildAuthUrl, generateState } from '$lib/server/oauth.js';

export const GET: RequestHandler = (event) => {
  const { AZURE_TENANT_ID, AZURE_CLIENT_ID, ORIGIN } = env;
  if (!AZURE_TENANT_ID || !AZURE_CLIENT_ID || !ORIGIN) {
    error(500, 'OAuth nicht konfiguriert');
  }

  const state = generateState();

  event.cookies.set('oauth_state', state, {
    httpOnly: true,
    secure: event.url.protocol === 'https:',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });

  const url = buildAuthUrl({
    tenantId: AZURE_TENANT_ID,
    clientId: AZURE_CLIENT_ID,
    redirectUri: `${ORIGIN}/auth/callback`,
    state,
  });

  redirect(302, url);
};
