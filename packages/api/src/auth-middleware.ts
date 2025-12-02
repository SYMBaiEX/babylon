/**
 * API Authentication Middleware
 *
 * @description Middleware for authenticating API requests. Supports both Privy
 * user authentication (via tokens/cookies) and agent session tokens. Provides
 * helper functions for authentication, optional authentication, and error responses.
 */

import { PrivyClient } from '@privy-io/server-auth';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { db, eq, users } from '@babylon/db';
import { verifyAgentSession } from './agent-auth';
import { logger, extractErrorMessage } from '@babylon/shared';
import type { AuthenticatedUser } from '@babylon/shared';
import { AuthenticationError, isAuthenticationError } from './errors';

// Re-export types from shared for backwards compatibility
export type { AuthenticatedUser } from '@babylon/shared';
export { extractErrorMessage } from '@babylon/shared';

// Re-export from errors for backwards compatibility
export { AuthenticationError, isAuthenticationError };

// Lazy initialization of Privy client to prevent build-time errors
let privyClient: PrivyClient | null = null;

export function getPrivyClient(): PrivyClient {
  if (!privyClient) {
    const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
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
 * With HTTP-only cookies enabled, the privy-token cookie is preferred over the
 * Authorization header because the cookie is automatically managed and refreshed
 * by Privy. Falls back to Authorization header for backwards compatibility with
 * agents or external clients that may still use header-based auth.
 *
 * Token Priority:
 * 1. privy-token cookie (preferred - auto-refreshed by Privy)
 * 2. Authorization Bearer header (fallback for agents/external clients)
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
  const authHeader = request.headers.get('authorization');
  let token: string | undefined;

  // With HTTP-only cookies enabled, prefer the cookie over the Authorization header.
  const cookieToken = request.cookies.get('privy-token')?.value;

  if (cookieToken) {
    token = cookieToken;
  } else if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }

  if (!token) {
    throw new AuthenticationError('Missing or invalid authorization header or cookie');
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
  try {
    const privy = getPrivyClient();
    const claims = await privy.verifyAuthToken(token);

    const result = await db
      .select({
        id: users.id,
        walletAddress: users.walletAddress,
      })
      .from(users)
      .where(eq(users.privyId, claims.userId))
      .limit(1);

    const dbUser = result[0];

    return {
      userId: dbUser?.id ?? claims.userId,
      dbUserId: dbUser?.id,
      privyId: claims.userId,
      walletAddress: dbUser?.walletAddress ?? undefined,
      email: undefined,
      isAgent: false,
    };
  } catch (error) {
    // Log the specific error for debugging purposes
    logger.warn(
      'Privy authentication failed',
      {
        error: extractErrorMessage(
          error instanceof Error
            ? error
            : typeof error === 'string'
              ? error
              : { message: String(error) }
        ),
      },
      'auth-middleware'
    );

    // Check for specific error types
    const errorMessage = extractErrorMessage(
      error instanceof Error
        ? error
        : typeof error === 'string'
          ? error
          : { message: String(error) }
    );
    if (errorMessage.includes('expired') || errorMessage.includes('exp')) {
      throw new AuthenticationError('Authentication token has expired. Please refresh your session.');
    }

    // Privy token verification failed
    throw new AuthenticationError('Invalid or expired authentication token');
  }
}

/**
 * Authenticate and require that the user has a database record
 */
export async function authenticateWithDbUser(
  request: NextRequest
): Promise<AuthenticatedUser & { dbUserId: string }> {
  const authUser = await authenticate(request);

  if (!authUser.dbUserId) {
    throw new AuthenticationError('User profile not found. Please complete onboarding first.');
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

  // Prefer cookie over header
  const cookieToken = request.cookies.get('privy-token')?.value;

  if (cookieToken) {
    token = cookieToken;
  } else if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.substring(7);
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
  try {
    const privy = getPrivyClient();
    const claims = await privy.verifyAuthToken(token);

    const result = await db
      .select({
        id: users.id,
        walletAddress: users.walletAddress,
      })
      .from(users)
      .where(eq(users.privyId, claims.userId))
      .limit(1);

    const dbUser = result[0];

    return {
      userId: dbUser?.id ?? claims.userId,
      dbUserId: dbUser?.id,
      privyId: claims.userId,
      walletAddress: dbUser?.walletAddress ?? undefined,
      email: undefined,
      isAgent: false,
    };
  } catch {
    // Token verification failed - return null for optional auth
    return null;
  }
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
    // Token verification failed - return null for optional auth
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
