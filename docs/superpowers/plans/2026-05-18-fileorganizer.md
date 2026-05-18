# Fileorganizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SvelteKit-Web-App die Projektdateien vom NAS indexiert, mit Login-Schutz, drei Tabs (Dateien / Verlinkungen / Textsuche) und Docker-Deployment auf dem NAS via Cloudflare Tunnel.

**Architecture:** SvelteKit (Node-Adapter) liest das NAS-Dateisystem direkt via Docker-Volume-Mount. Der Index liegt im RAM und wird alle 30 Minuten im Hintergrund aktualisiert. Auth läuft über HttpOnly-Cookies + SQLite-Session-Store.

**Tech Stack:** SvelteKit 2, TypeScript, better-sqlite3, bcryptjs, MiniSearch, sharp, Node.js 20, Docker, Cloudflare Tunnel

---

## Dateistruktur

```
ad_tools/fileorganizer/
├── src/
│   ├── lib/
│   │   ├── server/
│   │   │   ├── config.ts          # Config laden + validieren
│   │   │   ├── db.ts              # SQLite: Users + Sessions
│   │   │   ├── auth.ts            # Session-Helpers
│   │   │   ├── scanner.ts         # Dateisystem-Scan
│   │   │   ├── indd-links.ts      # INDD-Verlinkungen via strings
│   │   │   ├── thumbnails.ts      # Thumbnail-Generierung
│   │   │   ├── pdf-text.ts        # PDF-Text via pdftotext
│   │   │   └── search-index.ts    # MiniSearch-Index
│   │   ├── types.ts               # Gemeinsame TypeScript-Types
│   │   └── store.ts               # Globaler In-Memory-Store (singleton)
│   ├── hooks.server.ts            # Auth-Guard für alle Routen
│   ├── app.html
│   └── routes/
│       ├── +layout.server.ts      # User an Svelte-Layout übergeben
│       ├── +layout.svelte         # App-Shell (Header, Tabs)
│       ├── login/
│       │   ├── +page.svelte       # Login-Formular
│       │   └── +page.server.ts    # Login/Logout-Actions
│       ├── api/
│       │   ├── projects/+server.ts
│       │   ├── links/+server.ts
│       │   ├── indd/+server.ts
│       │   ├── search/+server.ts
│       │   ├── thumb/[id]/+server.ts
│       │   ├── refresh/+server.ts
│       │   └── status/+server.ts
│       └── (app)/
│           ├── +page.svelte       # Hauptseite (drei Tabs)
│           └── +page.server.ts    # SSR: initiale Projektliste
├── cli.js                         # User-Verwaltung CLI
├── config.json                    # Kunden-Konfiguration
├── Dockerfile
├── docker-compose.yml
├── svelte.config.js
├── vite.config.ts
└── package.json
```

---

## Task 1: Projekt-Scaffolding

**Files:**
- Create: `package.json`
- Create: `svelte.config.js`
- Create: `vite.config.ts`
- Create: `src/app.html`
- Create: `tsconfig.json`

- [ ] **Step 1: SvelteKit initialisieren**

```bash
cd /Users/johannesosterkamp/ad_tools/fileorganizer
npm create svelte@latest . -- --template skeleton --types typescript --no-prettier --no-eslint --no-playwright --no-vitest
```

Wenn interaktiv gefragt: Skeleton project, TypeScript, keine Extras.

- [ ] **Step 2: Dependencies installieren**

```bash
npm install better-sqlite3 bcryptjs minisearch sharp
npm install --save-dev @types/better-sqlite3 @types/bcryptjs @types/node
```

- [ ] **Step 3: Node-Adapter installieren**

```bash
npm install @sveltejs/adapter-node
```

- [ ] **Step 4: svelte.config.js auf Node-Adapter umstellen**

```js
// svelte.config.js
import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ out: 'build' })
  }
};

export default config;
```

- [ ] **Step 5: Vitest einrichten**

```bash
npm install --save-dev vitest @vitest/ui
```

`vite.config.ts` anpassen:

```ts
import { sveltekit } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node'
  }
});
```

- [ ] **Step 6: Verzeichnisse anlegen**

```bash
mkdir -p src/lib/server src/routes/login src/routes/api/projects \
  src/routes/api/links src/routes/api/indd src/routes/api/search \
  "src/routes/api/thumb/[id]" src/routes/api/refresh src/routes/api/status \
  "src/routes/(app)"
```

- [ ] **Step 7: Commit**

```bash
git init
git add -A
git commit -m "feat: scaffold SvelteKit project with Node adapter"
```

---

## Task 2: Types & Config

**Files:**
- Create: `src/lib/types.ts`
- Create: `src/lib/server/config.ts`
- Create: `config.json`

- [ ] **Step 1: Shared types definieren**

```ts
// src/lib/types.ts

export interface ProjectFile {
  name: string;
  ext: string;
  thumbId: string | null;  // SHA-256-Hash des Dateipfads, für /api/thumb/:id
  datum: string;
  search: string;
}

export interface Project {
  id: string;              // Projektnummer z.B. "P260031"
  folder: string;          // Absoluter Pfad zum Projektordner
  meta: {
    projekt_nr: string;
    jahr: string;
    client: string;
    name: string;
    name_raw: string;
  };
  files: ProjectFile[];
  isArchiv: boolean;
  missingLinks: boolean;
}

export interface InddLinkEntry {
  indd: string;
  proj: string;
  name: string;
  folder: string;
}

export interface InddEntry {
  proj: string;
  name: string;
  folder: string;
  links: string[];
}

export interface AppUser {
  id: number;
  email: string;
}

export interface AppConfig {
  volume: string;
  clients: Array<{
    folder: string;
    pattern: 'P-nummer';
  }>;
}
```

- [ ] **Step 2: Config-Test schreiben**

```ts
// src/lib/server/config.test.ts
import { describe, it, expect } from 'vitest';
import { loadConfig } from './config.js';
import { writeFileSync, unlinkSync } from 'fs';

describe('loadConfig', () => {
  it('loads and validates a valid config', () => {
    const path = '/tmp/test-config.json';
    writeFileSync(path, JSON.stringify({
      volume: '/data/projekte',
      clients: [{ folder: 'BUESCH', pattern: 'P-nummer' }]
    }));
    const cfg = loadConfig(path);
    expect(cfg.volume).toBe('/data/projekte');
    expect(cfg.clients).toHaveLength(1);
    unlinkSync(path);
  });

  it('throws if config is missing required fields', () => {
    const path = '/tmp/test-config-bad.json';
    writeFileSync(path, JSON.stringify({ volume: '/data' }));
    expect(() => loadConfig(path)).toThrow();
    unlinkSync(path);
  });
});
```

- [ ] **Step 3: Test ausführen — muss fehlschlagen**

```bash
npx vitest run src/lib/server/config.test.ts
```

Erwartet: FAIL (loadConfig nicht definiert)

- [ ] **Step 4: config.ts implementieren**

```ts
// src/lib/server/config.ts
import { readFileSync } from 'fs';
import type { AppConfig } from '../types.js';

export function loadConfig(path: string): AppConfig {
  const raw = JSON.parse(readFileSync(path, 'utf-8'));
  if (!raw.volume || !Array.isArray(raw.clients) || raw.clients.length === 0) {
    throw new Error('Invalid config: volume and clients are required');
  }
  return raw as AppConfig;
}

const configPath = process.env.CONFIG_PATH ?? 'config.json';
export const config: AppConfig = loadConfig(configPath);
```

- [ ] **Step 5: Beispiel-config.json anlegen**

```json
{
  "volume": "/data/projekte",
  "clients": [
    { "folder": "BUESCH", "pattern": "P-nummer" },
    { "folder": "EMV",    "pattern": "P-nummer" }
  ]
}
```

- [ ] **Step 6: Test ausführen — muss bestehen**

```bash
npx vitest run src/lib/server/config.test.ts
```

Erwartet: PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/types.ts src/lib/server/config.ts src/lib/server/config.test.ts config.json
git commit -m "feat: add shared types and config loader"
```

---

## Task 3: Datenbank & Auth

**Files:**
- Create: `src/lib/server/db.ts`
- Create: `src/lib/server/auth.ts`

- [ ] **Step 1: DB-Test schreiben**

```ts
// src/lib/server/db.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createDb } from './db.js';

describe('db', () => {
  let db: ReturnType<typeof createDb>;

  beforeEach(() => {
    db = createDb(':memory:');
  });

  it('creates a user and finds them by email', () => {
    db.createUser('test@test.de', 'hashedpw');
    const user = db.findUserByEmail('test@test.de');
    expect(user?.email).toBe('test@test.de');
  });

  it('returns null for unknown email', () => {
    expect(db.findUserByEmail('ghost@test.de')).toBeNull();
  });

  it('creates and validates a session', () => {
    db.createUser('test@test.de', 'hashedpw');
    const user = db.findUserByEmail('test@test.de')!;
    const token = 'abc123';
    const expiry = Date.now() + 3600_000;
    db.createSession(token, user.id, expiry);
    const session = db.findSession(token);
    expect(session?.user_id).toBe(user.id);
  });

  it('returns null for expired session', () => {
    db.createUser('test@test.de', 'hashedpw');
    const user = db.findUserByEmail('test@test.de')!;
    db.createSession('expired', user.id, Date.now() - 1000);
    expect(db.findSession('expired')).toBeNull();
  });
});
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

