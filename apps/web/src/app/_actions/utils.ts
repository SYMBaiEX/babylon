'use server';

import { cookies } from 'next/headers';

/**
 * Retrieves the Privy authentication token from cookies (preferred) or an explicit parameter.
 *
 * Used by server actions that need to authenticate Privy-backed API calls.
 * Prefers the HttpOnly `privy-token` cookie which is set/managed by Privy's SDK.
 *
 * @param explicitToken - Optional fallback token if cookies are not available
 * @returns The Privy JWT token
 * @throws Error with descriptive message if no token is found
 */
export async function requirePrivyToken(
  explicitToken?: string
): Promise<string> {
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get('privy-token')?.value;

  if (cookieToken) return cookieToken;
  if (explicitToken) return explicitToken;

  throw new Error(
    'Authentication required: no Privy token found. Please sign in and try again.'
  );
}
