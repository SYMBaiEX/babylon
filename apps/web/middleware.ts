import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const ALLOWED_PATHS = new Set([
  '/',
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml',
  '/manifest.webmanifest',
]);

function isAssetRequest(pathname: string) {
  return (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/assets') ||
    pathname.startsWith('/static') ||
    pathname.startsWith('/images') ||
    pathname.startsWith('/fonts') ||
    pathname.startsWith('/.well-known') ||
    pathname.startsWith('/_vercel') ||
    pathname.startsWith('/monitoring') ||
    /\.[^/]+$/.test(pathname)
  );
}

export function middleware(request: NextRequest) {
  const waitlistFlag =
    process.env.WAITLIST_MODE ?? process.env.NEXT_PUBLIC_WAITLIST_MODE ?? '';
  const waitlistEnabled = ['true', '1', 'yes', 'on'].includes(
    waitlistFlag.toLowerCase()
  );

  const { pathname, search } = request.nextUrl;

  // Waitlist mode: redirect everything except allowed paths to home
  if (waitlistEnabled) {
    if (ALLOWED_PATHS.has(pathname) || isAssetRequest(pathname)) {
      return NextResponse.next();
    }

    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/';
    redirectUrl.search = search;
    return NextResponse.redirect(redirectUrl);
  }

  // Normal mode: redirect homepage to /feed (server-side for better performance)
  // This eliminates client-side JS entirely for the homepage redirect
  if (pathname === '/') {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/feed';
    // Preserve query params (e.g., ?ref=xxx for referral codes)
    redirectUrl.search = search;
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Match all routes including root path
  // Using regex pattern that matches empty string and any path
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
