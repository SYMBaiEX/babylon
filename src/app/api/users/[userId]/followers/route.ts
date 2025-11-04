/**
 * API Route: /api/users/[userId]/followers
 * Methods: GET (get followers list)
 */

import {
  optionalAuth,
  successResponse
} from '@/lib/api/auth-middleware';
import { prisma } from '@/lib/database-service';
import { BusinessLogicError, NotFoundError } from '@/lib/errors';
import { withErrorHandling } from '@/lib/errors/error-handler';
import { logger } from '@/lib/logger';
import { UserFollowersQuerySchema, UserIdParamSchema } from '@/lib/validation/schemas';
import type { NextRequest } from 'next/server';

/**
 * GET /api/users/[userId]/followers
 * Get list of users following the target user
 */
export const GET = withErrorHandling(async (
  request: NextRequest,
  context?: { params: Promise<{ userId: string }> }
) => {
  // Optional authentication - if authenticated, can provide personalized data
  const authUser = await optionalAuth(request);
  const params = await (context?.params || Promise.reject(new BusinessLogicError('Missing route context', 'MISSING_CONTEXT')));
  const { userId: targetId } = UserIdParamSchema.parse(params);
  
  // Validate query parameters
  const { searchParams } = new URL(request.url);
  const queryParams = {
    page: searchParams.get('page'),
    limit: searchParams.get('limit'),
    includeMutual: searchParams.get('includeMutual')
  };
  UserFollowersQuerySchema.parse(queryParams);

  // Check if target is a user
  const targetUser = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true },
  });

  if (!targetUser) {
    throw new NotFoundError('User', targetId);
  }

  // Get followers (users who follow this user)
  const follows = await prisma.follow.findMany({
    where: {
      followingId: targetId,
    },
    include: {
      follower: {
        select: {
          id: true,
          displayName: true,
          username: true,
          profileImageUrl: true,
          bio: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  const followers = follows.map((f) => {
    const followerData = {
      id: f.follower.id,
      displayName: f.follower.displayName,
      username: f.follower.username,
      profileImageUrl: f.follower.profileImageUrl,
      bio: f.follower.bio,
      followedAt: f.createdAt.toISOString(),
    };

    // If authenticated, check if current user follows this follower
    if (authUser) {
      // This could be extended to show mutual follows, etc.
      return followerData;
    }

    return followerData;
  });

  logger.info('Followers fetched successfully', { targetId, count: followers.length }, 'GET /api/users/[userId]/followers');

  return successResponse({
    followers,
    count: followers.length,
  });
});

