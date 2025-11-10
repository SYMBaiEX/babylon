/**
 * API Route: /api/users/[userId]/followers
 * Methods: GET (get followers list)
 */

import {
  optionalAuth,
  successResponse
} from '@/lib/api/auth-middleware';
import { prisma } from '@/lib/database-service';
import { BusinessLogicError } from '@/lib/errors';
import { withErrorHandling } from '@/lib/errors/error-handler';
import { logger } from '@/lib/logger';
import { UserFollowersQuerySchema, UserIdParamSchema } from '@/lib/validation/schemas';
import type { NextRequest } from 'next/server';
import { requireUserByIdentifier } from '@/lib/users/user-lookup';

interface FollowerResponse {
  id: string;
  displayName: string;
  username: string | null;
  profileImageUrl: string | null;
  bio: string;
  followedAt: string;
  isActor: boolean;
  tier?: string;
}

/**
 * GET /api/users/[userId]/followers
 * Get list of users following the target user
 */
export const GET = withErrorHandling(async (
  request: NextRequest,
  context?: { params: Promise<{ userId: string }> }
) => {
  await optionalAuth(request);
  const params = await (context?.params || Promise.reject(new BusinessLogicError('Missing route context', 'MISSING_CONTEXT')));
  const { userId: targetIdentifier } = UserIdParamSchema.parse(params);
  
  // Validate query parameters
  const { searchParams } = new URL(request.url);
  const queryParams = {
    page: searchParams.get('page'),
    limit: searchParams.get('limit'),
    includeMutual: searchParams.get('includeMutual')
  };
  UserFollowersQuerySchema.parse(queryParams);

  // Try to find as user first, then actor
  let targetId = targetIdentifier;
  let targetUser = null;
  
  try {
    targetUser = await requireUserByIdentifier(targetIdentifier, { id: true });
    targetId = targetUser.id;
  } catch {
    // Not a user, might be an actor - continue with targetIdentifier
    logger.debug('Target not found as user, checking if actor', { targetIdentifier }, 'GET /api/users/[userId]/followers');
  }

  // Check if target is an actor (NPC)
  const targetActor = await prisma.actor.findUnique({
    where: { id: targetId },
  });

  if (!targetActor && !targetUser) {
    throw new BusinessLogicError('User or actor not found', 'NOT_FOUND');
  }

  let followers: FollowerResponse[] = [];

  if (targetActor) {
    // Target is an NPC - get both actor followers and user followers
    const actorFollowers = await prisma.actorFollow.findMany({
      where: { followingId: targetId },
      include: {
        follower: {
          select: {
            id: true,
            name: true,
            tier: true,
            profileImageUrl: true,
            description: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const userFollowerStatuses = await prisma.followStatus.findMany({
      where: {
        npcId: targetId,
        isActive: true,
      },
      orderBy: { followedAt: 'desc' },
      take: 100,
    });

    // Fetch user data separately since FollowStatus doesn't have a relation to User
    const userIds = userFollowerStatuses.map(f => f.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        displayName: true,
        username: true,
        profileImageUrl: true,
        bio: true,
      },
    });

    // Create a map for quick lookup
    const userMap = new Map(users.map(u => [u.id, u]));

    followers = [
      ...actorFollowers.map(f => ({
        id: f.follower.id,
        displayName: f.follower.name,
        username: f.follower.id,
        profileImageUrl: f.follower.profileImageUrl || null,
        bio: f.follower.description || '',
        followedAt: f.createdAt.toISOString(),
        isActor: true,
        tier: f.follower.tier || undefined,
      })),
      ...userFollowerStatuses.map(f => {
        const user = userMap.get(f.userId);
        return {
          id: f.userId,
          displayName: user?.displayName || '',
          username: user?.username || null,
          profileImageUrl: user?.profileImageUrl || null,
          bio: user?.bio || '',
          followedAt: f.followedAt.toISOString(),
          isActor: false,
        };
      }),
    ];
  } else {
    // Target is a regular user
    const follows = await prisma.follow.findMany({
      where: { followingId: targetId },
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
      orderBy: { createdAt: 'desc' },
    });

    followers = follows.map(f => ({
      id: f.follower.id,
      displayName: f.follower.displayName || '',
      username: f.follower.username || null,
      profileImageUrl: f.follower.profileImageUrl || null,
      bio: f.follower.bio || '',
      followedAt: f.createdAt.toISOString(),
      isActor: false,
    }));
  }

  logger.info('Followers fetched successfully', { targetId, count: followers.length, isActor: !!targetActor }, 'GET /api/users/[userId]/followers');

  return successResponse({
    followers,
    count: followers.length,
  });
});
