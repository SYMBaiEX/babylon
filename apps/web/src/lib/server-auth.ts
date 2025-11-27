/**
 * Server-side Authentication Utilities
 *
 * @description Server-side authentication helper functions. Provides simplified
 * authentication interface for server components and API routes. Wraps the
 * authenticate middleware with a cleaner API.
 */

import type { NextRequest } from 'next/server';
import { authenticate } from '@/lib/api/auth-middleware';

/**
 * Authenticate user from request
 *
 * @description Authenticates a user from a Next.js request and returns user
 * information. Wraps the authenticate middleware with a simplified interface.
 *
 * @param {NextRequest} req - Next.js request object
 * @returns {Promise<AuthenticatedUser>} Authenticated user information
 * @throws {AuthenticationError} If authentication fails
 *
 * @example
 * ```typescript
 * const user = await authenticateUser(request);
 * // Use user.id, user.privyId, etc.
 * ```
 */
export async function authenticateUser(req: NextRequest) {
  const authUser = await authenticate(req);
  return {
    id: authUser.userId,
    privyId: authUser.privyId,
    ...authUser,
  };
}
