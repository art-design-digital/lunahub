// src/routes/auth/callback/+server.ts
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import {
  exchangeCodeForToken,
  verifyIdToken,
  validateEmailDomain,
} from '$lib/server/oauth.js';
import { db } from '$lib/server/db.js';
import { createSession } from '$lib/server/auth.js';

export const GET: RequestHandler = async (event) => {
  const code = event.url.searchParams.get('code');
  const state = event.url.searchParams.get('state');
  const errorParam = event.url.searchParams.get('error');

  if (errorParam) {
    console.error('[oauth] error from Microsoft:', errorParam, event.url.searchParams.get('error_description'));
    redirect(302, '/login?error=Anmeldung+fehlgeschlagen');
  }

  if (!code || !state) {
    redirect(302, '/login?error=Fehlende+Parameter');
  }

  // CSRF: validate state matches cookie
  const storedState = event.cookies.get('oauth_state');
  event.cookies.delete('oauth_state', { path: '/' });

  if (!storedState || storedState !== state) {
    redirect(302, '/login?error=Ung%C3%BCltiger+State-Parameter');
  }

  const { AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, ORIGIN } = env;
  if (!AZURE_TENANT_ID || !AZURE_CLIENT_ID || !AZURE_CLIENT_SECRET || !ORIGIN) {
    redirect(302, '/login?error=OAuth+nicht+konfiguriert');
  }

  try {
    const config = { tenantId: AZURE_TENANT_ID, clientId: AZURE_CLIENT_ID, clientSecret: AZURE_CLIENT_SECRET, origin: ORIGIN };
    const tokenResponse = await exchangeCodeForToken(code, config);
    // Verify JWT signature against Microsoft JWKS + check iss, aud, exp
    const claims = await verifyIdToken(tokenResponse.id_token, config);

    if (!validateEmailDomain(claims.email)) {
      redirect(302, '/login?error=Nur+art%26design+Konten+erlaubt');
    }

    const user = db.findOrCreateUser(claims.email);
    createSession(event, user.id);

    redirect(302, '/');
  } catch (err) {
    // Re-throw SvelteKit redirects
    if (err && typeof err === 'object' && 'status' in err && 'location' in err) throw err;
    console.error('[oauth] callback error:', err);
    redirect(302, '/login?error=Anmeldung+fehlgeschlagen');
  }
};
