import { NextResponse } from 'next/server';

/**
 * JSON 404 for unknown /api/* paths (instead of the HTML not-found page).
 * The handler cannot throw, so no error wrapper is needed. OPTIONS is also a
 * 404 here; CORS preflight for /api/* is answered in middleware first.
 */
function notFoundResponse(): NextResponse {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export const GET = notFoundResponse;
export const POST = notFoundResponse;
export const PUT = notFoundResponse;
export const PATCH = notFoundResponse;
export const DELETE = notFoundResponse;
export const OPTIONS = notFoundResponse;
