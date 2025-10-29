/**
 * API Authentication Middleware
 * 
 * Uses Privy server-side auth to verify users
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrivyClient } from '@privy-io/server-auth';

// Initialize Privy client
const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID!;
const privyAppSecret = process.env.PRIVY_APP_SECRET!;

const privy = new PrivyClient(privyAppId, privyAppSecret);

export interface AuthenticatedUser {
  userId: string;
  walletAddress?: string;
  email?: string;
}

/**
 * Authenticate request and return user info
 */
export async function authenticate(request: NextRequest): Promise<AuthenticatedUser> {
  const authHeader = request.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Authentication failed');
  }

  const token = authHeader.substring(7);

  try {
    const claims = await privy.verifyAuthToken(token);

    return {
      userId: claims.userId,
      walletAddress: undefined, // Would need to fetch from Privy user
      email: undefined,
    };
  } catch (error) {
    console.error('Auth verification error:', error);
    throw new Error('Authentication failed');
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

export function successResponse(data: any, status: number = 200) {
  return NextResponse.json(data, { status });
}
