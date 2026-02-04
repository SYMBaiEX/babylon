import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const ALLOWED_PATHS = new Set([
  '/',
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml',
  '/manifest.webmanifest',
]);

const DEFAULT_WAITLIST_HOSTS = [
  'babylon.market',
  'www.babylon.market',
  'staging.babylon.market',
] as const;

function getWaitlistHosts(): Set<string> {
  const raw = process.env.WAITLIST_HOSTNAMES;
  if (!raw || raw.trim().length === 0) return new Set(DEFAULT_WAITLIST_HOSTS);
  return new Set(
    raw
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter((h) => h.length > 0)
  );
}

const APP_PUBLIC_EXACT_ALLOWLIST = new Set([
  '/',
  '/nft',
  '/share',
  '/api-docs',
  '/mcp',
  '/.well-known',
]);

const APP_PUBLIC_PREFIX_ALLOWLIST = [
  '/nft/',
  '/share/',
  '/api-docs/',
  '/mcp/',
  '/.well-known/',
  '/api/og/',
  '/api/auth/',
  '/api/users/onboarding/',
  '/api/onboarding/',
  '/api/upload/',
  '/api/waitlist/',
] as const;

function isAppPublicAllowlistedPath(pathname: string): boolean {
  if (APP_PUBLIC_EXACT_ALLOWLIST.has(pathname)) return true;
  return APP_PUBLIC_PREFIX_ALLOWLIST.some((prefix) =>
    pathname.startsWith(prefix)
  );
}

/**
 * Production and staging origins for CORS requests
 */
const PRODUCTION_ORIGINS = [
  'https://babylon.market',
  'https://www.babylon.market',
  'https://app.babylon.market',
  'https://play.babylon.market',
  'https://privy.babylon.market',
  'https://staging.babylon.market',
  'https://app.staging.babylon.market',
  'https://play.staging.babylon.market',
] as const;

/**
 * Development-only origins - only included when NODE_ENV is not 'production'
 */
const DEV_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
] as const;

/**
 * Parse additional CORS origins from environment variable.
 * CORS_ALLOWED_ORIGINS can be a comma-separated list of origins.
 * This allows adding preview domains, new subdomains, etc. without code changes.
 */
function getEnvOrigins(): string[] {
  const envOrigins = process.env.CORS_ALLOWED_ORIGINS;
  if (!envOrigins) return [];

  return envOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/**
 * Allowed origins for CORS requests.
 * Includes: production origins, env-driven origins, and dev origins (in non-production).
 * Set CORS_ALLOWED_ORIGINS env var to add additional origins (comma-separated).
 */
const ALLOWED_ORIGINS = new Set<string>([
  ...PRODUCTION_ORIGINS,
  ...getEnvOrigins(),
  ...(process.env.NODE_ENV !== 'production' ? DEV_ORIGINS : []),
]);

/**
 * Check if origin is allowed for CORS
 */
function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGINS.has(origin);
}

function isAssetRequest(pathname: string) {
  return (
    pathname.startsWith('/_next') ||
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

function isApiRequest(pathname: string) {
  return pathname.startsWith('/api');
}

/**
 * Check if this is an agent API route (handled separately in vercel.json)
 * Agent routes use Bearer token auth, not cookies, so they can have wildcard CORS
 */
function isAgentApiRequest(pathname: string) {
  return pathname.startsWith('/api/agents');
}

/**
 * Add CORS headers to response for API requests
 */
function addCorsHeaders(
  response: NextResponse,
  origin: string | null
): NextResponse {
  // For credentialed requests, must use specific origin (not *)
  if (origin && isAllowedOrigin(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    // Vary header prevents caching issues when origin changes
    response.headers.set('Vary', 'Origin');
  }

  response.headers.set(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, PATCH, DELETE, OPTIONS'
  );
  response.headers.set(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version, x-admin-token, x-dev-admin-token'
  );
  response.headers.set('Access-Control-Max-Age', '86400');

  return response;
}

function getHostname(request: NextRequest): string {
  const hostHeader = request.headers.get('host') ?? '';
  return hostHeader.split(':')[0]?.toLowerCase() ?? '';
}

function getWaitlistOrigin(hostname: string, protocol: string): string {
  const fromEnv = process.env.NEXT_PUBLIC_WAITLIST_URL?.trim();
  if (fromEnv && fromEnv.length > 0) return fromEnv;

  if (hostname.endsWith('staging.babylon.market')) {
    return `${protocol}//staging.babylon.market`;
  }
  if (hostname.endsWith('babylon.market')) {
    return `${protocol}//babylon.market`;
  }
  return `${protocol}//${hostname}`;
}

function getAppOrigin(hostname: string, protocol: string): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv && fromEnv.length > 0) return fromEnv;

  if (hostname.endsWith('staging.babylon.market')) {
    return `${protocol}//play.staging.babylon.market`;
  }
  if (hostname.endsWith('babylon.market')) {
    return `${protocol}//play.babylon.market`;
  }

  return `${protocol}//${hostname}`;
}

function isNftGatingEnabled(): boolean {
  const flag = process.env.NFT_GATING_ENABLED ?? '';
  return ['true', '1', 'yes', 'on'].includes(flag.toLowerCase());
}

function getAccessCacheMaxAgeSeconds(): number {
  const raw = process.env.ACCESS_GATE_CACHE_SECONDS?.trim();
  if (!raw) return 60;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) return 60;
  return Math.min(value, 300);
}

