/**
 * API Route: /api/users/[userId]/following
 * Methods: GET (get following list)
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
 * GET /api/users/[userId]/following
 * Get list of users/actors that the target user is following
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

  // Get users being followed (Follow model)
  const userFollows = await prisma.follow.findMany({
    where: {
      followerId: targetId,
    },
    include: {
      following: {
        select: {
          id: true,
          displayName: true,
          username: true,
          profileImageUrl: true,
          bio: true,
          isActor: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  // Get actors being followed (FollowStatus model)
  const actorFollows = await prisma.followStatus.findMany({
    where: {
      userId: targetId,
      isActive: true,
    },
    orderBy: {
      followedAt: 'desc',
    },
  });

  // Fetch actor details from Actor table
  const actorIds = actorFollows.map((f) => f.npcId);
  const actors = await prisma.actor.findMany({
    where: {
      id: { in: actorIds },
    },
    select: {
      id: true,
      name: true,
      description: true,
      postStyle: true,
    },
  });

  const actorMap = new Map(actors.map((a) => [a.id, a]));

  // Check mutual follows if authenticated user is viewing their own following list
  const mutualFollowChecks = authUser && authUser.userId === targetId
    ? await Promise.all(
        userFollows.map(async (f) => {
          const mutualFollow = await prisma.follow.findUnique({
            where: {
              followerId_followingId: {
                followerId: f.following.id,
                followingId: authUser.userId,
              },
            },
          });
          return { userId: f.following.id, isMutual: !!mutualFollow };
        })
      )
    : [];

  const mutualFollowMap = new Map(
    mutualFollowChecks.map((check) => [check.userId, check.isMutual])
  );

  const following = [
    ...userFollows.map((f) => ({
      id: f.following.id,
      displayName: f.following.displayName,
      username: f.following.username,
      profileImageUrl: f.following.profileImageUrl,
      bio: f.following.bio,
      isActor: f.following.isActor,
      followedAt: f.createdAt.toISOString(),
      type: 'user' as const,
      isMutualFollow: mutualFollowMap.get(f.following.id) || false,
    })),
    ...actorFollows.map((f) => {
      const actor = actorMap.get(f.npcId);
      return {
        id: f.npcId,
        displayName: actor?.name || f.npcId,
        username: null,
        profileImageUrl: null,
        bio: actor?.description || null,
        isActor: true,
        followedAt: f.followedAt.toISOString(),
        type: 'actor' as const,
      };
    }),
  ].sort((a, b) => new Date(b.followedAt).getTime() - new Date(a.followedAt).getTime());

  logger.info('Following list fetched successfully', { targetId, count: following.length }, 'GET /api/users/[userId]/following');

  return successResponse({
    following,
    count: following.length,
  });
});

