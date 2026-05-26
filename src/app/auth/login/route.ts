// src/app/auth/login/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { buildAuthUrl, generateState } from '@/lib/server/oauth';

export async function GET(request: Request) {
  const AZURE_TENANT_ID = process.env.AZURE_TENANT_ID;
  const AZURE_CLIENT_ID = process.env.AZURE_CLIENT_ID;
  const ORIGIN = process.env.ORIGIN;

  if (!AZURE_TENANT_ID || !AZURE_CLIENT_ID || !ORIGIN) {
    return NextResponse.json({ error: 'OAuth nicht konfiguriert' }, { status: 500 });
  }

  const state = generateState();
  const isSecure = new URL(request.url).protocol === 'https:';

  const cookieStore = await cookies();
  cookieStore.set('oauth_state', state, {
    httpOnly: true,
    secure: isSecure,
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

  return NextResponse.redirect(url);
}
