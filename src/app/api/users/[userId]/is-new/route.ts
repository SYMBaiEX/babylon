/**
 * API Route: /api/users/[userId]/is-new
 * Methods: GET (check if user needs setup)
 */

import {
  authenticate,
  successResponse
} from '@/lib/api/auth-middleware';
import { prisma } from '@/lib/database-service';
import { AuthorizationError, BusinessLogicError } from '@/lib/errors';
import { withErrorHandling } from '@/lib/errors/error-handler';
import { logger } from '@/lib/logger';
import { UserIdParamSchema } from '@/lib/validation/schemas';
import type { NextRequest } from 'next/server';

/**
 * GET /api/users/[userId]/is-new
 * Check if user needs profile setup
 */
export const GET = withErrorHandling(async (
  request: NextRequest,
  context?: { params: Promise<{ userId: string }> }
) => {
  // Optional authentication - if not authenticated, return needsSetup: false
  const authUser = await authenticate(request).catch(() => null);
  const params = await (context?.params || Promise.reject(new BusinessLogicError('Missing route context', 'MISSING_CONTEXT')));
  const { userId } = UserIdParamSchema.parse(params);

  if (!authUser) {
    logger.info('Unauthenticated user checking is-new status', {}, 'GET /api/users/[userId]/is-new');
    return successResponse({ needsSetup: false });
  }

  // Ensure requesting user matches the userId in the URL
  if (authUser.userId !== userId) {
    throw new AuthorizationError('You can only check your own setup status', 'user-setup', 'read');
  }

  // Check if user exists and needs setup
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      displayName: true,
      bio: true,
      profileImageUrl: true,
      profileComplete: true,
      hasUsername: true,
      hasBio: true,
      hasProfileImage: true,
    },
  });

  if (!dbUser) {
    // User doesn't exist yet - needs setup
    logger.info('User not found, needs setup', { userId }, 'GET /api/users/[userId]/is-new');
    return successResponse({ needsSetup: true });
  }

  // Check if profile is complete
  // User needs setup if they don't have username, displayName, or bio
  const needsSetup = !dbUser.profileComplete && (
    !dbUser.username ||
    !dbUser.displayName ||
    !dbUser.hasUsername ||
    !dbUser.hasBio
  );

  logger.info('User setup status checked', { userId, needsSetup }, 'GET /api/users/[userId]/is-new');

  return successResponse({
    needsSetup,
    profileComplete: dbUser.profileComplete || false,
    hasUsername: dbUser.hasUsername || false,
    hasBio: dbUser.hasBio || false,
    hasProfileImage: dbUser.hasProfileImage || false,
  });
});

