/**
 * Admin Authentication Middleware
 *
 * @description Middleware for verifying admin privileges. Authenticates the user
 * and checks if they have admin access. Allows localhost bypass for development.
 * Throws AuthorizationError if user is not authenticated or not an admin.
 */

import type { NextRequest } from 'next/server';
import { db, eq, users } from '@babylon/db';
import type { AuthenticatedUser } from './auth-middleware';
import { authenticate } from './auth-middleware';
import { AuthorizationError } from './errors';
import { logger } from '@babylon/shared';

/**
 * Authenticate request and verify admin privileges
 */
export async function requireAdmin(
  request: NextRequest
): Promise<AuthenticatedUser> {
  // First authenticate the user
  const user = await authenticate(request);

  // In localhost, allow any authenticated user to access admin
  const isLocalhost =
    request.headers.get('host')?.includes('localhost') ||
    request.headers.get('host')?.includes('127.0.0.1');

  if (isLocalhost) {
    logger.info(
      'Admin access granted (localhost bypass)',
      {
        userId: user.userId,
      },
      'requireAdmin'
    );
    return user;
  }

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
