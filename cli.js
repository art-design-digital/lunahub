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
