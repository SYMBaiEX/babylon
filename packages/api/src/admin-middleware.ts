/**
 * Admin Authentication Middleware
 *
 * @description Middleware for verifying admin privileges. Authenticates the user
 * and checks if they have admin access. On localhost, ALL users get admin access
 * without requiring authentication (for development/debugging).
 * Throws AuthorizationError if user is not authenticated or not an admin (in production).
 */

import { db, eq, users } from '@babylon/db';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import type { AuthenticatedUser } from './auth-middleware';
import { authenticate } from './auth-middleware';
import { AuthorizationError } from './errors';

/**
 * Check if request is from localhost
 */
function isLocalhostRequest(request: NextRequest): boolean {
  const host = request.headers.get('host') || '';
  return host.includes('localhost') || host.includes('127.0.0.1');
}

/**
 * Authenticate request and verify admin privileges.
 * On localhost, skips authentication entirely and grants admin access.
 */
export async function requireAdmin(
  request: NextRequest
): Promise<AuthenticatedUser> {
  // On localhost, skip authentication entirely for easier debugging
  if (isLocalhostRequest(request)) {
    logger.info(
      'Admin access granted (localhost bypass - no auth required)',
      { host: request.headers.get('host') },
      'requireAdmin'
    );
    // Return a mock admin user for localhost
    return {
      userId: 'localhost-admin',
      dbUserId: 'localhost-admin',
    };
  }

  // For non-localhost, require proper authentication
  const user = await authenticate(request);

  // Check if user is an admin in the database
  const [dbUser] = await db
    .select({
      isAdmin: users.isAdmin,
      isBanned: users.isBanned,
      username: users.username,
      displayName: users.displayName,
    })
    .from(users)
    .where(eq(users.id, user.userId))
    .limit(1);

  if (!dbUser) {
    logger.warn(
      'Admin check failed: User not found in database',
      { userId: user.userId },
      'requireAdmin'
    );
    throw new AuthorizationError('User not found', 'admin', 'access');
  }

  if (dbUser.isBanned) {
    logger.warn(
      'Admin check failed: User is banned',
      { userId: user.userId },
      'requireAdmin'
    );
    throw new AuthorizationError('User is banned', 'admin', 'access');
  }

  if (!dbUser.isAdmin) {
    logger.warn(
      'Admin check failed: User is not an admin',
      {
        userId: user.userId,
        username: dbUser.username,
      },
      'requireAdmin'
    );
    throw new AuthorizationError('Admin access required', 'admin', 'access');
  }

  logger.info(
    'Admin access granted',
    {
      userId: user.userId,
      username: dbUser.username,
    },
    'requireAdmin'
  );

  return user;
}

/**
 * Check if a user ID has admin privileges (without requiring request auth)
 */
export async function isUserAdmin(userId: string): Promise<boolean> {
  const [user] = await db
    .select({
      isAdmin: users.isAdmin,
      isBanned: users.isBanned,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return user ? user.isAdmin && !user.isBanned : false;
}
