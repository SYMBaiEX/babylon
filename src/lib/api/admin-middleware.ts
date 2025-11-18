/**
 * Admin Authentication Middleware
 * 
 * @description Middleware for verifying admin privileges. Authenticates the user
 * and checks if they have admin access. Allows localhost bypass for development.
 * Throws AuthorizationError if user is not authenticated or not an admin.
 */

import type { NextRequest } from 'next/server';
import type { AuthenticatedUser } from '@/lib/api/auth-middleware';
import { authenticate } from '@/lib/api/auth-middleware';
import { AuthorizationError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

/**
 * Authenticate request and verify admin privileges
 * 
 * @description Authenticates the request and verifies the user has admin privileges.
 * Allows localhost bypass for development. Checks database for admin status and
 * bans. Throws AuthorizationError if user is not authenticated, not found, banned,
 * or not an admin.
 * 
 * @param {NextRequest} request - Next.js request object
 * @returns {Promise<AuthenticatedUser>} Authenticated admin user
 * @throws {AuthorizationError} If user is not authenticated or not an admin
 * 
 * @example
 * ```typescript
 * try {
 *   const admin = await requireAdmin(request);
 *   // Admin-only operations
 * } catch (error) {
 *   if (error instanceof AuthorizationError) {
 *     return NextResponse.json({ error: error.message }, { status: 403 });
 *   }
 * }
 * ```
 */
export async function requireAdmin(request: NextRequest): Promise<AuthenticatedUser> {
  // First authenticate the user
  const user = await authenticate(request);
  
  // In localhost, allow any authenticated user to access admin
  const isLocalhost = request.headers.get('host')?.includes('localhost') || 
                      request.headers.get('host')?.includes('127.0.0.1');
  
  if (isLocalhost) {
    logger.info(`Admin access granted (localhost bypass)`, { 
      userId: user.userId 
    }, 'requireAdmin');
    return user;
  }
  
  // Check if user is an admin in the database
  const dbUser = await prisma.user.findUnique({
    where: { id: user.userId },
    select: {
      isAdmin: true,
      isBanned: true,
      username: true,
      displayName: true,
    },
  });

  if (!dbUser) {
    logger.warn(`Admin check failed: User not found in database`, { userId: user.userId }, 'requireAdmin');
    throw new AuthorizationError('User not found', 'admin', 'access');
  }

  if (dbUser.isBanned) {
    logger.warn(`Admin check failed: User is banned`, { userId: user.userId }, 'requireAdmin');
    throw new AuthorizationError('User is banned', 'admin', 'access');
  }

  if (!dbUser.isAdmin) {
    logger.warn(`Admin check failed: User is not an admin`, { 
      userId: user.userId,
      username: dbUser.username 
    }, 'requireAdmin');
    throw new AuthorizationError('Admin access required', 'admin', 'access');
  }

  logger.info(`Admin access granted`, { 
    userId: user.userId,
    username: dbUser.username 
  }, 'requireAdmin');

  return user;
}

/**
 * Check if a user ID has admin privileges (without requiring request auth)
 * 
 * @description Checks if a user has admin privileges by querying the database.
 * Does not require request authentication, useful for background checks.
 * Returns false if user is banned or doesn't exist.
 * 
 * @param {string} userId - User ID to check
 * @returns {Promise<boolean>} True if user is an admin and not banned
 * 
 * @example
 * ```typescript
 * const isAdmin = await isUserAdmin(userId);
 * if (isAdmin) {
 *   // Grant admin access
 * }
 * ```
 */
export async function isUserAdmin(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true, isBanned: true },
  });

  return user ? user.isAdmin && !user.isBanned : false;
}

