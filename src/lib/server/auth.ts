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
  return db.findUserById(session.user_id);
}