```bash
npx vitest run src/lib/server/db.test.ts
```

Erwartet: FAIL

- [ ] **Step 3: db.ts implementieren**

```ts
// src/lib/server/db.ts
import Database from 'better-sqlite3';

export function createDb(path: string) {
  const db = new Database(path);

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS rate_limits (
      email TEXT PRIMARY KEY,
      attempts INTEGER DEFAULT 0,
      locked_until INTEGER DEFAULT 0
    );
  `);

  return {
    createUser(email: string, passwordHash: string) {
      db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, passwordHash);
    },
    findUserByEmail(email: string) {
      return db.prepare('SELECT * FROM users WHERE email = ?').get(email) as
        { id: number; email: string; password_hash: string } | null;
    },
    deleteUser(email: string) {
      db.prepare('DELETE FROM users WHERE email = ?').run(email);
    },
    createSession(token: string, userId: number, expiresAt: number) {
      db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expiresAt);
    },
    findSession(token: string) {
      const now = Date.now();
      return db.prepare('SELECT * FROM sessions WHERE token = ? AND expires_at > ?').get(token, now) as
        { token: string; user_id: number; expires_at: number } | null;
    },
    deleteSession(token: string) {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    },
    deleteExpiredSessions() {
      db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
    },
    getRateLimit(email: string) {
      return db.prepare('SELECT * FROM rate_limits WHERE email = ?').get(email) as
        { email: string; attempts: number; locked_until: number } | null;
    },
    incrementRateLimit(email: string) {
      db.prepare(`
        INSERT INTO rate_limits (email, attempts) VALUES (?, 1)
        ON CONFLICT(email) DO UPDATE SET attempts = attempts + 1
      `).run(email);
    },
    lockRateLimit(email: string, until: number) {
      db.prepare('UPDATE rate_limits SET locked_until = ?, attempts = 0 WHERE email = ?').run(until, email);
    },
    resetRateLimit(email: string) {
      db.prepare('DELETE FROM rate_limits WHERE email = ?').run(email);
    }
  };
}

// Singleton für Produktion
import { mkdirSync } from 'fs';
const DATA_DIR = process.env.DATA_DIR ?? './data';
mkdirSync(DATA_DIR, { recursive: true });
export const db = createDb(`${DATA_DIR}/users.db`);
```

- [ ] **Step 4: Test ausführen — muss bestehen**

```bash
npx vitest run src/lib/server/db.test.ts
```

Erwartet: PASS

- [ ] **Step 5: auth.ts implementieren**

```ts
// src/lib/server/auth.ts
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { db } from './db.js';
import type { RequestEvent } from '@sveltejs/kit';

const SESSION_COOKIE = 'session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;       // 8 Stunden
const SESSION_LONG_MS = 30 * 24 * 60 * 60 * 1000; // 30 Tage

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

export function createSession(event: RequestEvent, userId: number, remember: boolean): void {
  const token = generateToken();
  const ttl = remember ? SESSION_LONG_MS : SESSION_TTL_MS;
  const expiresAt = Date.now() + ttl;
  db.createSession(token, userId, expiresAt);
  event.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: ttl / 1000,
    path: '/'
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
  const user = db.prepare?.('SELECT id, email FROM users WHERE id = ?') ??
    // fallback: search directly
    null;
  // Direkte DB-Abfrage
  const dbUser = (db as any)._db?.prepare('SELECT id, email FROM users WHERE id = ?').get(session.user_id);
  return dbUser ?? null;
}
```

Hinweis: `getSessionUser` wird in `hooks.server.ts` verwendet. Der direkte DB-Zugriff wird im nächsten Schritt sauber gelöst indem `findUserById` zur `createDb`-Funktion hinzugefügt wird.

- [ ] **Step 6: findUserById zu db.ts hinzufügen**

In `src/lib/server/db.ts` innerhalb des `return`-Blocks ergänzen:

```ts
    findUserById(id: number) {
      return db.prepare('SELECT id, email FROM users WHERE id = ?').get(id) as
        { id: number; email: string } | null;
    },
```

- [ ] **Step 7: auth.ts getSessionUser bereinigen**

```ts
// getSessionUser in src/lib/server/auth.ts ersetzen:
export function getSessionUser(event: RequestEvent): { id: number; email: string } | null {
  const token = event.cookies.get(SESSION_COOKIE);
  if (!token) return null;
  const session = db.findSession(token);
  if (!session) return null;
  return db.findUserById(session.user_id);
}
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/server/db.ts src/lib/server/db.test.ts src/lib/server/auth.ts
git commit -m "feat: add SQLite user/session store and auth helpers"
```

---

## Task 4: Auth-Hook & Login-Route

**Files:**
- Create: `src/hooks.server.ts`
- Create: `src/routes/login/+page.server.ts`
- Create: `src/routes/login/+page.svelte`
- Create: `src/routes/+layout.server.ts`

- [ ] **Step 1: hooks.server.ts — Auth-Guard**

```ts
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { getSessionUser } from '$lib/server/auth.js';

export const handle: Handle = async ({ event, resolve }) => {
  const user = getSessionUser(event);
  event.locals.user = user;

  const isLoginPage = event.url.pathname === '/login';
  const isApiPublic = false; // alle API-Routen erfordern Auth

  if (!user && !isLoginPage) {
    redirect(302, '/login');
  }

  if (user && isLoginPage) {
    redirect(302, '/');
  }

  return resolve(event);
};
```

- [ ] **Step 2: app.d.ts — Locals typisieren**

```ts
// src/app.d.ts
declare global {
  namespace App {
    interface Locals {
      user: { id: number; email: string } | null;
    }
  }
}
export {};
```

- [ ] **Step 3: Login-Action schreiben**

```ts
// src/routes/login/+page.server.ts
import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { db } from '$lib/server/db.js';
import { verifyPassword, createSession } from '$lib/server/auth.js';

const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;

export const actions: Actions = {
  default: async (event) => {
    const data = await event.request.formData();
    const email = String(data.get('email') ?? '').toLowerCase().trim();
    const password = String(data.get('password') ?? '');
    const remember = data.get('remember') === 'on';

    if (!email || !password) {
      return fail(400, { error: 'E-Mail und Passwort erforderlich' });
    }

    // Rate-Limit prüfen
    const rl = db.getRateLimit(email);
    if (rl && rl.locked_until > Date.now()) {
      const minutes = Math.ceil((rl.locked_until - Date.now()) / 60_000);
      return fail(429, { error: `Zu viele Versuche. Bitte ${minutes} Minute(n) warten.` });
    }

    const user = db.findUserByEmail(email);
    if (!user) {
      db.incrementRateLimit(email);
      return fail(401, { error: 'E-Mail oder Passwort falsch' });
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      db.incrementRateLimit(email);
      const rlAfter = db.getRateLimit(email);
      if (rlAfter && rlAfter.attempts >= MAX_ATTEMPTS) {
        db.lockRateLimit(email, Date.now() + LOCK_MS);
      }
      return fail(401, { error: 'E-Mail oder Passwort falsch' });
    }

    db.resetRateLimit(email);
    createSession(event, user.id, remember);
    redirect(302, '/');
  }
};
```

- [ ] **Step 4: Login-Seite bauen**

```svelte
<!-- src/routes/login/+page.svelte -->
<script lang="ts">
  import type { ActionData } from './$types';
  export let form: ActionData;
</script>

<svelte:head><title>Login — Fileorganizer</title></svelte:head>

