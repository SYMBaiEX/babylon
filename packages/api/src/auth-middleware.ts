/**
 * API Authentication Middleware
 *
 * @description Middleware for authenticating API requests. Supports both Privy
 * user authentication (via tokens/cookies) and agent session tokens. Provides
 * helper functions for authentication, optional authentication, and error responses.
 */

import { db, eq, users } from '@babylon/db';
import {
  type AuthenticatedUser,
  isNftGatingAllowlistedPath,
} from '@babylon/shared';
import { PrivyClient } from '@privy-io/server-auth';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { verifyAgentSession } from './agent-auth';
import {
  AuthenticationError,
  AuthorizationError,
  isAuthenticationError,
} from './errors';
import { hasNftAccessForAuthUser } from './services/nft-access-service';
import { preferCookieAuth } from './utils/environment';

// Re-export types from shared for backwards compatibility
export type { AuthenticatedUser } from '@babylon/shared';
export { extractErrorMessage } from '@babylon/shared';

// Re-export from errors for backwards compatibility
export { AuthenticationError, isAuthenticationError };

// Lazy initialization of Privy client to prevent build-time errors
let privyClient: PrivyClient | null = null;

export function getPrivyClient(): PrivyClient {
  if (!privyClient) {
    const privyAppId =
      process.env.PRIVY_APP_ID ?? process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    const privyAppSecret = process.env.PRIVY_APP_SECRET;

    if (!privyAppId || !privyAppSecret) {
      throw new Error('Privy credentials not configured');
    }

    privyClient = new PrivyClient(privyAppId, privyAppSecret);
  }
  return privyClient;
}

/**
 * Authenticate request and return user info
 *
 * @description Authenticates an API request by checking for authentication tokens.
 * Token preference is environment-aware:
 * - **Production**: privy-token cookie (HttpOnly, auto-refreshed by Privy SDK)
 * - **Staging / local**: Authorization Bearer header (easier for testing / external clients)
 *
 * The non-preferred source is used as a fallback.
 *
 * @param {NextRequest} request - Next.js request object
 * @returns {Promise<AuthenticatedUser>} Authenticated user information
 * @throws {AuthenticationError} If authentication fails
 *
 * @see https://docs.privy.io/guide/react/configuration/cookies
 */
