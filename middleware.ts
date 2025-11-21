import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const ALLOWED_PATHS = new Set([
  '/',
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml',
  '/manifest.webmanifest',
])

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
  )
}

export function middleware(request: NextRequest) {
  const waitlistFlag =
    process.env.WAITLIST_MODE ?? process.env.NEXT_PUBLIC_WAITLIST_MODE ?? ''
  const waitlistEnabled = ['true', '1', 'yes', 'on'].includes(
    waitlistFlag.toLowerCase()
  )

  if (!waitlistEnabled) {
    return NextResponse.next()
  }

  const { pathname, search } = request.nextUrl

  if (ALLOWED_PATHS.has(pathname) || isAssetRequest(pathname)) {
    return NextResponse.next()
  }

  const redirectUrl = request.nextUrl.clone()
  redirectUrl.pathname = '/'
  redirectUrl.search = search

  return NextResponse.redirect(redirectUrl)
}

export const config = {
  // Run on everything (assets/API are allowed through in handler)
  matcher: ['/(.*)'],
}