<div class="login-wrap">
  <div class="login-box">
    <h1>art&amp;design</h1>
    <p class="subtitle">Projekt-Index</p>

    <form method="POST">
      {#if form?.error}
        <div class="error">{form.error}</div>
      {/if}

      <label>
        E-Mail
        <input type="email" name="email" required autofocus
          value={form?.email ?? ''} />
      </label>

      <label>
        Passwort
        <input type="password" name="password" required />
      </label>

      <label class="remember">
        <input type="checkbox" name="remember" />
        30 Tage eingeloggt bleiben
      </label>

      <button type="submit">Anmelden</button>
    </form>
  </div>
</div>

<style>
  .login-wrap {
    min-height: 100vh; display: flex;
    align-items: center; justify-content: center;
    background: #f0f0f0;
  }
  .login-box {
    background: white; padding: 40px;
    border-radius: 12px; width: 340px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.1);
  }
  h1 { font-size: 22px; font-weight: 700; color: #1a1a1a; }
  .subtitle { font-size: 13px; color: #999; margin-bottom: 28px; }
  label { display: flex; flex-direction: column; gap: 5px;
    font-size: 13px; font-weight: 600; color: #555; margin-bottom: 14px; }
  input[type=email], input[type=password] {
    padding: 9px 12px; border: 1px solid #ddd; border-radius: 6px;
    font-size: 14px; outline: none; transition: border-color 0.15s;
  }
  input:focus { border-color: #1a1a1a; }
  .remember { flex-direction: row; align-items: center;
    font-weight: 400; color: #777; gap: 8px; }
  button {
    width: 100%; padding: 11px; background: #1a1a1a; color: white;
    border: none; border-radius: 6px; font-size: 14px;
    font-weight: 600; cursor: pointer; margin-top: 8px;
  }
  button:hover { background: #333; }
  .error {
    background: #fef2f2; color: #c0392b;
    padding: 10px 12px; border-radius: 6px;
    font-size: 13px; margin-bottom: 16px;
  }
</style>
```

- [ ] **Step 5: Layout-Server für User-Weitergabe**

```ts
// src/routes/+layout.server.ts
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
  return { user: locals.user };
};
```

- [ ] **Step 6: Logout-Route anlegen**

```bash
mkdir -p src/routes/logout
```

```ts
// src/routes/logout/+server.ts
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { destroySession } from '$lib/server/auth.js';

export const POST: RequestHandler = (event) => {
  destroySession(event);
  redirect(302, '/login');
};
```

- [ ] **Step 7: Dev-Server starten und Login testen**

```bash
npx vite dev
```

Browser: `http://localhost:5173` — sollte zu `/login` redirecten.
Da noch kein User existiert, ist das normal.

- [ ] **Step 8: Commit**

```bash
git add src/hooks.server.ts src/app.d.ts src/routes/login \
  src/routes/logout src/routes/+layout.server.ts
git commit -m "feat: add auth guard, login page and logout"
```

---

## Task 5: CLI — User-Verwaltung

**Files:**
- Create: `cli.js`

- [ ] **Step 1: CLI implementieren**

```js
#!/usr/bin/env node
// cli.js
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { mkdirSync } from 'fs';
import readline from 'readline';

const DATA_DIR = process.env.DATA_DIR ?? './data';
mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(`${DATA_DIR}/users.db`);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS rate_limits (
    email TEXT PRIMARY KEY,
    attempts INTEGER DEFAULT 0,
    locked_until INTEGER DEFAULT 0
  );
`);

const [,, command, email] = process.argv;

async function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans); }));
}

if (command === 'add-user') {
  if (!email) { console.error('Usage: node cli.js add-user <email>'); process.exit(1); }
  const password = await prompt(`Passwort für ${email}: `);
  const hash = await bcrypt.hash(password, 12);
  try {
    db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email.toLowerCase(), hash);
    console.log(`✓ User ${email} angelegt.`);
  } catch {
    console.error(`User ${email} existiert bereits.`);
  }

} else if (command === 'remove-user') {
  if (!email) { console.error('Usage: node cli.js remove-user <email>'); process.exit(1); }
  db.prepare('DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = ?)').run(email.toLowerCase());
  const result = db.prepare('DELETE FROM users WHERE email = ?').run(email.toLowerCase());
  if (result.changes > 0) console.log(`✓ User ${email} gelöscht.`);
  else console.error(`User ${email} nicht gefunden.`);

} else if (command === 'reset-password') {
  if (!email) { console.error('Usage: node cli.js reset-password <email>'); process.exit(1); }
  const password = await prompt(`Neues Passwort für ${email}: `);
  const hash = await bcrypt.hash(password, 12);
  const result = db.prepare('UPDATE users SET password_hash = ? WHERE email = ?').run(hash, email.toLowerCase());
  if (result.changes > 0) console.log(`✓ Passwort für ${email} geändert.`);
  else console.error(`User ${email} nicht gefunden.`);

} else if (command === 'list-users') {
  const users = db.prepare('SELECT email, created_at FROM users ORDER BY email').all();
  if (users.length === 0) console.log('Keine User angelegt.');
  else users.forEach(u => console.log(`  ${u.email}`));

} else {
  console.log('Befehle: add-user | remove-user | reset-password | list-users');
}
```

- [ ] **Step 2: Ersten Admin-User anlegen**

```bash
node cli.js add-user "johannes@art-design.de"
```

Passwort eingeben. Dann testen:

```bash
npx vite dev
```

Browser: `http://localhost:5173/login` — einloggen, sollte zu `/` redirecten.

- [ ] **Step 3: Commit**

```bash
git add cli.js
git commit -m "feat: add user management CLI"
```

---

## Task 6: Datei-Scanner

**Files:**
- Create: `src/lib/server/scanner.ts`
- Create: `src/lib/server/scanner.test.ts`

- [ ] **Step 1: Scanner-Test schreiben**

```ts
// src/lib/server/scanner.test.ts
import { describe, it, expect } from 'vitest';
import { parseFolderName, parseDateFromFilename } from './scanner.js';

describe('parseFolderName', () => {
  it('parses P-Nummer folder name correctly', () => {
    const result = parseFolderName('P260031_BUESCH_Aktion-Stullen-Spice');
    expect(result.projekt_nr).toBe('P260031');
    expect(result.client).toBe('BUESCH');
    expect(result.name).toBe('Aktion Stullen Spice');
    expect(result.jahr).toBe('2026');
  });

  it('returns folder name as name for unrecognized format', () => {
    const result = parseFolderName('UnbekannterOrdner');
    expect(result.name).toBe('UnbekannterOrdner');
    expect(result.projekt_nr).toBe('');
  });
});

describe('parseDateFromFilename', () => {
  it('extracts date from stem with _YY-MM_ pattern', () => {
    expect(parseDateFromFilename('Layout_26-03_A4')).toBe('03/2026');
  });

  it('returns empty string if no date found', () => {
    expect(parseDateFromFilename('Layout_final')).toBe('');
  });
});
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

```bash
npx vitest run src/lib/server/scanner.test.ts
```

Erwartet: FAIL

- [ ] **Step 3: scanner.ts implementieren**

```ts
// src/lib/server/scanner.ts
import { readdirSync, statSync, existsSync } from 'fs';
import { join, extname, basename, relative } from 'path';
import { createHash } from 'crypto';
import type { Project, ProjectFile } from '../types.js';
import { config } from './config.js';
import { extractInddLinks } from './indd-links.js';

const PROJECT_PATTERN = /^P\d{5,}/;
const SKIP_FOLDERS = new Set(['_thumbs', 'Material', '__MACOSX']);
const SKIP_PREFIXES = ['_', '.'];
const DESIGN_EXTENSIONS = new Set(['.pdf', '.indd', '.ai', '.eps', '.psd']);
const MAX_DEPTH = 2;

export function parseFolderName(folderName: string) {
  const match = folderName.match(/^(P(\d{2})\d+)_([^_-]+)[_-](.+)$/);
  if (match) {
    return {
      projekt_nr: match[1],
      jahr: '20' + match[2],
      client: match[3],
      name: match[4].replace(/-/g, ' '),
      name_raw: match[4],
    };
  }
  return { projekt_nr: '', jahr: '', client: '', name: folderName, name_raw: folderName };
}

export function parseDateFromFilename(stem: string): string {
  const m = stem.match(/_(\d{2})-(\d{2})(?:_|$)/);
  if (m) return `${m[2]}/20${m[1]}`;
  return '';
}

export function thumbId(filePath: string): string {
  return createHash('sha256').update(filePath).digest('hex').slice(0, 16);
}

function buildSearchTags(...parts: string[]): string {
  return parts.filter(Boolean).join(' ').replace(/[-_]/g, ' ').toLowerCase();
}

function shouldSkip(name: string): boolean {
  return SKIP_FOLDERS.has(name) || SKIP_PREFIXES.some(p => name.startsWith(p));
}

function findDesignFiles(dir: string, baseDepth: number): string[] {
  const results: string[] = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!shouldSkip(entry.name)) {
          const depth = fullPath.split('/').length - baseDepth - 1;
          if (depth < MAX_DEPTH) results.push(...findDesignFiles(fullPath, baseDepth));
        }
      } else if (DESIGN_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        results.push(fullPath);
      }
    }
  } catch { /* Lesefehler ignorieren */ }
  return results.sort();
}

export async function scanClient(clientFolder: string, clientPath: string, isArchiv = false): Promise<Project[]> {
  const projects: Project[] = [];

  const scanDir = (dir: string, archiv: boolean) => {
    let entries: string[] = [];
    try { entries = readdirSync(dir); } catch { return; }

    for (const entry of entries.sort()) {
      const fullPath = join(dir, entry);
      try {
        if (!statSync(fullPath).isDirectory()) continue;
      } catch { continue; }

      if (!PROJECT_PATTERN.test(entry)) {
        // Archiv-Unterordner durchsuchen
        if (entry === '_Archiv') {
          try {
            for (const yearDir of readdirSync(fullPath).sort()) {
              const yearPath = join(fullPath, yearDir);
              if (statSync(yearPath).isDirectory()) scanDir(yearPath, true);
            }
          } catch { /* ignorieren */ }
        }
        continue;
      }

      const meta = parseFolderName(entry);
      const baseDepth = fullPath.split('/').length;
      const filePaths = findDesignFiles(fullPath, baseDepth);

      if (filePaths.length === 0) continue;

      const inddPaths = filePaths.filter(p => extname(p).toLowerCase() === '.indd');
      const { linksPerIndd, missingLinks } = await extractInddLinksForProject(inddPaths, fullPath);

      const files: ProjectFile[] = filePaths.map(fp => {
        const ext = extname(fp).toLowerCase();
        const stem = basename(fp, ext);
        return {
          name: basename(fp),
          ext,
          thumbId: ['.indd', '.eps'].includes(ext) ? null : thumbId(fp),
          datum: parseDateFromFilename(stem),
          search: buildSearchTags(meta.projekt_nr, meta.name_raw, meta.client, stem, ext.slice(1), entry),
        };
      });

      projects.push({
        id: meta.projekt_nr || entry,
        folder: fullPath,
        meta,
        files,
        isArchiv: archiv,
        missingLinks,
        _inddLinks: linksPerIndd,
        _filePaths: filePaths,
      } as Project & { _inddLinks: Record<string, string[]>; _filePaths: string[] });
    }
  };

  scanDir(clientPath, isArchiv);
  return projects;
}

