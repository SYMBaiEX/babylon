'use server';

import { cookies } from 'next/headers';

/**
 * Retrieves the Privy authentication token from cookies.
 *
 * IMPORTANT: Privy has THREE types of tokens:
 * 1. Customer Access Token (privy-token cookie) - returned by getAccessToken()
 * 2. Privy Access Token (localStorage only, no cookie) - internal to SDK
 * 3. Identity Token (privy-id-token cookie) - returned by getIdentityToken()
 *
 * For wallet authentication with Privy's Node SDK `authorization_context.user_jwts`,
 * we need to try different tokens because the API may expect a specific type.
 *
 * Based on SDK analysis, we try in this order:
 * 1. Identity Token (privy-id-token) - contains user identity claims
 * 2. Customer Access Token (privy-token) - fallback
 * 3. Explicit token parameter - for external API clients
 *
 * @param explicitToken - Optional fallback token if cookies are not available
 * @returns The Privy JWT token
 * @throws Error with descriptive message if no token is found
 */
export async function requirePrivyToken(
  explicitToken?: string
): Promise<string> {
  const cookieStore = await cookies();

  const accessToken = cookieStore.get('privy-token')?.value;
  const idToken = cookieStore.get('privy-id-token')?.value;

  // DEBUG: Log what tokens are available
  console.log('[requirePrivyToken] Token sources:', {
    hasAccessToken: !!accessToken,
    hasIdToken: !!idToken,
    hasExplicitToken: !!explicitToken,
    accessTokenLength: accessToken?.length,
    idTokenLength: idToken?.length,
    explicitTokenLength: explicitToken?.length,
  });

  // Try identity token first - Privy's wallet auth may expect this
  if (idToken) {
    console.log('[requirePrivyToken] Using identity token (privy-id-token)');
    return idToken;
  }

  // Fall back to customer access token
  if (accessToken) {
    console.log('[requirePrivyToken] Using access token (privy-token)');
    return accessToken;
  }

  // Fall back to explicit token for external clients/agents that don't have cookies
  if (explicitToken) {
    console.log('[requirePrivyToken] Using explicit token');
    return explicitToken;
  }

  throw new Error(
    'Authentication required: no Privy token found. Please sign in and try again.'
  );
}
