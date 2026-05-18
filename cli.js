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