async function extractInddLinksForProject(inddPaths: string[], projectFolder: string) {
  const linksPerIndd: Record<string, string[]> = {};
  let missingLinks = false;

  for (const inddPath of inddPaths) {
    const links = extractInddLinks(inddPath);
    linksPerIndd[basename(inddPath)] = links;
    // Fehlende Links: prüfen ob Datei im Projektordner oder Material-Ordner liegt
    for (const link of links) {
      const candidates = [
        join(projectFolder, link),
        join(projectFolder, 'Material', link),
      ];
      if (!candidates.some(existsSync)) {
        missingLinks = true;
        break;
      }
    }
  }

  return { linksPerIndd, missingLinks };
}

export async function runFullScan(): Promise<Project[]> {
  const allProjects: Project[] = [];
  for (const client of config.clients) {
    const clientPath = join(config.volume, client.folder);
    if (!existsSync(clientPath)) continue;
    const projects = await scanClient(client.folder, clientPath);
    allProjects.push(...projects);
  }
  return allProjects;
}
```

- [ ] **Step 4: Test ausführen — muss bestehen**

```bash
npx vitest run src/lib/server/scanner.test.ts
```

Erwartet: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/scanner.ts src/lib/server/scanner.test.ts
git commit -m "feat: add file system scanner"
```

---

## Task 7: INDD-Link-Extraktion

**Files:**
- Create: `src/lib/server/indd-links.ts`

- [ ] **Step 1: indd-links.ts implementieren**

```ts
// src/lib/server/indd-links.ts
import { execFileSync } from 'child_process';

const LINK_EXTENSIONS = new Set(['.jpg', '.jpeg', '.tif', '.tiff', '.png', '.eps', '.ai', '.psd', '.svg']);
const MIN_NAME_LENGTH = 5;

export function extractInddLinks(inddPath: string): string[] {
  const found = new Set<string>();

  for (const encodingArgs of [[], ['-encoding', 'l']] as string[][]) {
    try {
      const output = execFileSync('strings', [...encodingArgs, inddPath], {
        timeout: 60_000,
        maxBuffer: 50 * 1024 * 1024,
      }).toString('utf-8', 0, 50 * 1024 * 1024);

      for (const line of output.split('\n')) {
        const trimmed = line.trim();
        const lastSlash = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
        const name = lastSlash >= 0 ? trimmed.slice(lastSlash + 1) : trimmed;
        const dotIdx = name.lastIndexOf('.');
        if (dotIdx < 1) continue;
        const ext = name.slice(dotIdx).toLowerCase();
        const stem = name.slice(0, dotIdx);
        if (LINK_EXTENSIONS.has(ext) && stem.length >= MIN_NAME_LENGTH - ext.length) {
          found.add(name);
        }
      }
    } catch { /* strings fehlgeschlagen — ignorieren */ }
  }

  return [...found].sort();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/server/indd-links.ts
git commit -m "feat: add INDD link extractor via strings"
```

---

## Task 8: Thumbnails

**Files:**
- Create: `src/lib/server/thumbnails.ts`

- [ ] **Step 1: thumbnails.ts implementieren**

```ts
// src/lib/server/thumbnails.ts
import { existsSync, mkdirSync } from 'fs';
import { join, extname } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);
const THUMB_SIZE = 500;

export function getThumbPath(cacheDir: string, id: string): string {
  return join(cacheDir, `${id}.jpg`);
}

export async function generateThumb(filePath: string, thumbPath: string): Promise<boolean> {
  const ext = extname(filePath).toLowerCase();
  mkdirSync(join(thumbPath, '..'), { recursive: true });

  if (existsSync(thumbPath)) return true;

  try {
    if (ext === '.pdf') {
      return await generatePdfThumb(filePath, thumbPath);
    } else if (['.psd', '.png', '.jpg', '.jpeg', '.tif', '.tiff'].includes(ext)) {
      return await generateImageThumb(filePath, thumbPath);
    } else if (['.ai', '.eps'].includes(ext)) {
      return await generateGhostscriptThumb(filePath, thumbPath);
    }
  } catch { /* ignorieren, kein Thumb */ }

  return false;
}

async function generatePdfThumb(pdfPath: string, thumbPath: string): Promise<boolean> {
  // ghostscript: erste Seite als JPEG
  await execFileAsync('gs', [
    '-dNOPAUSE', '-dBATCH', '-dSAFER',
    '-sDEVICE=jpeg',
    `-sOutputFile=${thumbPath}`,
    `-dDEVICEWIDTHPOINTS=${THUMB_SIZE}`,
    `-dDEVICEHEIGHTPOINTS=${Math.round(THUMB_SIZE * 1.414)}`,
    '-dFITBOX', '-dFirstPage=1', '-dLastPage=1',
    '-r144',
    pdfPath,
  ], { timeout: 30_000 });
  return existsSync(thumbPath);
}

async function generateImageThumb(filePath: string, thumbPath: string): Promise<boolean> {
  await sharp(filePath)
    .resize(THUMB_SIZE, Math.round(THUMB_SIZE * 1.414), { fit: 'inside' })
    .jpeg({ quality: 85 })
    .toFile(thumbPath);
  return existsSync(thumbPath);
}

async function generateGhostscriptThumb(filePath: string, thumbPath: string): Promise<boolean> {
  await execFileAsync('gs', [
    '-dNOPAUSE', '-dBATCH', '-dSAFER',
    '-sDEVICE=jpeg',
    `-sOutputFile=${thumbPath}`,
    `-dDEVICEWIDTHPOINTS=${THUMB_SIZE}`,
    `-dDEVICEHEIGHTPOINTS=${Math.round(THUMB_SIZE * 1.414)}`,
    '-dFITBOX', '-r144',
    filePath,
  ], { timeout: 30_000 });
  return existsSync(thumbPath);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/server/thumbnails.ts
git commit -m "feat: add thumbnail generator (ghostscript + sharp)"
```

---

## Task 9: Volltext-Suche

**Files:**
- Create: `src/lib/server/pdf-text.ts`
- Create: `src/lib/server/search-index.ts`

- [ ] **Step 1: pdf-text.ts implementieren**

```ts
// src/lib/server/pdf-text.ts
import { execFileSync } from 'child_process';

export function extractPdfText(pdfPath: string): string {
  try {
    return execFileSync('pdftotext', [pdfPath, '-'], {
      timeout: 30_000,
      maxBuffer: 10 * 1024 * 1024,
    }).toString('utf-8');
  } catch {
    return '';
  }
}

export function extractInddText(inddPath: string): string {
  try {
    // ASCII strings — best-effort für kurze Strings wie Produktnummern
    return execFileSync('strings', [inddPath], {
      timeout: 60_000,
      maxBuffer: 20 * 1024 * 1024,
    }).toString('utf-8');
  } catch {
    return '';
  }
}
```

- [ ] **Step 2: search-index.ts implementieren**

```ts
// src/lib/server/search-index.ts
import MiniSearch from 'minisearch';
import { extname } from 'path';
import type { Project } from '../types.js';
import { extractPdfText, extractInddText } from './pdf-text.js';

export interface SearchDoc {
  id: string;           // eindeutig: filePath
  fileName: string;
  projectName: string;
  projektnr: string;
  folder: string;
  ext: string;
  text: string;
}

export function buildSearchIndex(projects: (Project & { _filePaths: string[] })[]): MiniSearch<SearchDoc> {
  const index = new MiniSearch<SearchDoc>({
    fields: ['text', 'fileName', 'projectName', 'projektnr'],
    storeFields: ['fileName', 'projectName', 'projektnr', 'folder', 'ext'],
    searchOptions: { prefix: true, fuzzy: 0.15 },
  });

  const docs: SearchDoc[] = [];

  for (const project of projects) {
    for (const filePath of project._filePaths ?? []) {
      const ext = extname(filePath).toLowerCase();
      let text = '';
      if (ext === '.pdf') text = extractPdfText(filePath);
      else if (ext === '.indd') text = extractInddText(filePath);
      else continue; // AI/EPS/PSD — kein Text

      if (!text.trim()) continue;

      docs.push({
        id: filePath,
        fileName: filePath.split('/').pop()!,
        projectName: project.meta.name,
        projektnr: project.meta.projekt_nr,
        folder: project.folder,
        ext,
        text,
      });
    }
  }

  index.addAll(docs);
  return index;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/server/pdf-text.ts src/lib/server/search-index.ts
git commit -m "feat: add PDF text extraction and MiniSearch index"
```

