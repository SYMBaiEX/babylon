'use server';

import { cookies } from 'next/headers';

type PrivyTokenBundle = {
  /** Token we should use for auth/user context. */
  primary: string;
  /**
   * Optional fallback token (typically the other source: cookie vs explicit).
   * Used to retry wallet operations when Privy rejects a token as invalid/revoked.
   */
  fallback?: string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

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

/**
 * Retrieves both the explicit Privy token (if provided) and the HttpOnly cookie token.
 *
 * Why:
 * - The explicit token is generally fresher (comes from `getAccessToken()`).
 * - In rare cases, Privy can rotate/revoke tokens such that a previously-valid token still
 *   passes basic verification but is rejected by wallet endpoints with
 *   "Invalid JWT token provided".
 * - Having a fallback lets server actions retry once with the other token source.
 */
export async function requirePrivyTokenBundle(
  explicitToken?: string
): Promise<PrivyTokenBundle> {
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get('privy-token')?.value;

  const explicit = isNonEmptyString(explicitToken) ? explicitToken : undefined;
  const cookie = isNonEmptyString(cookieToken) ? cookieToken : undefined;

  if (explicit && cookie && explicit !== cookie) {
    return { primary: explicit, fallback: cookie };
  }
  if (explicit) return { primary: explicit };
  if (cookie) return { primary: cookie };

  throw new Error(
    'Authentication required: no Privy token found. Please sign in and try again.'
  );
}
