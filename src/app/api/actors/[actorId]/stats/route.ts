/**
 * API Route: /api/actors/[actorId]/stats
 * Methods: GET (get actor stats including followers, following, etc.)
 */

import { prisma } from '@/lib/database-service';
import { BusinessLogicError } from '@/lib/errors';
import { successResponse, withErrorHandling } from '@/lib/errors/error-handler';
import { logger } from '@/lib/logger';
import type { NextRequest } from 'next/server';

/**
 * GET /api/actors/[actorId]/stats
 * Get actor statistics (followers, following, posts)
 */
export const GET = withErrorHandling(async (
  _request: NextRequest,
  context?: { params: Promise<{ actorId: string }> }
) => {
  const params = await (context?.params || Promise.reject(new BusinessLogicError('Missing route context', 'MISSING_CONTEXT')));
  const { actorId } = params;

  // Verify actor exists
  const actor = await prisma.actor.findUnique({
    where: { id: actorId },
    select: { id: true },
  });

  if (!actor) {
    throw new BusinessLogicError(`Actor ${actorId} not found`, 'NOT_FOUND');
  }

  // Get follower counts (both from ActorFollow and FollowStatus)
  const [actorFollowerCount, userFollowerCount, followingCount, postCount] = await Promise.all([
    // NPCs following this actor
    prisma.actorFollow.count({
      where: { followingId: actorId },
    }),
    // Users following this actor
    prisma.followStatus.count({
      where: { 
        npcId: actorId,
        isActive: true,
      },
    }),
    // This actor following others (only NPC-to-NPC follows)
    prisma.actorFollow.count({
      where: { followerId: actorId },
    }),
    // Posts by this actor
    prisma.post.count({
      where: { authorId: actorId },
    }),
  ]);

  const totalFollowers = actorFollowerCount + userFollowerCount;

  logger.info('Actor stats fetched successfully', { 
    actorId, 
    totalFollowers,
    actorFollowerCount,
    userFollowerCount,
    followingCount 
  }, 'GET /api/actors/[actorId]/stats');

  return successResponse({
    stats: {
      followers: totalFollowers,
      following: followingCount,
      posts: postCount,
      actorFollowers: actorFollowerCount,
      userFollowers: userFollowerCount,
    },
  });
});

