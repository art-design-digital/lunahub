// src/app/auth/callback/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  exchangeCodeForToken,
  verifyIdToken,
  validateEmailDomain,
} from '@/lib/server/oauth';
import { db } from '@/lib/server/db';
import { createSession } from '@/lib/server/auth';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error');
  const origin = process.env.ORIGIN || url.origin;

  if (errorParam) {
    console.error('[oauth] error from Microsoft:', errorParam, url.searchParams.get('error_description'));
    return NextResponse.redirect(new URL('/login?error=Anmeldung+fehlgeschlagen', origin));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL('/login?error=Fehlende+Parameter', origin));
  }

  // CSRF: validate state matches cookie
  const cookieStore = await cookies();
  const storedState = cookieStore.get('oauth_state')?.value;
  cookieStore.delete('oauth_state');

  if (!storedState || storedState !== state) {
    return NextResponse.redirect(new URL('/login?error=Ung%C3%BCltiger+State-Parameter', origin));
  }

  const AZURE_TENANT_ID = process.env.AZURE_TENANT_ID;
  const AZURE_CLIENT_ID = process.env.AZURE_CLIENT_ID;
  const AZURE_CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;
  const ORIGIN = process.env.ORIGIN;

  if (!AZURE_TENANT_ID || !AZURE_CLIENT_ID || !AZURE_CLIENT_SECRET || !ORIGIN) {
    return NextResponse.redirect(new URL('/login?error=OAuth+nicht+konfiguriert', origin));
  }

  try {
    const oauthConfig = {
      tenantId: AZURE_TENANT_ID,
      clientId: AZURE_CLIENT_ID,
      clientSecret: AZURE_CLIENT_SECRET,
      origin: ORIGIN,
    };
    const tokenResponse = await exchangeCodeForToken(code, oauthConfig);
    // Verify JWT signature against Microsoft JWKS + check iss, aud, exp
    const claims = await verifyIdToken(tokenResponse.id_token, oauthConfig);

    if (!validateEmailDomain(claims.email)) {
      return NextResponse.redirect(new URL('/login?error=Nur+art%26design+Konten+erlaubt', origin));
    }

    const user = db.findOrCreateUser(claims.email);
    const isSecure = url.protocol === 'https:';
    await createSession(user.id, isSecure);

    return NextResponse.redirect(new URL('/', origin));
  } catch (err) {
    console.error('[oauth] callback error:', err);
    return NextResponse.redirect(new URL('/login?error=Anmeldung+fehlgeschlagen', origin));
  }
}
