// src/lib/server/db.ts
import Database from 'better-sqlite3';

export function createDb(path: string) {
  const sqliteDb = new Database(path);

  // Migrate: drop password_hash column and rate_limits table if they exist from old schema
  const hasPasswordHash = sqliteDb
    .prepare("SELECT COUNT(*) as cnt FROM pragma_table_info('users') WHERE name = 'password_hash'")
    .get() as { cnt: number };

  if (hasPasswordHash.cnt > 0) {
    sqliteDb.pragma('foreign_keys = OFF');
    sqliteDb.transaction(() => {
      sqliteDb.exec(`
        DROP TABLE IF EXISTS users_new;
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
    })();
    sqliteDb.pragma('foreign_keys = ON');
  }

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
      sqliteDb.transaction(() => {
        stmts.deleteUserSessions.run(email);
        stmts.deleteUser.run(email);
      })();
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
