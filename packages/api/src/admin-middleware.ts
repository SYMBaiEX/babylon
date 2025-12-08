/**
 * Admin Authentication Middleware
 *
 * @description Middleware for verifying admin privileges. Authenticates the user
 * and checks if they have admin access. In development mode, supports dev admin
 * token authentication for easier testing. In production, requires full Privy
 * authentication and database admin flag verification.
 *
 * @security
 * - NEVER bypasses authentication based on localhost/host header
 * - Dev mode requires explicit dev admin token
 * - Production requires Privy auth + database admin flag
 */

import { db, eq, users } from '@babylon/db';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import type { AuthenticatedUser } from './auth-middleware';
import { authenticate } from './auth-middleware';
import { getDevAdminUser, isValidDevAdminToken } from './dev-credentials';
import { AuthorizationError } from './errors';

const isDevelopment = process.env.NODE_ENV !== 'production';

/**
 * Authenticate request and verify admin privileges.
 *
 * In development mode:
 * - Accepts x-dev-admin-token header with valid dev token
 * - Falls back to standard Privy auth + admin check
 *
 * In production:
 * - Requires valid Privy authentication
 * - Requires isAdmin flag in database
 */
export async function requireAdmin(
  request: NextRequest
): Promise<AuthenticatedUser> {
  // In development, check for dev admin token first
  if (isDevelopment) {
    const devAdminToken = request.headers.get('x-dev-admin-token');
    if (devAdminToken && isValidDevAdminToken(devAdminToken)) {
      const devUser = getDevAdminUser();
      if (devUser) {
        logger.info(
          'Admin access granted via dev token',
          { userId: devUser.userId },
          'requireAdmin'
        );
        return {
          userId: devUser.userId,
          dbUserId: devUser.dbUserId,
          walletAddress: devUser.walletAddress,
        };
      }
    }
  }

  // Standard authentication flow
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
