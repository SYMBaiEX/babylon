/**
 * API Authentication Middleware
 * Verifies Privy JWT tokens and extracts user information
 */

import { PrivyClient } from '@privy-io/server-auth';
import { NextRequest } from 'next/server';

// Initialize Privy client
const privyClient = new PrivyClient(
  process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
  process.env.PRIVY_APP_SECRET!
);

/**
 * Interface for authenticated user data
 */
export interface AuthenticatedUser {
  userId: string;
  privyUserId: string;
  walletAddress?: string;
}

/**
 * Extracts and verifies the authentication token from the request
 * @param request Next.js API request
 * @returns Authenticated user data
 * @throws Error if authentication fails
 */
export async function authenticate(request: NextRequest): Promise<AuthenticatedUser> {
  try {
    // Extract authorization header
    const authHeader = request.headers.get('authorization');

    if (!authHeader) {
      throw new Error('No authorization header provided');
    }

    // Extract token from "Bearer <token>" format
    const token = authHeader.replace('Bearer ', '');

    if (!token) {
      throw new Error('No token provided');
    }

    // Verify token with Privy
    const verifiedClaims = await privyClient.verifyAuthToken(token);

    if (!verifiedClaims || !verifiedClaims.userId) {
      throw new Error('Invalid token claims');
    }

    // Extract user information from verified claims
    const authenticatedUser: AuthenticatedUser = {
      userId: verifiedClaims.userId,
      privyUserId: verifiedClaims.userId,
      // Wallet address is included in linked accounts if available
      walletAddress: extractWalletAddress(verifiedClaims as unknown as Record<string, unknown>),
    };

    return authenticatedUser;
  } catch (error) {
    console.error('Authentication error:', error);
    throw new Error('Authentication failed');
  }
}

/**
 * Extracts wallet address from Privy claims
 * @param claims Privy verified claims
 * @returns Wallet address if available
 */
function extractWalletAddress(claims: Record<string, unknown>): string | undefined {
  // Privy includes wallet address in the claims
  // The structure varies, so we check multiple possible locations
  if (typeof claims.wallet === 'string') {
    return claims.wallet;
  }

  if (typeof claims.walletAddress === 'string') {
    return claims.walletAddress;
  }

  return undefined;
}

/**
 * Middleware wrapper for API routes that require authentication
 * @param handler The API route handler function
 * @returns Wrapped handler with authentication
 */
export function withAuth<T>(
  handler: (request: NextRequest, user: AuthenticatedUser) => Promise<T>
) {
  return async (request: NextRequest): Promise<T> => {
    const user = await authenticate(request);
    return handler(request, user);
  };
}

/**
 * Optional authentication - doesn't throw if no auth provided
 * Useful for endpoints that work differently for authenticated vs anonymous users
 * @param request Next.js API request
 * @returns Authenticated user data or null
 */
export async function optionalAuth(request: NextRequest): Promise<AuthenticatedUser | null> {
  // Fast-path: if there's no Authorization header, treat as anonymous
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return null;
  }

  try {
    return await authenticate(request);
  } catch {
    return null;
  }
}

/**
 * Creates a standardized error response for authentication failures
 * @param message Error message
 * @param status HTTP status code
 * @returns JSON response with error
 */
export function authErrorResponse(message: string, status: number = 401) {
  return Response.json(
    {
      success: false,
      error: message,
    },
    { status }
  );
}

/**
 * Creates a standardized success response
 * @param data Response data
 * @param status HTTP status code
 * @returns JSON response with data
 */
export function successResponse<T>(data: T, status: number = 200) {
  return Response.json(
    {
      success: true,
      data,
    },
    { status }
  );
}

/**
 * Creates a standardized error response
 * @param error Error message or object
 * @param status HTTP status code
 * @returns JSON response with error
 */
export function errorResponse(error: string | unknown, status: number = 500) {
  const message = typeof error === 'string' ? error : 'An unexpected error occurred';

  return Response.json(
    {
      success: false,
      error: message,
    },
    { status }
  );
}