---

## Task 10: In-Memory Store & Scan-Zyklus

**Files:**
- Create: `src/lib/store.ts`

- [ ] **Step 1: store.ts implementieren**

```ts
// src/lib/store.ts
import type { Project, InddLinkEntry, InddEntry } from './types.js';
import type MiniSearch from 'minisearch';
import type { SearchDoc } from './server/search-index.js';

interface AppStore {
  projects: Project[];
  linksMap: Record<string, InddLinkEntry[]>;   // bildname → INDDs
  inddMap: Record<string, InddEntry>;           // inddname → Bilder
  searchIndex: MiniSearch<SearchDoc> | null;
  lastScan: Date | null;
  scanning: boolean;
}

export const store: AppStore = {
  projects: [],
  linksMap: {},
  inddMap: {},
  searchIndex: null,
  lastScan: null,
  scanning: false,
};
```

- [ ] **Step 2: Scan-Runner als server hook ergänzen**

In `src/hooks.server.ts` am Anfang der Datei den initialen Scan starten:

```ts
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { getSessionUser } from '$lib/server/auth.js';
import { runFullScan } from '$lib/server/scanner.js';
import { buildSearchIndex } from '$lib/server/search-index.js';
import { store } from '$lib/store.js';
import type { Project, InddLinkEntry, InddEntry } from '$lib/types.js';

async function doScan() {
  if (store.scanning) return;
  store.scanning = true;
  try {
    const projects = await runFullScan() as (Project & { _inddLinks: Record<string, string[]>; _filePaths: string[] })[];

    // Verlinkungen-Indizes aufbauen
    const linksMap: Record<string, InddLinkEntry[]> = {};
    const inddMap: Record<string, InddEntry> = {};

    for (const proj of projects) {
      for (const [inddName, links] of Object.entries(proj._inddLinks ?? {})) {
        inddMap[inddName] = { proj: proj.meta.projekt_nr, name: proj.meta.name, folder: proj.folder, links };
        for (const img of links) {
          const key = img.toLowerCase();
          linksMap[key] ??= [];
          if (!linksMap[key].some(e => e.indd === inddName)) {
            linksMap[key].push({ indd: inddName, proj: proj.meta.projekt_nr, name: proj.meta.name, folder: proj.folder });
          }
        }
      }
    }

    const searchIndex = buildSearchIndex(projects);

    store.projects = projects;
    store.linksMap = linksMap;
    store.inddMap = inddMap;
    store.searchIndex = searchIndex;
    store.lastScan = new Date();
  } finally {
    store.scanning = false;
  }
}

// Initialer Scan beim Start
doScan();

// Automatischer Rescan alle 30 Minuten
setInterval(doScan, 30 * 60 * 1000);

export const handle: Handle = async ({ event, resolve }) => {
  const user = getSessionUser(event);
  event.locals.user = user;
  const isLoginPage = event.url.pathname === '/login';
  if (!user && !isLoginPage) redirect(302, '/login');
  if (user && isLoginPage) redirect(302, '/');
  return resolve(event);
};
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/store.ts src/hooks.server.ts
git commit -m "feat: add in-memory store and auto-scan cycle"
```

---

## Task 11: API-Routen

**Files:**
- Create: `src/routes/api/projects/+server.ts`
- Create: `src/routes/api/links/+server.ts`
- Create: `src/routes/api/indd/+server.ts`
- Create: `src/routes/api/search/+server.ts`
- Create: `src/routes/api/thumb/[id]/+server.ts`
- Create: `src/routes/api/refresh/+server.ts`
- Create: `src/routes/api/status/+server.ts`

- [ ] **Step 1: projects endpoint**

```ts
// src/routes/api/projects/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { store } from '$lib/store.js';

export const GET: RequestHandler = ({ locals }) => {
  if (!locals.user) error(401);
  return json(store.projects);
};
```

- [ ] **Step 2: links endpoint**

```ts
// src/routes/api/links/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { store } from '$lib/store.js';

export const GET: RequestHandler = ({ locals }) => {
  if (!locals.user) error(401);
  return json(store.linksMap);
};
```

- [ ] **Step 3: indd endpoint**

```ts
// src/routes/api/indd/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { store } from '$lib/store.js';

export const GET: RequestHandler = ({ locals }) => {
  if (!locals.user) error(401);
  return json(store.inddMap);
};
```

- [ ] **Step 4: search endpoint**

```ts
// src/routes/api/search/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { store } from '$lib/store.js';

export const GET: RequestHandler = ({ locals, url }) => {
  if (!locals.user) error(401);
  const q = url.searchParams.get('q')?.trim();
  if (!q || q.length < 2) return json([]);
  if (!store.searchIndex) return json([]);
  const results = store.searchIndex.search(q, { limit: 50 });
  return json(results);
};
```

- [ ] **Step 5: thumb endpoint**

```ts
// src/routes/api/thumb/[id]/+server.ts
import { error } from '@sveltejs/kit';
import { createReadStream, existsSync } from 'fs';
import type { RequestHandler } from './$types';
import { store } from '$lib/store.js';
import { getThumbPath, generateThumb } from '$lib/server/thumbnails.js';
import { thumbId } from '$lib/server/scanner.js';

const CACHE_DIR = process.env.DATA_DIR ? `${process.env.DATA_DIR}/thumbs` : './data/thumbs';

export const GET: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) error(401);

  const id = params.id;
  // Sicherheit: nur hex-Zeichen erlaubt
  if (!/^[0-9a-f]{16}$/.test(id)) error(400, 'Invalid thumb id');

  // Datei anhand ID aus dem Store finden
  let filePath: string | null = null;
  for (const proj of store.projects) {
    for (const file of proj.files) {
      if (file.thumbId === id) {
        filePath = `${proj.folder}/${file.name}`;
        break;
      }
    }
    if (filePath) break;
  }

  if (!filePath) error(404);

  const thumbPath = getThumbPath(CACHE_DIR, id);

  if (!existsSync(thumbPath)) {
    const ok = await generateThumb(filePath, thumbPath);
    if (!ok) error(404, 'Thumbnail could not be generated');
  }

  const stream = createReadStream(thumbPath);
  return new Response(stream as unknown as ReadableStream, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=86400',
    },
  });
};
```

- [ ] **Step 6: refresh endpoint**

```ts
// src/routes/api/refresh/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { store } from '$lib/store.js';
import { runFullScan } from '$lib/server/scanner.js';
import { buildSearchIndex } from '$lib/server/search-index.js';
import type { Project, InddLinkEntry, InddEntry } from '$lib/types.js';

export const POST: RequestHandler = async ({ locals }) => {
  if (!locals.user) error(401);
  if (store.scanning) return json({ status: 'already_scanning' });

  store.scanning = true;
  (async () => {
    try {
      const projects = await runFullScan() as (Project & { _inddLinks: Record<string, string[]>; _filePaths: string[] })[];
      const linksMap: Record<string, InddLinkEntry[]> = {};
      const inddMap: Record<string, InddEntry> = {};
      for (const proj of projects) {
        for (const [inddName, links] of Object.entries(proj._inddLinks ?? {})) {
          inddMap[inddName] = { proj: proj.meta.projekt_nr, name: proj.meta.name, folder: proj.folder, links };
          for (const img of links) {
            const key = img.toLowerCase();
            linksMap[key] ??= [];
            if (!linksMap[key].some(e => e.indd === inddName)) {
              linksMap[key].push({ indd: inddName, proj: proj.meta.projekt_nr, name: proj.meta.name, folder: proj.folder });
            }
          }
        }
      }
      store.projects = projects;
      store.linksMap = linksMap;
      store.inddMap = inddMap;
      store.searchIndex = buildSearchIndex(projects);
      store.lastScan = new Date();
    } finally {
      store.scanning = false;
    }
  })();

  return json({ status: 'scan_started' });
};
```

- [ ] **Step 7: status endpoint**

```ts
// src/routes/api/status/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { store } from '$lib/store.js';

export const GET: RequestHandler = ({ locals }) => {
  if (!locals.user) error(401);
  return json({
    lastScan: store.lastScan?.toISOString() ?? null,
    scanning: store.scanning,
    projectCount: store.projects.length,
    fileCount: store.projects.reduce((acc, p) => acc + p.files.length, 0),
  });
};
```

- [ ] **Step 8: Commit**

```bash
git add src/routes/api/
git commit -m "feat: add all API routes"
```

---

## Task 12: SSR & App-Layout

**Files:**
- Create: `src/routes/(app)/+page.server.ts`
- Create: `src/routes/+layout.svelte`

- [ ] **Step 1: SSR-Load für Hauptseite**

```ts
// src/routes/(app)/+page.server.ts
import type { PageServerLoad } from './$types';
import { store } from '$lib/store.js';

export const load: PageServerLoad = ({ locals }) => {
  return {
    user: locals.user,
    // Initiale Projektliste für SSR — Thumbnails werden client-seitig geladen
    initialProjects: store.projects,
    lastScan: store.lastScan?.toISOString() ?? null,
  };
};
```

