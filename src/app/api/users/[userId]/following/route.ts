/**
 * API Route: /api/users/[userId]/following
 * Methods: GET (get following list)
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

interface FollowingResponse {
  id: string;
  displayName: string;
  username: string | null;
  profileImageUrl: string | null;
  bio: string | null;
  followedAt: string;
  isActor: boolean;
  type?: 'user' | 'actor';
  tier?: string | null;
  isMutualFollow?: boolean;
}

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
    logger.debug('Target not found as user, checking if actor', { targetIdentifier }, 'GET /api/users/[userId]/following');
  }

  // Check if target is an actor (NPC)
  const targetActor = await prisma.actor.findUnique({
    where: { id: targetId },
  });

  if (!targetActor && !targetUser) {
    throw new BusinessLogicError('User or actor not found', 'NOT_FOUND');
  }

  let following: FollowingResponse[] = [];

  if (targetActor) {
    // Target is an NPC - get actors they follow
    const actorFollows = await prisma.actorFollow.findMany({
      where: { followerId: targetId },
      include: {
        following: {
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

    following = actorFollows.map(f => ({
      id: f.following.id,
      displayName: f.following.name,
      username: f.following.id,
      profileImageUrl: f.following.profileImageUrl || null,
      bio: f.following.description || '',
      followedAt: f.createdAt.toISOString(),
      isActor: true,
      tier: f.following.tier || null,
    }));
  } else {
    // Target is a regular user
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

    following = [
      ...userFollows.map((f) => ({
        id: f.following.id,
        displayName: f.following.displayName || '',
        username: f.following.username || null,
        profileImageUrl: f.following.profileImageUrl || null,
        bio: f.following.bio || null,
        isActor: f.following.isActor,
        followedAt: f.createdAt.toISOString(),
        type: 'user' as const,
        tier: null,
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
          tier: null,
        };
      }),
    ].sort((a, b) => new Date(b.followedAt).getTime() - new Date(a.followedAt).getTime());
  }

  logger.info('Following list fetched successfully', { targetId, count: following.length, isActor: !!targetActor }, 'GET /api/users/[userId]/following');

  return successResponse({
    following,
    count: following.length,
  });
});
