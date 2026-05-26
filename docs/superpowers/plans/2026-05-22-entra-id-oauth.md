# Microsoft Entra ID OAuth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace password-based auth with Microsoft Entra ID OAuth 2.0 / OIDC, so all art&design users log in via their Exchange account.

**Architecture:** Direct OAuth 2.0 authorization code flow against Microsoft Entra ID endpoints. No auth framework -- just fetch calls to Microsoft's token endpoint. Existing SQLite session management stays intact. Users are auto-created on first login.

**Tech Stack:** SvelteKit, better-sqlite3, Microsoft Entra ID OAuth 2.0 / OIDC, Node crypto

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/lib/server/db.ts` | Modify | Remove password_hash, rate_limits. Add findOrCreateUser. |
| `src/lib/server/auth.ts` | Modify | Remove password functions. Keep session functions. |
| `src/lib/server/oauth.ts` | Create | OAuth helpers: buildAuthUrl, exchangeCode, validateEmail. |
| `src/routes/auth/login/+server.ts` | Create | Redirect to Microsoft with state. |
| `src/routes/auth/callback/+server.ts` | Create | Handle Microsoft callback, create session. |
| `src/routes/login/+page.svelte` | Modify | Replace form with Microsoft button. |
| `src/routes/login/+page.server.ts` | Delete | No longer needed. |
| `src/hooks.server.ts` | Modify | Exempt /auth/* from session check. |
| `cli.js` | Modify | Remove password commands, simplify to list-users/remove-user. |
| `package.json` | Modify | Remove bcryptjs. |
| `.env.example` | Create | Document required env vars. |
| `src/lib/server/oauth.test.ts` | Create | Tests for OAuth helpers. |

---

### Task 1: Update DB schema and functions

**Files:**
- Modify: `src/lib/server/db.ts`

- [ ] **Step 1: Write test for findOrCreateUser**

Create `src/lib/server/db.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createDb } from './db.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('db', () => {
  let db: ReturnType<typeof createDb>;
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fo-test-'));
    db = createDb(join(dir, 'test.db'));
  });

  describe('findOrCreateUser', () => {
    it('creates a new user on first call', () => {
      const user = db.findOrCreateUser('test@art-design.de');
      expect(user).toMatchObject({ email: 'test@art-design.de' });
      expect(user.id).toBeTypeOf('number');
    });

    it('returns existing user on second call', () => {
      const first = db.findOrCreateUser('test@art-design.de');
      const second = db.findOrCreateUser('test@art-design.de');
      expect(second.id).toBe(first.id);
    });
  });

  describe('sessions', () => {
    it('creates and finds a session', () => {
      const user = db.findOrCreateUser('test@art-design.de');
      db.createSession('tok123', user.id, Date.now() + 60_000);
      const session = db.findSession('tok123');
      expect(session).toMatchObject({ token: 'tok123', user_id: user.id });
    });

    it('returns null for expired session', () => {
      const user = db.findOrCreateUser('test@art-design.de');
      db.createSession('tok-expired', user.id, Date.now() - 1000);
      expect(db.findSession('tok-expired')).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/server/db.test.ts`
Expected: FAIL -- `findOrCreateUser` does not exist yet.

- [ ] **Step 3: Update db.ts -- new schema and findOrCreateUser**

Replace the full content of `src/lib/server/db.ts`:

```ts
// src/lib/server/db.ts
import Database from 'better-sqlite3';

export function createDb(path: string) {
  const sqliteDb = new Database(path);

  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      created_at INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  const stmts = {
    insertUser: sqliteDb.prepare('INSERT OR IGNORE INTO users (email) VALUES (?)'),
    findByEmail: sqliteDb.prepare('SELECT id, email FROM users WHERE email = ?'),
    findById: sqliteDb.prepare('SELECT id, email FROM users WHERE id = ?'),
    deleteUser: sqliteDb.prepare('DELETE FROM users WHERE email = ?'),
    insertSession: sqliteDb.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)'),
    findSession: sqliteDb.prepare('SELECT * FROM sessions WHERE token = ? AND expires_at > ?'),
    deleteSession: sqliteDb.prepare('DELETE FROM sessions WHERE token = ?'),
    deleteExpired: sqliteDb.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
    listUsers: sqliteDb.prepare('SELECT email, created_at FROM users ORDER BY email'),
    deleteUserSessions: sqliteDb.prepare(
      'DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = ?)'
    ),
  };

  return {
    findOrCreateUser(email: string): { id: number; email: string } {
      stmts.insertUser.run(email);
      return stmts.findByEmail.get(email) as { id: number; email: string };
    },
    findUserByEmail(email: string) {
      return (stmts.findByEmail.get(email) ?? null) as { id: number; email: string } | null;
    },
    findUserById(id: number) {
      return (stmts.findById.get(id) ?? null) as { id: number; email: string } | null;
    },
    deleteUser(email: string) {
      stmts.deleteUserSessions.run(email);
      stmts.deleteUser.run(email);
    },
    createSession(token: string, userId: number, expiresAt: number) {
      stmts.insertSession.run(token, userId, expiresAt);
    },
    findSession(token: string) {
      return (stmts.findSession.get(token, Date.now()) ?? null) as
        { token: string; user_id: number; expires_at: number } | null;
    },
    deleteSession(token: string) {
      stmts.deleteSession.run(token);
    },
    deleteExpiredSessions() {
      stmts.deleteExpired.run(Date.now());
    },
    listUsers() {
      return stmts.listUsers.all() as { email: string; created_at: number }[];
    },
  };
}

// Singleton for production
import { mkdirSync } from 'fs';
const DATA_DIR = process.env.DATA_DIR ?? './data';
mkdirSync(DATA_DIR, { recursive: true });
export const db = createDb(`${DATA_DIR}/users.db`);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/server/db.test.ts`
Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/db.ts src/lib/server/db.test.ts
git commit -m "feat: update db schema for OAuth -- remove passwords, add findOrCreateUser"
```

---

### Task 2: Create OAuth helper module

**Files:**
- Create: `src/lib/server/oauth.ts`
- Create: `src/lib/server/oauth.test.ts`

- [ ] **Step 1: Write tests for OAuth helpers**

Create `src/lib/server/oauth.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildAuthUrl, parseIdToken, validateEmailDomain } from './oauth.js';

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
      // Build a fake JWT: header.payload.signature
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/server/oauth.test.ts`
Expected: FAIL -- module `./oauth.js` does not exist.

- [ ] **Step 3: Implement oauth.ts**

Create `src/lib/server/oauth.ts`:

```ts
// src/lib/server/oauth.ts
import { randomBytes } from 'crypto';

const ALLOWED_DOMAIN = 'art-design.de';

interface AuthUrlParams {
  tenantId: string;
  clientId: string;
  redirectUri: string;
  state: string;
}

interface IdTokenClaims {
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

export function parseIdToken(idToken: string): IdTokenClaims {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Invalid id_token format');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  // Microsoft sometimes puts email in preferred_username instead of email claim
  const email = (payload.email ?? payload.preferred_username ?? '').toLowerCase().trim();
  return { ...payload, email };
}

export function validateEmailDomain(email: string): boolean {
  if (!email) return false;
  return email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`);
}

export function getOAuthConfig() {
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  const origin = process.env.ORIGIN;

  if (!tenantId || !clientId || !clientSecret || !origin) {
    throw new Error(
      'Missing OAuth env vars. Required: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, ORIGIN'
    );
  }

  return { tenantId, clientId, clientSecret, origin };
}

export async function exchangeCodeForToken(
  code: string,
  config: ReturnType<typeof getOAuthConfig>
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
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }

  return res.json();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/server/oauth.test.ts`
Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/oauth.ts src/lib/server/oauth.test.ts
git commit -m "feat: add OAuth helper module for Entra ID"
```

---

### Task 3: Simplify auth.ts

**Files:**
- Modify: `src/lib/server/auth.ts`

- [ ] **Step 1: Remove password functions, keep session functions**

Replace `src/lib/server/auth.ts` with:

```ts
// src/lib/server/auth.ts
import { randomBytes } from 'crypto';
import { db } from './db.js';
import type { RequestEvent } from '@sveltejs/kit';

const SESSION_COOKIE = 'session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 Tage (OAuth braucht kein "remember me")

export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

export function createSession(event: RequestEvent, userId: number): void {
  const token = generateToken();
  const expiresAt = Date.now() + SESSION_TTL_MS;
  db.createSession(token, userId, expiresAt);
  event.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: event.url.protocol === 'https:',
    sameSite: 'lax',
    maxAge: SESSION_TTL_MS / 1000,
    path: '/',
  });
}

export function destroySession(event: RequestEvent): void {
  const token = event.cookies.get(SESSION_COOKIE);
  if (token) {
    db.deleteSession(token);
    event.cookies.delete(SESSION_COOKIE, { path: '/' });
  }
}

export function getSessionUser(event: RequestEvent): { id: number; email: string } | null {
  const token = event.cookies.get(SESSION_COOKIE);
  if (!token) return null;
  const session = db.findSession(token);
  if (!session) return null;
  return db.findUserById(session.user_id);
}
```

- [ ] **Step 2: Verify existing app still compiles**

Run: `npx svelte-kit sync && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -20`
Expected: May show errors in files we haven't touched yet (login/+page.server.ts) -- that's fine, we're deleting it in Task 6.

- [ ] **Step 3: Commit**

```bash
git add src/lib/server/auth.ts
git commit -m "feat: simplify auth.ts -- remove password functions, 30-day sessions"
```

---

### Task 4: Create /auth/login route

**Files:**
- Create: `src/routes/auth/login/+server.ts`

- [ ] **Step 1: Create the login redirect route**

Create `src/routes/auth/login/+server.ts`:

```ts
// src/routes/auth/login/+server.ts
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { buildAuthUrl, generateState, getOAuthConfig } from '$lib/server/oauth.js';

export const GET: RequestHandler = (event) => {
  const config = getOAuthConfig();
  const state = generateState();

  // Store state in cookie for CSRF validation in callback
  event.cookies.set('oauth_state', state, {
    httpOnly: true,
    secure: event.url.protocol === 'https:',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  });

  const url = buildAuthUrl({
    tenantId: config.tenantId,
    clientId: config.clientId,
    redirectUri: `${config.origin}/auth/callback`,
    state,
  });

  redirect(302, url);
};
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/auth/login/+server.ts
git commit -m "feat: add /auth/login route -- redirect to Microsoft"
```

---

### Task 5: Create /auth/callback route

**Files:**
- Create: `src/routes/auth/callback/+server.ts`

- [ ] **Step 1: Create the callback route**

Create `src/routes/auth/callback/+server.ts`:

```ts
// src/routes/auth/callback/+server.ts
import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  getOAuthConfig,
  exchangeCodeForToken,
  parseIdToken,
  validateEmailDomain,
} from '$lib/server/oauth.js';
import { db } from '$lib/server/db.js';
import { createSession } from '$lib/server/auth.js';

export const GET: RequestHandler = async (event) => {
  const code = event.url.searchParams.get('code');
  const state = event.url.searchParams.get('state');
  const errorParam = event.url.searchParams.get('error');

  // Microsoft returned an error (user cancelled, etc.)
  if (errorParam) {
    const desc = event.url.searchParams.get('error_description') ?? 'Login abgebrochen';
    redirect(302, `/login?error=${encodeURIComponent(desc)}`);
  }

  if (!code || !state) {
    redirect(302, '/login?error=Fehlende+Parameter');
  }

  // CSRF: validate state matches cookie
  const storedState = event.cookies.get('oauth_state');
  event.cookies.delete('oauth_state', { path: '/' });

  if (!storedState || storedState !== state) {
    redirect(302, '/login?error=Ungültiger+State-Parameter');
  }

  try {
    const config = getOAuthConfig();
    const tokenResponse = await exchangeCodeForToken(code, config);
    const claims = parseIdToken(tokenResponse.id_token);

    // Validate tenant
    if (claims.tid !== config.tenantId) {
      redirect(302, '/login?error=Falscher+Tenant');
    }

    // Validate email domain
    if (!validateEmailDomain(claims.email)) {
      redirect(302, '/login?error=Nur+art%26design+Konten+erlaubt');
    }

    // Create or find user, then create session
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
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/auth/callback/+server.ts
git commit -m "feat: add /auth/callback route -- handle Microsoft OAuth response"
```

---

### Task 6: Update hooks.server.ts

**Files:**
- Modify: `src/hooks.server.ts`

- [ ] **Step 1: Exempt /auth/* routes from session check**

In `src/hooks.server.ts`, update the handle function. The current check is:

```ts
const isLoginPage = event.url.pathname === '/login';
if (!user && !isLoginPage) {
```

Replace with:

```ts
const isPublicRoute =
  event.url.pathname === '/login' || event.url.pathname.startsWith('/auth/');
if (!user && !isPublicRoute) {
```

And update the redirect check:

```ts
if (user && event.url.pathname === '/login') redirect(302, '/');
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks.server.ts
git commit -m "feat: exempt /auth/* routes from session check"
```

---

### Task 7: Update login page and delete old server handler

**Files:**
- Modify: `src/routes/login/+page.svelte`
- Delete: `src/routes/login/+page.server.ts`

- [ ] **Step 1: Replace login form with Microsoft button**

Replace `src/routes/login/+page.svelte` with:

```svelte
<!-- src/routes/login/+page.svelte -->
<script lang="ts">
  import { page } from '$app/state';
  import { Button } from '$lib/components/ui/button/index.js';
  import logo from '$lib/assets/logo.png';

  const error = $derived(page.url.searchParams.get('error'));
</script>

<svelte:head><title>Login — Projekt-Index</title></svelte:head>

<div class="min-h-screen flex flex-col items-center justify-center bg-[#F5F5F5]">
  <div class="bg-white rounded-2xl shadow-lg w-[380px] overflow-hidden">
    <!-- Logo-Header -->
    <div class="bg-[#3A3A3A] px-8 py-7 flex items-center justify-center">
      <img src={logo} alt="art&design" class="h-10 brightness-0 invert" />
    </div>

    <!-- Login -->
    <div class="px-8 py-7">
      <p class="text-sm text-muted-foreground mb-6 text-center tracking-wide">Projekt-Index</p>

      {#if error}
        <div class="bg-red-50 text-[#890813] text-sm rounded-lg px-3 py-2.5 border border-red-100 mb-4">
          {decodeURIComponent(error)}
        </div>
      {/if}

      <Button
        href="/auth/login"
        class="w-full h-10 bg-[#890813] hover:bg-[#6d0610] text-white font-medium"
      >
        Mit Microsoft anmelden
      </Button>
    </div>
  </div>

  <p class="mt-6 text-xs text-muted-foreground">art&amp;design werbeagentur GmbH</p>
</div>
```

- [ ] **Step 2: Delete old page.server.ts**

Delete `src/routes/login/+page.server.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/routes/login/+page.svelte
git rm src/routes/login/+page.server.ts
git commit -m "feat: replace login form with Microsoft OAuth button"
```

---

### Task 8: Update CLI

**Files:**
- Modify: `cli.js`

- [ ] **Step 1: Rewrite cli.js without password management**

Replace `cli.js` with:

```js
#!/usr/bin/env node
// cli.js -- User management (OAuth, no passwords)
import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';

const DATA_DIR = process.env.DATA_DIR ?? './data';
mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(`${DATA_DIR}/users.db`);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
`);

const [,, command, email] = process.argv;

if (command === 'list-users') {
  const users = db.prepare('SELECT email, created_at FROM users ORDER BY email').all();
  if (users.length === 0) console.log('Keine User angelegt.');
  else users.forEach(u => console.log(`  ${u.email}`));

} else if (command === 'remove-user') {
  if (!email) { console.error('Usage: node cli.js remove-user <email>'); process.exit(1); }
  db.prepare('DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = ?)').run(email.toLowerCase());
  const result = db.prepare('DELETE FROM users WHERE email = ?').run(email.toLowerCase());
  if (result.changes > 0) console.log(`User ${email} entfernt.`);
  else console.error(`User ${email} nicht gefunden.`);

} else {
  console.log('Befehle: list-users | remove-user <email>');
  console.log('User werden automatisch beim ersten Microsoft-Login angelegt.');
}
```

- [ ] **Step 2: Commit**

```bash
git add cli.js
git commit -m "feat: simplify CLI -- remove password commands (OAuth handles auth)"
```

---

### Task 9: Remove bcryptjs, create .env.example

**Files:**
- Modify: `package.json`
- Create: `.env.example`

- [ ] **Step 1: Remove bcryptjs dependencies**

Run:
```bash
npm uninstall bcryptjs @types/bcryptjs
```

- [ ] **Step 2: Create .env.example**

Create `.env.example`:

```bash
# Microsoft Entra ID (Azure AD) OAuth
# Erstelle eine App Registration im Azure Portal:
# https://portal.azure.com → Microsoft Entra ID → App registrations → New registration
# Platform: Web
# Redirect URI: https://<deine-domain>/auth/callback
# Supported account types: Accounts in this organizational directory only

AZURE_TENANT_ID=
AZURE_CLIENT_ID=
AZURE_CLIENT_SECRET=

# Public URL of this app (no trailing slash)
ORIGIN=http://localhost:5173
```

- [ ] **Step 3: Verify build**

Run: `npx svelte-kit sync && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -20`
Expected: No errors (or only unrelated warnings).

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests in `db.test.ts` and `oauth.test.ts` PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "chore: remove bcryptjs, add .env.example for OAuth config"
```

---

### Task 10: DB migration for existing data

**Files:**
- Modify: `src/lib/server/db.ts` (if needed)

- [ ] **Step 1: Handle existing DB with old schema**

The `CREATE TABLE IF NOT EXISTS` in the new `db.ts` won't alter an existing `users` table that has `password_hash`. For existing deployments, add a one-time migration at DB init. Add this after the `CREATE TABLE` block in `createDb`:

```ts
// Migrate: drop password_hash column and rate_limits table if they exist from old schema
const hasPasswordHash = sqliteDb
  .prepare("SELECT COUNT(*) as cnt FROM pragma_table_info('users') WHERE name = 'password_hash'")
  .get() as { cnt: number };

if (hasPasswordHash.cnt > 0) {
  sqliteDb.exec(`
    CREATE TABLE users_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      created_at INTEGER DEFAULT (unixepoch())
    );
    INSERT INTO users_new (id, email, created_at) SELECT id, email, created_at FROM users;
    DROP TABLE users;
    ALTER TABLE users_new RENAME TO users;
    DROP TABLE IF EXISTS rate_limits;
  `);
}
```

- [ ] **Step 2: Write test for migration**

Add to `src/lib/server/db.test.ts`:

```ts
describe('migration', () => {
  it('migrates old schema with password_hash', () => {
    const migDir = mkdtempSync(join(tmpdir(), 'fo-mig-'));
    const migPath = join(migDir, 'migrate.db');

    // Create old-schema DB
    const oldDb = new Database(migPath);
    oldDb.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at INTEGER DEFAULT (unixepoch())
      );
      CREATE TABLE sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE rate_limits (
        email TEXT PRIMARY KEY,
        attempts INTEGER DEFAULT 0,
        locked_until INTEGER DEFAULT 0
      );
      INSERT INTO users (email, password_hash) VALUES ('old@art-design.de', 'hash123');
    `);
    oldDb.close();

    // Re-open with new createDb -- should migrate
    const newDb = createDb(migPath);
    const user = newDb.findUserByEmail('old@art-design.de');
    expect(user).toMatchObject({ email: 'old@art-design.de' });

    // Verify password_hash column is gone
    const rawDb = new Database(migPath);
    const cols = rawDb.prepare("SELECT name FROM pragma_table_info('users')").all() as { name: string }[];
    expect(cols.map(c => c.name)).not.toContain('password_hash');

    // Verify rate_limits table is gone
    const tables = rawDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    expect(tables.map(t => t.name)).not.toContain('rate_limits');
    rawDb.close();
  });
});
```

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS, including the new migration test.

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/db.ts src/lib/server/db.test.ts
git commit -m "feat: add DB migration from old password schema to OAuth schema"
```

---

### Task 11: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 2: Type check**

Run: `npx svelte-kit sync && npx svelte-check --tsconfig ./tsconfig.json`
Expected: No errors.

- [ ] **Step 3: Verify no bcrypt references remain in source**

Run: `grep -r "bcrypt" src/ cli.js --include="*.ts" --include="*.js" --include="*.svelte"`
Expected: No matches.

- [ ] **Step 4: Dev server smoke test**

Create `.env` with test values (app won't fully work without real Azure creds, but should start):

```bash
AZURE_TENANT_ID=test
AZURE_CLIENT_ID=test
AZURE_CLIENT_SECRET=test
ORIGIN=http://localhost:5173
```

Run: `npm run dev`
Expected: Server starts. Navigate to `http://localhost:5173` → redirected to `/login` → see "Mit Microsoft anmelden" button.

- [ ] **Step 5: Final commit if any loose changes**

```bash
git status
# If any unstaged changes, add and commit
```
