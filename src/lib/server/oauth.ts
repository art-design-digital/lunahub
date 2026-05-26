// src/lib/server/oauth.ts
import { randomBytes } from 'crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const ALLOWED_DOMAIN = 'art-design.de';

interface AuthUrlParams {
  tenantId: string;
  clientId: string;
  redirectUri: string;
  state: string;
}

export interface VerifiedClaims {
  email: string;
  tid: string;
  [key: string]: unknown;
}

export function buildAuthUrl(params: AuthUrlParams): string {
  const base = `https://login.microsoftonline.com/${params.tenantId}/oauth2/v2.0/authorize`;
  const query = new URLSearchParams({
    client_id: params.clientId,
    response_type: 'code',
    redirect_uri: params.redirectUri,
    scope: 'openid email profile',
    state: params.state,
  });
  return `${base}?${query}`;
}

export function generateState(): string {
  return randomBytes(32).toString('hex');
}

// Cached JWKS fetcher (jose handles caching/rotation internally)
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJWKS(tenantId: string) {
  if (!jwksCache.has(tenantId)) {
    const url = new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`);
    jwksCache.set(tenantId, createRemoteJWKSet(url));
  }
  return jwksCache.get(tenantId)!;
}

export async function verifyIdToken(idToken: string, config: OAuthConfig): Promise<VerifiedClaims> {
  const jwks = getJWKS(config.tenantId);
  const issuer = `https://login.microsoftonline.com/${config.tenantId}/v2.0`;

  const { payload } = await jwtVerify(idToken, jwks, {
    issuer,
    audience: config.clientId,
  });

  // Microsoft sometimes puts email in preferred_username instead of email claim
  const email = ((payload.email as string) ?? (payload.preferred_username as string) ?? '').toLowerCase().trim();

  return { ...payload, email, tid: (payload.tid as string) ?? '' };
}

export function validateEmailDomain(email: string): boolean {
  if (!email) return false;
  const parts = email.toLowerCase().split('@');
  return parts.length === 2 && parts[1] === ALLOWED_DOMAIN;
}

export interface OAuthConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  origin: string;
}

export async function exchangeCodeForToken(
  code: string,
  config: OAuthConfig
): Promise<{ id_token: string }> {
  const tokenUrl = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: `${config.origin}/auth/callback`,
    scope: 'openid email profile',
  });

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`Token exchange failed (${res.status}): ${res.statusText}`);
  }

  const data = await res.json();
  if (!data?.id_token) {
    throw new Error('Missing id_token in token response');
  }
  return data;
}
