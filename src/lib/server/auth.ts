// src/lib/server/auth.ts
import { randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import { db } from './db';

const SESSION_COOKIE = 'session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 Tage

export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

export async function createSession(userId: number, isSecure: boolean): Promise<void> {
  const token = generateToken();
  const expiresAt = Date.now() + SESSION_TTL_MS;
  db.createSession(token, userId, expiresAt);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    maxAge: SESSION_TTL_MS / 1000,
    path: '/',
  });
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    db.deleteSession(token);
    cookieStore.delete(SESSION_COOKIE);
  }
}

export async function getSessionUser(): Promise<{ id: number; email: string } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = db.findSession(token);
  if (!session) return null;
  return db.findUserById(session.user_id);
}
