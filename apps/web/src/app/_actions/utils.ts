'use server';

import { cookies } from 'next/headers';

/**
 * Retrieves the Privy authentication token, preferring an explicit (fresh) token
 * over the HttpOnly cookie.
 *
 * The explicit token comes from `getAccessToken()` on the client which always
 * returns a freshly-refreshed JWT. The `privy-token` cookie is managed by
 * Privy's React SDK and may be stale or out-of-sync with the latest refresh,
 * which causes Privy's wallet authentication endpoint to reject it with
 * "400 Invalid JWT token provided" even though basic `verifyAuthToken` passes.
 *
 * @param explicitToken - Fresh token from `getAccessToken()` (preferred)
 * @returns The Privy JWT token
 * @throws Error with descriptive message if no token is found
 */
export async function requirePrivyToken(
  explicitToken?: string
): Promise<string> {
  // Prefer the explicit token — it comes from getAccessToken() and is always fresh.
  // The privy-token cookie may be stale or out-of-sync with the latest refresh.
  if (explicitToken) return explicitToken;

  const cookieStore = await cookies();
  const cookieToken = cookieStore.get('privy-token')?.value;
  if (cookieToken) return cookieToken;

  throw new Error(
    'Authentication required: no Privy token found. Please sign in and try again.'
  );
}
