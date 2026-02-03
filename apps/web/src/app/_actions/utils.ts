'use server';

import { cookies } from 'next/headers';

/**
 * Retrieves the Privy authentication token from cookies or uses an explicitly provided token.
 *
 * This is a server-side helper for Next.js server actions that need to authenticate
 * requests with Privy. Prefers the HttpOnly `privy-token` cookie when available,
 * falling back to the explicit token.
 *
 * IMPORTANT: For wallet authentication with Privy's Node SDK, we need the Privy access token
 * (stored in `privy-token` cookie). The cookie is the authoritative source since it's set
 * by Privy's SDK directly. The explicit token parameter exists for cases where cookies
 * aren't available (e.g., external API clients).
 *
 * @param explicitToken - Optional fallback token if cookie is not available
 * @returns The Privy JWT token
 * @throws Error with descriptive message if no token is found
 */
export async function requirePrivyToken(
  explicitToken?: string
): Promise<string> {
  const cookieStore = await cookies();
  // Prefer the HttpOnly cookie - it's set by Privy's SDK and is the authoritative source
  // for the access token. The cookie should always be present for authenticated users
  // in browser contexts where server actions are called.
  const cookieToken = cookieStore.get('privy-token')?.value;
  const idToken = cookieStore.get('privy-id-token')?.value;

  // DEBUG: Log what tokens are available
  console.log('[requirePrivyToken] Token sources:', {
    hasCookieToken: !!cookieToken,
    hasIdToken: !!idToken,
    hasExplicitToken: !!explicitToken,
    cookieTokenLength: cookieToken?.length,
    explicitTokenLength: explicitToken?.length,
  });

  if (cookieToken) return cookieToken;

  // Fall back to explicit token for external clients/agents that don't have cookies
  if (explicitToken) return explicitToken;

  throw new Error(
    'Authentication required: no Privy token found. Please sign in and try again.'
  );
}
