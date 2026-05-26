// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Next.js Edge middleware can't use better-sqlite3 (native module).
// Instead we do a lightweight cookie-presence check here and defer
// real session validation to the API routes / server components.
// The session cookie being present is a necessary (but not sufficient) condition.

const PUBLIC_PATHS = ['/login', '/auth/login', '/auth/callback'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }

  // Allow Next.js internals and static files
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon') || pathname === '/favicon.ico') {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get('session');

  if (!sessionCookie?.value) {
    // API routes get 401
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Pages get redirected to login
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // If user has session and tries to visit /login, redirect to /
  if (pathname === '/login' && sessionCookie?.value) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     */
    '/((?!_next/static|_next/image|favicon\\.ico).*)',
  ],
};
