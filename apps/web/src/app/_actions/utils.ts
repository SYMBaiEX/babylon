'use server';

import { preferCookieAuth } from '@babylon/api';
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
 * Retrieves the Privy authentication token bundle.
 *
 * Token preference is environment-aware:
 * - **Production**: prefers the `privy-token` HttpOnly cookie (auto-managed by Privy SDK)
 * - **Staging / local**: prefers the explicit token from `getAccessToken()` (easier for testing)
 *
 * The non-preferred source is kept as a fallback so wallet operations can retry
 * once with the other token if the primary is rejected.
 *
 * @param explicitToken - Fresh token from `getAccessToken()` on the client
 * @returns The Privy JWT token bundle
 * @throws Error with descriptive message if no token is found
 */
export async function requirePrivyTokenBundle(
  explicitToken?: string
): Promise<PrivyTokenBundle> {
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get('privy-token')?.value;

  const explicit = isNonEmptyString(explicitToken) ? explicitToken : undefined;
  const cookie = isNonEmptyString(cookieToken) ? cookieToken : undefined;

  // When both sources are present and differ, pick the environment-preferred
  // source as primary and keep the other as fallback for retry.
  if (explicit && cookie && explicit !== cookie) {
    return preferCookieAuth()
      ? { primary: cookie, fallback: explicit }
      : { primary: explicit, fallback: cookie };
  }
  if (explicit) return { primary: explicit };
  if (cookie) return { primary: cookie };

  throw new Error(
    'Authentication required: no Privy token found. Please sign in and try again.'
  );
}