function buildWaitlistRedirectUrl(request: NextRequest): string {
  const hostname = getHostname(request);
  const origin = getWaitlistOrigin(hostname, request.nextUrl.protocol);

  const nextUrl = request.nextUrl.pathname + request.nextUrl.search;
  const params = new URLSearchParams();
  if (nextUrl !== '/' && nextUrl !== '') params.set('next', nextUrl);
  const qs = params.toString();

  return qs ? `${origin}/?${qs}` : `${origin}/`;
}

function isNftAccessResponse(
  value: unknown
): value is { success: true; data: { hasAccess: boolean } } {
  if (typeof value !== 'object' || value === null) return false;
  if (
    !('success' in value) ||
    (value as { success: unknown }).success !== true
  ) {
    return false;
  }
  if (!('data' in value)) return false;
  const data = (value as { data: unknown }).data;
  if (typeof data !== 'object' || data === null) return false;
  return 'hasAccess' in data;
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const origin = request.headers.get('origin');
  const hostname = getHostname(request);

  // Skip CORS handling for agent routes - handled in vercel.json with wildcard
  // Agent routes use Bearer token auth (not cookies), so they can use wildcard CORS
  if (isAgentApiRequest(pathname)) {
    return NextResponse.next();
  }

  // Handle CORS preflight (OPTIONS) requests for API routes
  if (request.method === 'OPTIONS' && isApiRequest(pathname)) {
    const response = new NextResponse(null, { status: 204 });
    return addCorsHeaders(response, origin);
  }

  // Handle API requests with CORS headers
  if (isApiRequest(pathname)) {
    const response = NextResponse.next();
    return addCorsHeaders(response, origin);
  }

  // Host-based routing:
  // - Waitlist hosts: show waitlist (landing + waitlist dashboard)
  // - Everything else: app host
  const isWaitlistHost = getWaitlistHosts().has(hostname);

  if (isWaitlistHost) {
    if (ALLOWED_PATHS.has(pathname) || isAssetRequest(pathname)) {
      return NextResponse.next();
    }

    // Keep the claim flow on the app host.
    if (pathname === '/nft' || pathname.startsWith('/nft/')) {
      const appOrigin = getAppOrigin(hostname, request.nextUrl.protocol);
      return NextResponse.redirect(`${appOrigin}${pathname}${search}`);
    }

    // Keep share + well-known pages accessible from the waitlist host.
    if (
      pathname === '/share' ||
      pathname.startsWith('/share/') ||
      pathname.startsWith('/.well-known/')
    ) {
      return NextResponse.next();
    }

    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/';
    redirectUrl.search = search;
    return NextResponse.redirect(redirectUrl);
  }

  // App host behavior: enforce gating via /api/nft/access for non-public pages.
  if (!isNftGatingEnabled()) {
    return NextResponse.next();
  }

  if (ALLOWED_PATHS.has(pathname) || isAssetRequest(pathname)) {
    return NextResponse.next();
  }

  if (isAppPublicAllowlistedPath(pathname)) {
    return NextResponse.next();
  }

  const cachedAccess = request.cookies.get('ba_access')?.value ?? null;
  if (cachedAccess === '1') {
    return NextResponse.next();
  }
  if (cachedAccess === '0') {
    return NextResponse.redirect(buildWaitlistRedirectUrl(request));
  }

  const hasAuthCookie = Boolean(request.cookies.get('privy-token')?.value);
  const hasAuthHeader = Boolean(request.headers.get('authorization'));

  if (!hasAuthCookie && !hasAuthHeader) {
    return NextResponse.redirect(buildWaitlistRedirectUrl(request));
  }

  const cookieHeader = request.headers.get('cookie') ?? '';
  const authHeader = request.headers.get('authorization') ?? '';
  const accessUrl = new URL(
    '/api/nft/access',
    request.nextUrl.origin
  ).toString();

  const responsePromise = (async () => {
    const maxAge = getAccessCacheMaxAgeSeconds();
    const secure = request.nextUrl.protocol === 'https:';

    let res: Response;
    try {
      res = await fetch(accessUrl, {
        method: 'GET',
        headers: {
          ...(cookieHeader ? { cookie: cookieHeader } : {}),
          ...(authHeader ? { authorization: authHeader } : {}),
          accept: 'application/json',
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(1200),
      });
    } catch {
      // Fail closed (redirect) but do not cache a negative result (avoids pinning during transient failures).
      return NextResponse.redirect(buildWaitlistRedirectUrl(request));
    }

    if (!res.ok) {
      // Fail closed (redirect) but do not cache a negative result (avoids pinning during transient failures).
      return NextResponse.redirect(buildWaitlistRedirectUrl(request));
    }

    const json = (await res.json()) as unknown;
    if (!isNftAccessResponse(json) || json.data.hasAccess !== true) {
      const redirect = NextResponse.redirect(buildWaitlistRedirectUrl(request));
      redirect.cookies.set('ba_access', '0', {
        httpOnly: true,
        secure,
        sameSite: 'lax',
        maxAge,
        path: '/',
      });
      return redirect;
    }

    const next = NextResponse.next();
    next.cookies.set('ba_access', '1', {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      maxAge,
      path: '/',
    });
    return next;
  })();

  return responsePromise;
}

export const config = {
  // Run on everything (assets/API are allowed through in handler)
  matcher: ['/(.*)'],
};
