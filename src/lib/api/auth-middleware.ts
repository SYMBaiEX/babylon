/**
 * API Authentication Middleware
 * 
 * @description Middleware for authenticating API requests. Supports both Privy
 * user authentication (via tokens/cookies) and agent session tokens. Provides
 * helper functions for authentication, optional authentication, and error responses.
 */

import { verifyAgentSession } from '@/lib/auth/agent-auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { PrivyClient } from '@privy-io/server-auth';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import type { ErrorLike, JsonValue } from '@/types/common';

// Define error types locally since they were not in a shared file
export type AuthenticationError = Error & {
  code: 'AUTH_FAILED';
};

export function isAuthenticationError(error: unknown): error is AuthenticationError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'AUTH_FAILED'
  );
}

export function extractErrorMessage(error: Error | ErrorLike | string | unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const errorLike = error as ErrorLike
    if (typeof errorLike.message === 'string') {
      return errorLike.message;
    }
  }
  return 'An unknown error occurred';
}

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
 * Authenticated user information
 * 
 * @description Contains information about an authenticated user, including
 * user IDs, wallet address, and whether the user is an agent.
 */
export interface AuthenticatedUser {
  userId: string;
  dbUserId?: string;
  privyId?: string;
  walletAddress?: string;
  email?: string;
  isAgent?: boolean;
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
 *
 * @example
 * ```typescript
 * try {
 *   const user = await authenticate(request);
 *   // Use user.userId, user.dbUserId, etc.
 * } catch (error) {
 *   if (isAuthenticationError(error)) {
 *     return authErrorResponse(error.message);
 *   }
 * }
 * ```
 */
export async function authenticate(request: NextRequest): Promise<AuthenticatedUser> {
  const authHeader = request.headers.get('authorization');
  let token: string | undefined;

  // With HTTP-only cookies enabled, prefer the cookie over the Authorization header.
  // The cookie is automatically managed and refreshed by Privy, while the header
  // may contain stale tokens from localStorage. Fall back to header for agents
  // or external clients that don't use cookies.
  const cookieToken = request.cookies.get('privy-token')?.value;

  if (cookieToken) {
    token = cookieToken;
  } else if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }

  if (!token) {
    const error = new Error('Missing or invalid authorization header or cookie') as AuthenticationError;
    error.code = 'AUTH_FAILED';
    throw error;
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

    const dbUser = await prisma.user.findUnique({
      where: { privyId: claims.userId },
      select: { id: true, walletAddress: true },
    });

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
    // "signature verification failed" often means expired token or key mismatch
    logger.warn('Privy authentication failed', {
      error: extractErrorMessage(error)
    }, 'auth-middleware');

    // Privy token verification failed - convert to AuthenticationError
    const authError = new Error('Invalid or expired authentication token') as AuthenticationError;
    authError.code = 'AUTH_FAILED';
    throw authError;
  }
}

/**
 * Authenticate and require that the user has a database record
 * 
 * @description Authenticates the request and ensures the user has completed
 * onboarding (has a database record). Throws AuthenticationError if user
 * hasn't completed onboarding.
 * 
 * @param {NextRequest} request - Next.js request object
 * @returns {Promise<AuthenticatedUser & { dbUserId: string }>} Authenticated user with guaranteed dbUserId
 * @throws {AuthenticationError} If authentication fails or user hasn't completed onboarding
 */
export async function authenticateWithDbUser(request: NextRequest): Promise<AuthenticatedUser & { dbUserId: string }> {
  const authUser = await authenticate(request);
  
  if (!authUser.dbUserId) {
    const error = new Error('User profile not found. Please complete onboarding first.') as AuthenticationError;
    error.code = 'AUTH_FAILED';
    throw error;
  }
  
  return authUser as AuthenticatedUser & { dbUserId: string };
}

/**
 * Optional authentication - returns user if authenticated, null otherwise
 *
 * @description Attempts to authenticate the request but returns null instead
 * of throwing if authentication fails. Useful for endpoints that work for
 * both authenticated and unauthenticated users.
 *
 * With HTTP-only cookies enabled, prefers the privy-token cookie over the
 * Authorization header for the same reasons as the authenticate function.
 *
 * @param {NextRequest} request - Next.js request object
 * @returns {Promise<AuthenticatedUser | null>} Authenticated user or null
 *
 * @see https://docs.privy.io/guide/react/configuration/cookies
 */
export async function optionalAuth(request: NextRequest): Promise<AuthenticatedUser | null> {
  const authHeader = request.headers.get('authorization');
  let token: string | undefined;

  // Prefer cookie over header - see authenticate() for detailed rationale
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

    const dbUser = await prisma.user.findUnique({
      where: { privyId: claims.userId },
      select: { id: true, walletAddress: true },
    });

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
 * Returns user if authenticated, null otherwise
 */
export async function optionalAuthFromHeaders(headers: Headers): Promise<AuthenticatedUser | null> {
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
 * Standard error responses
 */
export function authErrorResponse(message: string = 'Unauthorized') {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function errorResponse(message: string, status: number = 500) {
  return NextResponse.json({ error: message }, { status });
}

export function successResponse<T = JsonValue>(data: T, status: number = 200) {
  return NextResponse.json(data, { status });
}