- [ ] **Step 2: App-Layout mit Header**

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import type { LayoutData } from './$types';
  export let data: LayoutData;
</script>

<svelte:head>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f0f0f0; color: #333;
    }
    a { color: inherit; text-decoration: none; }
  </style>
</svelte:head>

<slot />
```

- [ ] **Step 3: Commit**

```bash
git add "src/routes/(app)" src/routes/+layout.svelte
git commit -m "feat: add SSR page load and app layout"
```

---

## Task 13: Frontend — Hauptseite (drei Tabs)

**Files:**
- Create: `src/routes/(app)/+page.svelte`
- Create: `src/lib/DateienTab.svelte`
- Create: `src/lib/VerlinkungsTab.svelte`
- Create: `src/lib/TextsucheTab.svelte`

- [ ] **Step 1: Hauptseite mit Tab-Logik**

```svelte
<!-- src/routes/(app)/+page.svelte -->
<script lang="ts">
  import type { PageData } from './$types';
  import DateienTab from '$lib/DateienTab.svelte';
  import VerlinkungsTab from '$lib/VerlinkungsTab.svelte';
  import TextsucheTab from '$lib/TextsucheTab.svelte';
  import { onMount } from 'svelte';

  export let data: PageData;

  let activeTab: 'dateien' | 'verlinkungen' | 'textsuche' = 'dateien';
  let searchQuery = '';
  let lastScan = data.lastScan;
  let scanning = false;

  async function refresh() {
    scanning = true;
    await fetch('/api/refresh', { method: 'POST' });
    // Status pollen bis Scan fertig
    const poll = setInterval(async () => {
      const s = await fetch('/api/status').then(r => r.json());
      if (!s.scanning) {
        clearInterval(poll);
        lastScan = s.lastScan;
        scanning = false;
        window.location.reload();
      }
    }, 2000);
  }

  function formatLastScan(iso: string | null): string {
    if (!iso) return 'Noch kein Scan';
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
    if (diff < 1) return 'Gerade eben';
    if (diff < 60) return `vor ${diff} Min.`;
    return `vor ${Math.floor(diff / 60)} Std.`;
  }

  async function logout() {
    await fetch('/logout', { method: 'POST' });
    window.location.href = '/login';
  }
</script>

