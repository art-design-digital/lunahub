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
      return (db.prepare('SELECT * FROM users WHERE email = ?').get(email) ?? null) as
        { id: number; email: string; password_hash: string } | null;
    },
    findUserById(id: number) {
      return (db.prepare('SELECT id, email FROM users WHERE id = ?').get(id) ?? null) as
        { id: number; email: string } | null;
    },
    deleteUser(email: string) {
      db.prepare('DELETE FROM users WHERE email = ?').run(email);
    },
    createSession(token: string, userId: number, expiresAt: number) {
      db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expiresAt);
    },
    findSession(token: string) {
      const now = Date.now();
      return (db.prepare('SELECT * FROM sessions WHERE token = ? AND expires_at > ?').get(token, now) ?? null) as
        { token: string; user_id: number; expires_at: number } | null;
    },
    deleteSession(token: string) {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    },
    deleteExpiredSessions() {
      db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
    },
    getRateLimit(email: string) {
      return (db.prepare('SELECT * FROM rate_limits WHERE email = ?').get(email) ?? null) as
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
