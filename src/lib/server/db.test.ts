import { describe, it, expect, beforeEach } from 'vitest';
import { createDb } from './db.js';
import Database from 'better-sqlite3';
import { mkdtempSync } from 'fs';
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

  describe('migration', () => {
    it('migrates old schema with password_hash', () => {
      const migPath = join(dir, 'migrate.db');

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
});