export async function authenticate(
  request: NextRequest
): Promise<AuthenticatedUser> {
  const pathname = new URL(request.url).pathname;

  const nftGatingFlag = process.env.NFT_GATING_ENABLED ?? '';
  const nftGatingEnabled = ['true', '1', 'yes', 'on'].includes(
    nftGatingFlag.toLowerCase()
  );

  const authHeader = request.headers.get('authorization');
  let token: string | undefined;

  const cookieToken = request.cookies.get('privy-token')?.value;
  const headerToken = authHeader?.startsWith('Bearer ')
    ? authHeader.substring(7)
    : undefined;

  // Environment-aware preference: cookies in production, headers in staging/local.
  if (preferCookieAuth()) {
    token = cookieToken ?? headerToken;
  } else {
    token = headerToken ?? cookieToken;
  }

  if (!token) {
    throw new AuthenticationError(
      'Missing or invalid authorization header or cookie'
    );
  }

  // Local dev convenience: allow using a test user's Privy DID directly as the
  // Bearer token (used by API integration tests). Disabled by default in prod.
  const allowTestPrivyDidAuth =
    process.env.ALLOW_TEST_PRIVY_DID_AUTH !== undefined
      ? ['true', '1', 'yes', 'on'].includes(
          process.env.ALLOW_TEST_PRIVY_DID_AUTH.toLowerCase()
        )
      : process.env.NODE_ENV === 'development' ||
        process.env.NODE_ENV === 'test';

  if (allowTestPrivyDidAuth && token.startsWith('did:privy:test')) {
    // Fast-path: our test Privy DIDs are of the form `did:privy:test-${userId}`,
    // where `userId` is the DB user id (snowflake). Avoid a DB read when possible.
    if (token.startsWith('did:privy:test-')) {
      const embeddedUserId = token.slice('did:privy:test-'.length);
      const isSnowflakeId = /^\d{15,20}$/.test(embeddedUserId);
      if (isSnowflakeId) {
        return {
          userId: embeddedUserId,
          dbUserId: embeddedUserId,
          privyId: token,
          walletAddress: undefined,
          email: undefined,
          isAgent: false,
        };
      }
    }

    const dbUserResult = await db
      .select({ id: users.id, walletAddress: users.walletAddress })
      .from(users)
      .where(eq(users.privyId, token))
      .limit(1);
    const dbUser = dbUserResult[0];

    if (!dbUser) {
      throw new AuthenticationError('Test user not found');
    }

    return {
      userId: dbUser.id,
      dbUserId: dbUser.id,
      privyId: token,
      walletAddress: dbUser.walletAddress ?? undefined,
      email: undefined,
      isAgent: false,
    };
  }

  // Try agent session authentication first (faster)
  const agentSession = await verifyAgentSession(token);
  if (agentSession) {
    return {
      userId: agentSession.agentId,
      privyId: agentSession.agentId,
      isAgent: true,
    };
  }

  // Try Privy authentication
  const privy = getPrivyClient();

  // Build a list of tokens to try. The primary token is tried first; if both
  // sources exist and differ the non-preferred source is kept as a fallback so
  // we can recover from stale cookies / rotated sessions.
  const fallbackToken = preferCookieAuth() ? headerToken : cookieToken;
  const tokensToTry =
    fallbackToken && fallbackToken !== token ? [token, fallbackToken] : [token];

  let lastError: Error | undefined;

  for (const tokenToVerify of tokensToTry) {
    try {
      const claims = await privy.verifyAuthToken(tokenToVerify);

      const dbUserResult = await db
        .select({
          id: users.id,
          walletAddress: users.walletAddress,
          isAdmin: users.isAdmin,
        })
        .from(users)
        .where(eq(users.privyId, claims.userId))
        .limit(1);
      const dbUser = dbUserResult[0];

      const authedUser: AuthenticatedUser = {
        userId: dbUser?.id ?? claims.userId,
        dbUserId: dbUser?.id,
        privyId: claims.userId,
        walletAddress: dbUser?.walletAddress ?? undefined,
        email: undefined,
        isAdmin: dbUser?.isAdmin ?? false,
        isAgent: false,
      };

      if (
        nftGatingEnabled &&
        !authedUser.isAgent &&
        !authedUser.isAdmin &&
        !isNftGatingAllowlistedPath(pathname)
      ) {
        if (!authedUser.dbUserId) {
          throw new AuthorizationError('NFT access required', 'nft', 'access', {
            pathname,
          });
        }

        const allowed = await hasNftAccessForAuthUser(authedUser);
        if (!allowed) {
          throw new AuthorizationError('NFT access required', 'nft', 'access', {
            pathname,
          });
        }
      }

      return authedUser;
    } catch (error) {
      if (error instanceof AuthorizationError) {
        throw error;
      }

      const errorMessage =
        error instanceof Error ? error.message.toLowerCase() : '';
      const isExpiredTokenError =
        errorMessage.includes('token expired') ||
        errorMessage.includes('exp mismatch');

      if (isExpiredTokenError) {
        // If this isn't the last token to try, continue to the next one
        if (tokensToTry.indexOf(tokenToVerify) < tokensToTry.length - 1) {
          continue;
        }
        throw new AuthenticationError(
          'Authentication token has expired. Please refresh your session.'
        );
      }

      lastError = error as Error;
      // If this isn't the last token to try, continue to the next one
      if (tokensToTry.indexOf(tokenToVerify) < tokensToTry.length - 1) {
        continue;
      }
    }
  }

  // If we get here, all tokens failed verification
  throw lastError ?? new AuthenticationError('Token verification failed');
}

/**
 * Authenticate and require that the user has a database record
 */
