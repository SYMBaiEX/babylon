'use server';

import { cookies } from 'next/headers';

/**
 * Error thrown when authentication is required but no valid token is found.
 */
export class AuthenticationRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationRequiredError';
  }
}

/**
 * Retrieves the Privy authentication token from cookies or uses an explicitly provided token.
 *
 * This is a server-side helper for Next.js server actions that need to authenticate
 * requests with Privy. It first checks for an explicitly provided token (useful when
 * the client already has the token), then falls back to reading from the HttpOnly cookie.
 *
 * @param explicitToken - Optional token passed directly from the client
 * @returns The Privy JWT token
 * @throws AuthenticationRequiredError if no token is found in either location
 */
export async function requirePrivyToken(
  explicitToken?: string
): Promise<string> {
  if (explicitToken) return explicitToken;

  const cookieStore = await cookies();
  const token = cookieStore.get('privy-token')?.value;

  if (!token) {
    throw new AuthenticationRequiredError(
      'Authentication required: no Privy token found. Please sign in and try again.'
    );
  }

  return token;
}
