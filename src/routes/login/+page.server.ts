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