<div class="app">
  <header>
    <span class="logo">📁 Projekt-Index</span>

    <nav class="tabs">
      <button class:active={activeTab === 'dateien'} on:click={() => activeTab = 'dateien'}>Dateien</button>
      <button class:active={activeTab === 'verlinkungen'} on:click={() => activeTab = 'verlinkungen'}>Verlinkungen</button>
      <button class:active={activeTab === 'textsuche'} on:click={() => activeTab = 'textsuche'}>Textsuche</button>
    </nav>

    {#if activeTab === 'dateien'}
      <input class="search" type="text" bind:value={searchQuery}
        placeholder="Suchen: Artikel, Projekt-Nr., Format …" autofocus />
    {/if}

    <div class="header-right">
      <button class="refresh-btn" on:click={refresh} disabled={scanning} title="Index neu aufbauen">
        {scanning ? '⏳' : '↻'}
      </button>
      <span class="last-scan">{formatLastScan(lastScan)}</span>
      <button class="logout-btn" on:click={logout}>Abmelden</button>
    </div>
  </header>

  <main>
    {#if activeTab === 'dateien'}
      <DateienTab projects={data.initialProjects} query={searchQuery} />
    {:else if activeTab === 'verlinkungen'}
      <VerlinkungsTab />
    {:else}
      <TextsucheTab />
    {/if}
  </main>
</div>

<style>
  .app { min-height: 100vh; display: flex; flex-direction: column; }
  header {
    background: #1a1a1a; color: white;
    padding: 10px 20px;
    position: sticky; top: 0; z-index: 100;
    display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
    box-shadow: 0 2px 8px rgba(0,0,0,0.35);
  }
  .logo { font-size: 15px; font-weight: 700; white-space: nowrap; }
  .tabs { display: flex; gap: 2px; background: #333; border-radius: 6px; padding: 3px; }
  .tabs button {
    padding: 5px 13px; border-radius: 4px; border: none;
    font-size: 12px; font-weight: 600; cursor: pointer;
    background: transparent; color: #999; transition: all 0.15s;
  }
  .tabs button.active { background: #555; color: white; }
  .search {
    flex: 1; min-width: 180px; max-width: 420px;
    padding: 7px 13px; border: none; border-radius: 6px;
    font-size: 14px; background: #333; color: white; outline: none;
  }
  .search::placeholder { color: #777; }
  .search:focus { background: #444; }
  .header-right { display: flex; align-items: center; gap: 10px; margin-left: auto; }
  .refresh-btn {
    background: none; border: none; color: #aaa; font-size: 18px;
    cursor: pointer; padding: 4px; line-height: 1;
  }
  .refresh-btn:hover { color: white; }
  .last-scan { font-size: 11px; color: #666; white-space: nowrap; }
  .logout-btn {
    font-size: 11px; color: #666; background: none; border: none;
    cursor: pointer; padding: 4px 8px;
  }
  .logout-btn:hover { color: #aaa; }
  main { flex: 1; padding: 16px 20px 48px; }
</style>
```

- [ ] **Step 2: DateienTab.svelte**

```svelte
<!-- src/lib/DateienTab.svelte -->
<script lang="ts">
  import type { Project } from './types.js';

  export let projects: Project[];
  export let query: string;

  type SortMode = 'newest' | 'oldest' | 'alpha';
  type YearFilter = string | 'all';

  let activeTypes: Set<string> = new Set();
  let activeYear: YearFilter = 'all';
  let showArchiv = false;
  let sortMode: SortMode = 'newest';

  const DESIGN_LABELS: Record<string, [string, string]> = {
    '.pdf':  ['PDF',  '#c0392b'],
    '.indd': ['INDD', '#2c3e8c'],
    '.ai':   ['AI',   '#e8821a'],
    '.eps':  ['EPS',  '#27ae60'],
    '.psd':  ['PSD',  '#1a6bb5'],
  };

  const EMOJIS: Record<string, string> = {
    '.pdf': '📄', '.indd': '📐', '.ai': '✏️', '.eps': '📋', '.psd': '🖼️'
  };

  $: allTypes = [...new Set(projects.flatMap(p => p.files.map(f => f.ext)))].sort();
  $: allYears = [...new Set(projects.map(p => p.meta.jahr).filter(Boolean))].sort().reverse();

  $: filtered = projects
    .filter(p => showArchiv || !p.isArchiv)
    .filter(p => activeYear === 'all' || p.meta.jahr === activeYear)
    .flatMap(p => {
      const files = p.files.filter(f => {
        if (activeTypes.size > 0 && !activeTypes.has(f.ext)) return false;
        if (!query) return true;
        return f.search.includes(query.toLowerCase());
      });
      return files.length ? [{ ...p, files }] : [];
    })
    .sort((a, b) => {
      if (sortMode === 'alpha') return a.meta.name.localeCompare(b.meta.name);
      const na = parseInt(a.meta.projekt_nr.replace(/\D/g, ''));
      const nb = parseInt(b.meta.projekt_nr.replace(/\D/g, ''));
      return sortMode === 'newest' ? nb - na : na - nb;
    });

  function toggleType(ext: string) {
    if (activeTypes.has(ext)) activeTypes.delete(ext);
    else activeTypes.add(ext);
    activeTypes = new Set(activeTypes);
  }

  const RECENTLY_VIEWED_KEY = 'fo_recently_viewed';
  function getRecentlyViewed(): string[] {
    try { return JSON.parse(localStorage.getItem(RECENTLY_VIEWED_KEY) ?? '[]'); } catch { return []; }
  }
  function trackOpen(folder: string) {
    const recent = getRecentlyViewed().filter(f => f !== folder);
    recent.unshift(folder);
    localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(recent.slice(0, 5)));
  }
</script>

<div class="controls">
  <div class="type-filters">
    {#each allTypes as ext}
      {@const [label, color] = DESIGN_LABELS[ext] ?? [ext.toUpperCase(), '#888']}
      <button
        class="type-btn"
        class:active={activeTypes.has(ext)}
        style="--c:{color}"
        on:click={() => toggleType(ext)}>
        {label}
      </button>
    {/each}
  </div>

  <div class="row2">
    <div class="year-filters">
      <button class:active={activeYear === 'all'} on:click={() => activeYear = 'all'}>Alle Jahre</button>
      {#each allYears as year}
        <button class:active={activeYear === year} on:click={() => activeYear = year}>{year}</button>
      {/each}
    </div>

    <label class="archiv-toggle">
      <input type="checkbox" bind:checked={showArchiv} /> Archiv einblenden
    </label>

    <select bind:value={sortMode}>
      <option value="newest">Neueste zuerst</option>
      <option value="oldest">Älteste zuerst</option>
      <option value="alpha">Alphabetisch</option>
    </select>

    <span class="count">{filtered.reduce((a, p) => a + p.files.length, 0)} Dateien</span>
  </div>
</div>

{#if filtered.length === 0}
  <div class="empty">Keine Ergebnisse gefunden.</div>
{:else}
  {#each filtered as proj}
    <div class="section">
      <div class="section-header">
        {proj.meta.projekt_nr} — {proj.meta.name}
        {#if proj.isArchiv}<span class="archiv-badge">Archiv</span>{/if}
        {#if proj.missingLinks}<span class="missing-badge" title="INDD hat fehlende Links">⚠️</span>{/if}
      </div>
      <div class="grid">
        {#each proj.files as file}
          {@const [label, color] = DESIGN_LABELS[file.ext] ?? [file.ext.toUpperCase(), '#888']}
          <a
            class="card"
            href={`file://${proj.folder}`}
            on:click={() => trackOpen(proj.folder)}>
            {#if file.thumbId}
              <img class="thumb" src={`/api/thumb/${file.thumbId}`} loading="lazy" alt="" />
            {:else}
              <div class="thumb-placeholder">{EMOJIS[file.ext] ?? '📄'}</div>
            {/if}
            <div class="card-body">
              <div class="card-top">
                <span class="proj-nr">{proj.meta.projekt_nr} · {proj.meta.client}</span>
                <span class="badge" style="background:{color}">{label}</span>
              </div>
              <div class="card-name">{proj.meta.name}</div>
              <div class="card-file">{file.name}</div>
              {#if file.datum}<div class="card-date">{file.datum}</div>{/if}
            </div>
          </a>
        {/each}
      </div>
    </div>
  {/each}
{/if}

<style>
  .controls { margin-bottom: 16px; display: flex; flex-direction: column; gap: 8px; }
  .type-filters, .row2 { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .type-btn {
    padding: 4px 10px; border-radius: 4px; border: none;
    font-size: 11px; font-weight: 700; cursor: pointer;
    color: white; background: var(--c); opacity: 0.4; transition: opacity 0.15s;
  }
  .type-btn.active { opacity: 1; }
  .year-filters { display: flex; gap: 4px; }
  .year-filters button {
    padding: 4px 9px; border-radius: 4px; border: 1px solid #ddd;
    font-size: 11px; background: white; cursor: pointer; color: #666;
  }
  .year-filters button.active { background: #1a1a1a; color: white; border-color: #1a1a1a; }
  .archiv-toggle { font-size: 12px; color: #888; display: flex; align-items: center; gap: 5px; }
  select { font-size: 12px; padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; }
  .count { font-size: 12px; color: #999; margin-left: auto; }
  .empty { text-align: center; padding: 80px 20px; color: #bbb; font-size: 16px; }
  .section { margin-top: 24px; }
  .section-header {
    font-size: 11px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.09em; color: #999; margin-bottom: 10px;
    padding-bottom: 5px; border-bottom: 1px solid #ddd;
    display: flex; align-items: center; gap: 8px;
  }
  .archiv-badge { font-size: 10px; background: #f0f0f0; color: #aaa; padding: 1px 6px; border-radius: 3px; }
  .missing-badge { font-size: 13px; }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 12px;
  }
  .card {
    background: white; border-radius: 8px; overflow: hidden;
    box-shadow: 0 1px 4px rgba(0,0,0,0.09);
    transition: transform 0.12s, box-shadow 0.12s;
    display: flex; flex-direction: column;
  }
  .card:hover { transform: translateY(-2px); box-shadow: 0 5px 14px rgba(0,0,0,0.14); }
  .thumb { width: 100%; aspect-ratio: 3/4; object-fit: cover; object-position: top; display: block; }
  .thumb-placeholder {
    width: 100%; aspect-ratio: 3/4;
    display: flex; align-items: center; justify-content: center;
    font-size: 36px; background: #f4f4f4;
  }
  .card-body { padding: 8px 10px 10px; flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .card-top { display: flex; align-items: center; justify-content: space-between; gap: 4px; }
  .proj-nr { font-size: 10px; color: #aaa; font-weight: 500; }
  .badge { font-size: 9px; font-weight: 800; color: white; padding: 2px 5px; border-radius: 3px; }
  .card-name { font-size: 12px; font-weight: 700; line-height: 1.3; margin-top: 2px; }
  .card-file { font-size: 10px; color: #bbb; margin-top: 3px; word-break: break-all; }
  .card-date { font-size: 10px; color: #ccc; margin-top: 2px; }
</style>
```

- [ ] **Step 3: VerlinkungsTab.svelte**

```svelte
<!-- src/lib/VerlinkungsTab.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { InddLinkEntry, InddEntry } from './types.js';

  let linksMap: Record<string, InddLinkEntry[]> = {};
  let inddMap: Record<string, InddEntry> = {};
  let loaded = false;
  let activeSubtab: 'bild' | 'indd' = 'bild';
  let bildQuery = '';
  let inddQuery = '';

  onMount(async () => {
    [linksMap, inddMap] = await Promise.all([
      fetch('/api/links').then(r => r.json()),
      fetch('/api/indd').then(r => r.json()),
    ]);
    loaded = true;
  });

  $: bildResults = bildQuery.length >= 2
    ? Object.entries(linksMap).filter(([k]) => k.includes(bildQuery.toLowerCase()))
    : [];

  $: inddResults = inddQuery.length >= 2
    ? Object.entries(inddMap).filter(([k]) => k.toLowerCase().includes(inddQuery.toLowerCase()))
    : [];
</script>

{#if !loaded}
  <div class="loading">Lade Verlinkungen …</div>
{:else}
  <div class="subtabs">
    <button class:active={activeSubtab === 'bild'} on:click={() => activeSubtab = 'bild'}>Bild → INDDs</button>
    <button class:active={activeSubtab === 'indd'} on:click={() => activeSubtab = 'indd'}>INDD → Bilder</button>
  </div>

  {#if activeSubtab === 'bild'}
    <input class="search" type="text" bind:value={bildQuery}
      placeholder="Bildname suchen, z.B. foto_sommer.jpg …" autofocus />
    {#if bildQuery.length < 2}
      <div class="empty">Mindestens 2 Zeichen eingeben.</div>
    {:else if bildResults.length === 0}
      <div class="empty">Kein Treffer — Dateiname prüfen.</div>
    {:else}
      {#each bildResults as [filename, usages]}
        <div class="result-group">
          <div class="result-title">{filename}</div>
          <div class="result-list">
            {#each usages as u}
              <div class="result-row">
                <span class="indd-name">{u.indd}</span>
                <span class="proj-label">{u.proj} · {u.name}</span>
                <a class="open-link" href={`file://${u.folder}`}>Ordner ↗</a>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    {/if}

  {:else}
    <input class="search" type="text" bind:value={inddQuery}
      placeholder="INDD suchen, z.B. P260031 oder Layout …" autofocus />
    {#if inddQuery.length < 2}
      <div class="empty">Mindestens 2 Zeichen eingeben.</div>
    {:else if inddResults.length === 0}
      <div class="empty">Kein Treffer — INDD-Namen prüfen.</div>
    {:else}
      {#each inddResults as [inddName, data]}
        <div class="result-group">
          <div class="result-title">
            {inddName}
            <a class="open-link" style="float:right;font-size:10px" href={`file://${data.folder}`}>Ordner ↗</a>
          </div>
          <div style="font-size:11px;color:#aaa;padding:4px 14px 4px">
            {data.proj} · {data.name} · {data.links.length} verlinkte Dateien
          </div>
          <div class="result-list">
            {#each data.links as img}
              <div class="result-row"><span class="indd-name">{img}</span></div>
            {/each}
          </div>
        </div>
      {/each}
    {/if}
  {/if}
{/if}

<style>
  .loading { text-align: center; padding: 60px; color: #bbb; }
  .subtabs { display: flex; border-bottom: 2px solid #e0e0e0; margin-bottom: 16px; }
  .subtabs button {
    padding: 8px 18px; border: none; background: none;
    font-size: 13px; font-weight: 600; color: #aaa; cursor: pointer;
    border-bottom: 2px solid transparent; margin-bottom: -2px;
  }
  .subtabs button.active { color: #333; border-bottom-color: #333; }
  .search {
    width: 100%; max-width: 500px; padding: 9px 14px;
    border: 1px solid #ddd; border-radius: 6px; font-size: 14px;
    outline: none; margin-bottom: 16px;
  }
  .search:focus { border-color: #1a1a1a; }
  .empty { text-align: center; padding: 60px; color: #bbb; }
  .result-group {
    background: white; border-radius: 8px; margin-bottom: 10px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.09); overflow: hidden;
  }
  .result-title {
    font-size: 12px; font-weight: 700; padding: 10px 14px 8px;
    border-bottom: 1px solid #f0f0f0; word-break: break-all;
  }
  .result-list { padding: 6px 14px 10px; display: flex; flex-direction: column; gap: 5px; }
  .result-row { display: flex; align-items: baseline; gap: 8px; }
  .indd-name { font-size: 12px; font-family: monospace; color: #2c3e8c; }
  .proj-label { font-size: 11px; color: #aaa; }
  .open-link { font-size: 10px; color: #2c3e8c; margin-left: auto; }
</style>
```

- [ ] **Step 4: TextsucheTab.svelte**

```svelte
<!-- src/lib/TextsucheTab.svelte -->
<script lang="ts">
  let query = '';
  let results: Array<{
    fileName: string; projectName: string;
    projektnr: string; folder: string; ext: string;
  }> = [];
  let searching = false;
  let searched = false;

  const BADGE_COLORS: Record<string, string> = {
    '.pdf': '#c0392b', '.indd': '#2c3e8c',
  };

  async function search() {
    if (query.trim().length < 2) return;
    searching = true;
    searched = false;
    const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
    results = await res.json();
    searching = false;
    searched = true;
  }
</script>

<div class="wrap">
  <form on:submit|preventDefault={search} class="search-form">
    <input
      type="text" bind:value={query}
      placeholder="Produktnummer, Text, Artikel …"
      autofocus />
    <button type="submit" disabled={searching || query.length < 2}>
      {searching ? '…' : 'Suchen'}
    </button>
  </form>

  <p class="hint">Durchsucht PDF-Text (zuverlässig) und INDD-Strings (best-effort).</p>

  {#if searching}
    <div class="empty">Suche läuft …</div>
  {:else if searched && results.length === 0}
    <div class="empty">Kein Treffer für „{query}".</div>
  {:else if results.length > 0}
    <div class="results">
      {#each results as r}
        <a class="result-card" href={`file://${r.folder}`}>
          <div class="result-top">
            <span class="proj">{r.projektnr} · {r.projectName}</span>
            <span class="badge" style="background:{BADGE_COLORS[r.ext] ?? '#888'}">
              {r.ext.toUpperCase().slice(1)}
            </span>
          </div>
          <div class="filename">{r.fileName}</div>
        </a>
      {/each}
    </div>
  {/if}
</div>

<style>
  .wrap { max-width: 700px; }
  .search-form { display: flex; gap: 8px; margin-bottom: 8px; }
  input {
    flex: 1; padding: 10px 14px; border: 1px solid #ddd;
    border-radius: 6px; font-size: 15px; outline: none;
  }
  input:focus { border-color: #1a1a1a; }
  button {
    padding: 10px 20px; background: #1a1a1a; color: white;
    border: none; border-radius: 6px; font-size: 14px;
    font-weight: 600; cursor: pointer;
  }
  button:disabled { opacity: 0.4; cursor: default; }
  .hint { font-size: 11px; color: #aaa; margin-bottom: 20px; }
  .empty { text-align: center; padding: 60px; color: #bbb; }
  .results { display: flex; flex-direction: column; gap: 8px; }
  .result-card {
    background: white; border-radius: 8px; padding: 12px 16px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.09);
    display: flex; flex-direction: column; gap: 4px;
    transition: box-shadow 0.12s;
  }
  .result-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.14); }
  .result-top { display: flex; align-items: center; justify-content: space-between; }
  .proj { font-size: 11px; color: #aaa; }
  .badge { font-size: 9px; font-weight: 800; color: white; padding: 2px 5px; border-radius: 3px; }
  .filename { font-size: 13px; font-weight: 600; color: #333; font-family: monospace; }
</style>
```

- [ ] **Step 5: Dev-Server testen**

```bash
npx vite dev
```

Browser: `http://localhost:5173` — alle drei Tabs testen. Da kein Volume gemountet ist, werden leere Ergebnisse zurückgegeben — das ist korrekt.

- [ ] **Step 6: Commit**

```bash
git add "src/routes/(app)/+page.svelte" src/lib/DateienTab.svelte \
  src/lib/VerlinkungsTab.svelte src/lib/TextsucheTab.svelte
git commit -m "feat: add main page with all three tabs (Dateien, Verlinkungen, Textsuche)"
```

---

## Task 14: Docker

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.dockerignore`
- Create: `.env.example`

- [ ] **Step 1: Produktions-Build testen**

```bash
npm run build
node build/index.js
```

Erwartet: Server startet auf Port 3000.

- [ ] **Step 2: Dockerfile erstellen**

```dockerfile
# Dockerfile
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app

# System-Tools: ghostscript, poppler-utils (pdftotext), binutils (strings), imagemagick
RUN apt-get update && apt-get install -y --no-install-recommends \
    ghostscript \
    poppler-utils \
    binutils \
    imagemagick \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY config.json ./config.json
COPY cli.js ./cli.js

ENV NODE_ENV=production
ENV DATA_DIR=/app/data
ENV CONFIG_PATH=/app/config.json
ENV PORT=3000

EXPOSE 3000
CMD ["node", "build/index.js"]
```

- [ ] **Step 3: .dockerignore erstellen**

```
node_modules
build
.svelte-kit
data
.env
*.md
```

- [ ] **Step 4: docker-compose.yml erstellen**

```yaml
# docker-compose.yml
services:
  fileorganizer:
    build: .
    container_name: fileorganizer
    volumes:
      - /volume1/Projekte:/data/projekte:ro   # NAS-Pfad hier anpassen!
      - ./data:/app/data
    environment:
      - NODE_ENV=production
      - DATA_DIR=/app/data
      - CONFIG_PATH=/app/config.json
    ports:
      - "3000:3000"
    restart: unless-stopped

  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: cloudflared
    command: tunnel --no-autoupdate run
    environment:
      - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
    restart: unless-stopped
    depends_on:
      - fileorganizer
```

- [ ] **Step 5: .env.example erstellen**

```
# .env.example — als .env kopieren und ausfüllen
CLOUDFLARE_TUNNEL_TOKEN=your_tunnel_token_here
```

- [ ] **Step 6: config.json für NAS anpassen**

NAS-seitigen Pfad eintragen (der `/volume1/Projekte`-Mount entspricht `/data/projekte` im Container):

```json
{
  "volume": "/data/projekte",
  "clients": [
    { "folder": "BUESCH", "pattern": "P-nummer" },
    { "folder": "EMV",    "pattern": "P-nummer" }
  ]
}
```

- [ ] **Step 7: Docker-Build testen (lokal)**

```bash
docker compose build
docker compose up
```

Browser: `http://localhost:3000` — Login-Seite erscheint.

- [ ] **Step 8: Commit**

```bash
git add Dockerfile docker-compose.yml .dockerignore .env.example
git commit -m "feat: add Docker and docker-compose configuration"
```

---

## Task 15: Cloudflare Tunnel Setup

**Hinweis:** Dieser Task läuft außerhalb des Codes — in der Cloudflare-Weboberfläche und auf dem NAS.

- [ ] **Step 1: Cloudflare-Account erstellen / einloggen**

`https://dash.cloudflare.com` → Zero Trust → Networks → Tunnels

- [ ] **Step 2: Neuen Tunnel anlegen**

Name: `fileorganizer` → `Docker` als Connector-Typ wählen → Token kopieren.

- [ ] **Step 3: Public Hostname konfigurieren**

In der Tunnel-Config:
- Subdomain: `index` (oder gewünschter Name)
- Domain: eure Domain (z.B. `art-design.de`)
- Service: `http://fileorganizer:3000`

- [ ] **Step 4: Token in .env eintragen**

```bash
echo "CLOUDFLARE_TUNNEL_TOKEN=<token>" > .env
```

- [ ] **Step 5: Auf dem NAS deployen**

```bash
# Dateien auf NAS kopieren (Synology Beispiel via scp):
scp -r . admin@nas-ip:/volume1/docker/fileorganizer/

# Auf dem NAS:
ssh admin@nas-ip
cd /volume1/docker/fileorganizer
node cli.js add-user "johannes@art-design.de"
docker compose up -d
```

- [ ] **Step 6: Erreichbarkeit testen**

Browser: `https://index.art-design.de` — Login-Seite erscheint, einloggen, Index zeigt BUESCH- und EMV-Projekte.

- [ ] **Step 7: Finaler Commit**

```bash
git add .
git commit -m "feat: complete fileorganizer v1.0"
```

---

## Spec-Abdeckung (Self-Review)

| Spec-Anforderung | Task |
|---|---|
| Docker + NAS-Mount | Task 14 |
| Cloudflare Tunnel | Task 15 |
| SvelteKit + Node-Adapter | Task 1 |
| Individuelle Logins + bcrypt | Task 3, 4 |
| Rate-Limiting (5 Versuche, 15 Min.) | Task 4 |
| Sessions 8h / 30 Tage | Task 3, 4 |
| CLI User-Verwaltung | Task 5 |
| Datei-Scanner (P-Nummern-Muster) | Task 6 |
| INDD-Links via strings | Task 7 |
| Thumbnails (ghostscript + sharp) | Task 8 |
| PDF-Volltext + MiniSearch | Task 9 |
| In-Memory-Store + 30-Min-Rescan | Task 10 |
| API-Routen (alle 7 Endpunkte) | Task 11 |
| SSR erster Load | Task 12 |
| Tab Dateien (Suche, Filter, Sort, Grid) | Task 13 |
| Jahres-Filter | Task 13 |
| Archiv ein/ausblenden | Task 13 |
| Fehlende-Links-Badge | Task 6, 13 |
| Zuletzt angesehen (localStorage) | Task 13 |
| Tab Verlinkungen (Bild→INDD + INDD→Bilder) | Task 13 |
| Tab Textsuche | Task 13 |
| Read-only (keine Dateioperationen) | ✓ (kein Upload/Delete implementiert) |
| config.json mit Kunden-Liste | Task 2 |
