/**
 * API Authentication Middleware
 *
 * Supports both Privy user authentication and agent session tokens
 */

import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { PrivyClient } from '@privy-io/server-auth';
import { verifyAgentSession } from '@/app/api/agents/auth/route';
import { logger } from '@/lib/logger';

// Define error types locally since they were not in a shared file
export type AuthenticationError = Error & {
  code: 'AUTH_FAILED';
};

export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null && 'message' in error && typeof (error as any).message === 'string') {
    return (error as any).message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unknown error occurred';
}

// Initialize Privy client
const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID!;
const privyAppSecret = process.env.PRIVY_APP_SECRET!;

const privy = new PrivyClient(privyAppId, privyAppSecret);

export interface AuthenticatedUser {
  userId: string;
  walletAddress?: string;
  email?: string;
  isAgent?: boolean;
}

/**
 * Authenticate request and return user info
 * Supports both Privy user tokens and agent session tokens
 */
export async function authenticate(request: NextRequest): Promise<AuthenticatedUser> {
  const authHeader = request.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Authentication failed');
  }

  const token = authHeader.substring(7);

  // Try agent session authentication first (faster)
  const agentSession = verifyAgentSession(token);
  if (agentSession) {
    return {
      userId: agentSession.agentId,
      isAgent: true,
    };
  }

  // Fall back to Privy user authentication
  try {
    const claims = await privy.verifyAuthToken(token);

    return {
      userId: claims.userId,
      walletAddress: undefined, // Would need to fetch from Privy user
      email: undefined,
      isAgent: false,
    };
  } catch (error) {
    const errorMessage = extractErrorMessage(error);
    logger.error('Auth verification error:', errorMessage, 'AuthMiddleware');
    const authError: AuthenticationError = Object.assign(new Error('Authentication failed'), {
      code: 'AUTH_FAILED' as const,
      message: errorMessage,
    });
    throw authError;
  }
}

/**
 * Optional authentication - returns user if authenticated, null otherwise
 */
export async function optionalAuth(request: NextRequest): Promise<AuthenticatedUser | null> {
  try {
    return await authenticate(request);
  } catch {
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

export function successResponse<T = unknown>(data: T, status: number = 200) {
  return NextResponse.json(data, { status });
}
