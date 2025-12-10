import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// Middleware for runtime checks only
// Static redirects (/ -> /feed) are handled by next.config.ts redirects() for reliability

export function middleware(_request: NextRequest) {
  // Currently no runtime middleware logic needed
  // Waitlist redirects and homepage redirect are handled by next.config.ts
  return NextResponse.next();
}

export const config = {
  // Only run on paths that need runtime middleware logic
  // Currently disabled since redirects are in next.config.ts
  matcher: [],
};