export async function authenticateWithDbUser(
  request: NextRequest
): Promise<AuthenticatedUser & { dbUserId: string }> {
  const authUser = await authenticate(request);

  if (!authUser.dbUserId) {
    throw new AuthenticationError(
      'User profile not found. Please complete onboarding first.'
    );
  }

  return authUser as AuthenticatedUser & { dbUserId: string };
}

/**
 * Optional authentication - returns user if authenticated, null otherwise
 */
export async function optionalAuth(
  request: NextRequest
): Promise<AuthenticatedUser | null> {
  const authHeader = request.headers.get('authorization');
  let token: string | undefined;

  const cookieToken = request.cookies.get('privy-token')?.value;
  const headerToken = authHeader?.startsWith('Bearer ')
    ? authHeader.substring(7)
    : undefined;

  // Environment-aware preference: cookies in production, headers in staging/local.
  if (preferCookieAuth()) {
    token = cookieToken ?? headerToken;
  } else {
    token = headerToken ?? cookieToken;
  }

  if (!token) {
    return null;
  }

  const agentSession = await verifyAgentSession(token);
  if (agentSession) {
    return {
      userId: agentSession.agentId,
      privyId: agentSession.agentId,
      isAgent: true,
    };
  }

  // Try Privy authentication - return null on failure (optional auth)
  const privy = getPrivyClient();

  // Build fallback list: if both sources exist and differ, try the non-preferred
  // source as a fallback (e.g. stale cookies from a different environment).
  const fallbackToken = preferCookieAuth() ? headerToken : cookieToken;
  const tokensToTry =
    fallbackToken && fallbackToken !== token ? [token, fallbackToken] : [token];

  for (const tokenToVerify of tokensToTry) {
    try {
      const claims = await privy.verifyAuthToken(tokenToVerify);

      const dbUserResult = await db
        .select({
          id: users.id,
          walletAddress: users.walletAddress,
          isAdmin: users.isAdmin,
        })
        .from(users)
        .where(eq(users.privyId, claims.userId))
        .limit(1);
      const dbUser = dbUserResult[0];

      return {
        userId: dbUser?.id ?? claims.userId,
        dbUserId: dbUser?.id,
        privyId: claims.userId,
        walletAddress: dbUser?.walletAddress ?? undefined,
        email: undefined,
        isAdmin: dbUser?.isAdmin ?? false,
        isAgent: false,
      };
    } catch {
      // If this isn't the last token to try, continue to the next one
      if (tokensToTry.indexOf(tokenToVerify) < tokensToTry.length - 1) {
        continue;
      }
      // For optional auth, return null on final failure
      return null;
    }
  }

  return null;
}

/**
 * Optional authentication from headers - for use when NextRequest is not available
 */
export async function optionalAuthFromHeaders(
  headers: Headers
): Promise<AuthenticatedUser | null> {
  const authHeader = headers.get('authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);

  const agentSession = await verifyAgentSession(token);
  if (agentSession) {
    return {
      userId: agentSession.agentId,
      isAgent: true,
    };
  }

  // Try Privy authentication - return null on failure (optional auth)
  try {
    const privy = getPrivyClient();
    const claims = await privy.verifyAuthToken(token);

    return {
      userId: claims.userId,
      walletAddress: undefined,
      email: undefined,
      isAgent: false,
    };
  } catch {
    // For optional auth, return null on failure
    return null;
  }
}

/**
 * Standard auth error response helper
 */
export function authErrorResponse(message = 'Unauthorized') {
  return NextResponse.json({ error: message }, { status: 401 });
}

/**
 * Authenticate user from request (convenience wrapper)
 *
 * @description Authenticates a user from a Next.js request and returns user
 * information with an additional 'id' alias for userId.
 *
 * @param {NextRequest} req - Next.js request object
 * @returns {Promise<AuthenticatedUser & { id: string }>} Authenticated user information
 * @throws {AuthenticationError} If authentication fails
 */
export async function authenticateUser(req: NextRequest) {
  const authUser = await authenticate(req);
  return {
    id: authUser.userId,
    ...authUser,
  };
}
