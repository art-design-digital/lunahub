// src/lib/server/auth.ts
import { randomBytes } from 'crypto';
import { db } from './db.js';
import type { RequestEvent } from '@sveltejs/kit';

const SESSION_COOKIE = 'session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 Tage

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
