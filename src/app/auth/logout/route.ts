import { NextResponse } from 'next/server';
import { destroySession } from '@/lib/server/auth';

export async function POST() {
  await destroySession();
  return NextResponse.redirect(new URL('/login', process.env.ORIGIN || 'http://localhost:3000'));
}
