/**
 * API Authentication Middleware
 *
 * Supports both Privy user authentication and agent session tokens
 */

import { verifyAgentSession } from '@/lib/auth/agent-auth';
import { PrivyClient } from '@privy-io/server-auth';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import type { ErrorLike, JsonValue } from '@/types/common';

// Define error types locally since they were not in a shared file
export type AuthenticationError = Error & {
  code: 'AUTH_FAILED';
};

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

function getPrivyClient(): PrivyClient {
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
    const error = new Error('Missing or invalid authorization header') as AuthenticationError;
    error.code = 'AUTH_FAILED';
    throw error;
  }

  const token = authHeader.substring(7);

  // Try agent session authentication first (faster)
  const agentSession = await verifyAgentSession(token);
  if (agentSession) {
    return {
      userId: agentSession.agentId,
      isAgent: true,
    };
  }

  // Fall back to Privy user authentication
  try {
    const privy = getPrivyClient();
    const claims = await privy.verifyAuthToken(token);

    return {
      userId: claims.userId,
      walletAddress: undefined, // Would need to fetch from Privy user
      email: undefined,
      isAgent: false,
    };
  } catch (error) {
    // Handle specific authentication errors
    const errorMessage = extractErrorMessage(error);
    
    // Check if it's a token expiration error
    if (errorMessage.includes('exp') || errorMessage.includes('expired') || errorMessage.includes('timestamp')) {
      const authError = new Error('Authentication token has expired. Please refresh your session.') as AuthenticationError;
      authError.code = 'AUTH_FAILED';
      throw authError;
    }
    
    // Generic authentication failure
    const authError = new Error('Authentication failed: ' + errorMessage) as AuthenticationError;
    authError.code = 'AUTH_FAILED';
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
 * Optional authentication from headers - for use when NextRequest is not available
 * Returns user if authenticated, null otherwise
 */
export async function optionalAuthFromHeaders(headers: Headers): Promise<AuthenticatedUser | null> {
  try {
    const authHeader = headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
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
    const privy = getPrivyClient();
    const claims = await privy.verifyAuthToken(token);

    return {
      userId: claims.userId,
      walletAddress: undefined,
      email: undefined,
      isAgent: false,
    };
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

export function successResponse<T = JsonValue>(data: T, status: number = 200) {
  return NextResponse.json(data, { status });
}
