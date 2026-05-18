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
