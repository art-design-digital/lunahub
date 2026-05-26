import { describe, it, expect } from 'vitest';
import { buildAuthUrl, validateEmailDomain } from './oauth.js';
import type { VerifiedClaims } from './oauth.js';

/** Test-only: decode JWT payload without signature verification */
function parseIdToken(idToken: string): VerifiedClaims {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Invalid id_token format');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  const email = (payload.email ?? payload.preferred_username ?? '').toLowerCase().trim();
  return { ...payload, email };
}

describe('oauth', () => {
  describe('buildAuthUrl', () => {
    it('builds correct Microsoft authorize URL', () => {
      const url = buildAuthUrl({
        tenantId: 'test-tenant',
        clientId: 'test-client',
        redirectUri: 'https://app.example.com/auth/callback',
        state: 'random-state',
      });
      const parsed = new URL(url);
      expect(parsed.origin).toBe('https://login.microsoftonline.com');
      expect(parsed.pathname).toBe('/test-tenant/oauth2/v2.0/authorize');
      expect(parsed.searchParams.get('client_id')).toBe('test-client');
      expect(parsed.searchParams.get('response_type')).toBe('code');
      expect(parsed.searchParams.get('redirect_uri')).toBe('https://app.example.com/auth/callback');
      expect(parsed.searchParams.get('scope')).toBe('openid email profile');
      expect(parsed.searchParams.get('state')).toBe('random-state');
    });
  });

  describe('parseIdToken', () => {
    it('decodes JWT payload', () => {
      const payload = { email: 'user@art-design.de', tid: 'tenant-123' };
      const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const fakeJwt = `eyJhbGciOiJSUzI1NiJ9.${encoded}.fake-signature`;

      const result = parseIdToken(fakeJwt);
      expect(result.email).toBe('user@art-design.de');
      expect(result.tid).toBe('tenant-123');
    });

    it('handles preferred_username as email fallback', () => {
      const payload = { preferred_username: 'user@art-design.de', tid: 'tenant-123' };
      const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const fakeJwt = `eyJhbGciOiJSUzI1NiJ9.${encoded}.fake-signature`;

      const result = parseIdToken(fakeJwt);
      expect(result.email).toBe('user@art-design.de');
    });

    it('throws on invalid token format', () => {
      expect(() => parseIdToken('not-a-jwt')).toThrow('Invalid id_token format');
    });
  });

  describe('validateEmailDomain', () => {
    it('accepts @art-design.de', () => {
      expect(validateEmailDomain('user@art-design.de')).toBe(true);
    });

    it('rejects other domains', () => {
      expect(validateEmailDomain('user@gmail.com')).toBe(false);
    });

    it('rejects empty/undefined', () => {
      expect(validateEmailDomain('')).toBe(false);
      expect(validateEmailDomain(undefined as any)).toBe(false);
    });
  });
});
