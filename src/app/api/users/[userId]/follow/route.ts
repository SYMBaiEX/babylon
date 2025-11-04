/**
 * API Route: /api/users/[userId]/follow
 * Methods: POST (follow), DELETE (unfollow), GET (check status)
 */

import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/database-service';
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler';
import { NotFoundError, BusinessLogicError } from '@/lib/errors';
import { UserIdParamSchema } from '@/lib/validation/schemas';
import { authenticate } from '@/lib/api/auth-middleware';
import { notifyFollow } from '@/lib/services/notification-service';
import { logger } from '@/lib/logger';

/**
 * POST /api/users/[userId]/follow
 * Follow a user or actor
 */
export const POST = withErrorHandling(async (
  request: NextRequest,
  context?: { params: Promise<{ userId: string }> }
) => {
  // Authenticate user
  const user = await authenticate(request);
  const params = await (context?.params || Promise.reject(new BusinessLogicError('Missing route context', 'MISSING_CONTEXT')));
  const { userId: targetId } = UserIdParamSchema.parse(params);

  // Prevent self-following
  if (user.userId === targetId) {
    throw new BusinessLogicError('Cannot follow yourself', 'SELF_FOLLOW');
  }

  // Check if target exists (could be a user or actor)
  // First check if it's a user
  const targetUser = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, isActor: true },
  });

  // If not a user, check if it's an actor (from actors.json)
  // Try to find in Actor table
  const targetActor = targetUser ? null : await prisma.actor.findUnique({
    where: { id: targetId },
    select: { id: true },
  });

  // If neither user nor actor found, return error
  if (!targetUser && !targetActor) {
    throw new NotFoundError('User or actor', targetId);
  }

  if (targetUser) {
    // Target is a user - use Follow model
    // Check if already following
    const existingFollow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: user.userId,
          followingId: targetId,
        },
      },
    });

    if (existingFollow) {
      throw new BusinessLogicError('Already following this user', 'ALREADY_FOLLOWING');
    }

    // Create follow relationship
    const follow = await prisma.follow.create({
      data: {
        followerId: user.userId,
        followingId: targetId,
      },
      include: {
        following: {
          select: {
            id: true,
            displayName: true,
            username: true,
            profileImageUrl: true,
            bio: true,
          },
        },
      },
    });

    // Create notification for the followed user
    await notifyFollow(targetId, user.userId);

    logger.info('User followed successfully', { userId: user.userId, targetId }, 'POST /api/users/[userId]/follow');

    return successResponse(
      {
        id: follow.id,
        following: follow.following,
        createdAt: follow.createdAt,
      },
      201
    );
  } else {
    // Target is an actor (NPC) - use FollowStatus model
    // Check if already following
    const existingFollowStatus = await prisma.followStatus.findUnique({
      where: {
        userId_npcId: {
          userId: user.userId,
          npcId: targetId,
        },
      },
    });

    if (existingFollowStatus && existingFollowStatus.isActive) {
      throw new BusinessLogicError('Already following this actor', 'ALREADY_FOLLOWING');
    }

    // Create or reactivate follow status
    const followStatus = await prisma.followStatus.upsert({
      where: {
        userId_npcId: {
          userId: user.userId,
          npcId: targetId,
        },
      },
      update: {
        isActive: true,
        followedAt: new Date(),
        unfollowedAt: null,
      },
      create: {
        userId: user.userId,
        npcId: targetId,
        followReason: 'user_followed',
      },
    });

    logger.info('Actor followed successfully', { userId: user.userId, npcId: targetId }, 'POST /api/users/[userId]/follow');

    return successResponse(
      {
        id: followStatus.id,
        npcId: followStatus.npcId,
        createdAt: followStatus.followedAt,
      },
      201
    );
  }
});

/**
 * DELETE /api/users/[userId]/follow
 * Unfollow a user or actor
 */
export const DELETE = withErrorHandling(async (
  request: NextRequest,
  context?: { params: Promise<{ userId: string }> }
) => {
  // Authenticate user
  const user = await authenticate(request);
  const params = await (context?.params || Promise.reject(new BusinessLogicError('Missing route context', 'MISSING_CONTEXT')));
  const { userId: targetId } = UserIdParamSchema.parse(params);

  // Check if target is a user
  const targetUser = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true },
  });

  if (targetUser) {
    // Target is a user - use Follow model
    const follow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: user.userId,
          followingId: targetId,
        },
      },
    });

    if (!follow) {
      throw new NotFoundError('Follow relationship', `${user.userId}-${targetId}`);
    }

    // Delete follow relationship
    await prisma.follow.delete({
      where: {
        id: follow.id,
      },
    });

    logger.info('User unfollowed successfully', { userId: user.userId, targetId }, 'DELETE /api/users/[userId]/follow');

    return successResponse({
      message: 'Unfollowed successfully',
    });
  } else {
    // Target is an actor (NPC) - use FollowStatus model
    const followStatus = await prisma.followStatus.findUnique({
      where: {
        userId_npcId: {
          userId: user.userId,
          npcId: targetId,
        },
      },
    });

    if (!followStatus) {
      throw new NotFoundError('Follow status', `${user.userId}-${targetId}`);
    }

    // Deactivate follow status
    await prisma.followStatus.update({
      where: {
        id: followStatus.id,
      },
      data: {
        isActive: false,
        unfollowedAt: new Date(),
      },
    });

    logger.info('Actor unfollowed successfully', { userId: user.userId, npcId: targetId }, 'DELETE /api/users/[userId]/follow');

    return successResponse({
      message: 'Unfollowed successfully',
    });
  }
});

/**
 * GET /api/users/[userId]/follow
 * Check if current user is following the target
 */
export const GET = withErrorHandling(async (
  request: NextRequest,
  context?: { params: Promise<{ userId: string }> }
) => {
  // Optional authentication - if not authenticated, return false
  const authUser = await authenticate(request).catch(() => null);
  const params = await (context?.params || Promise.reject(new BusinessLogicError('Missing route context', 'MISSING_CONTEXT')));
  const { userId: targetId } = UserIdParamSchema.parse(params);

  if (!authUser) {
    return successResponse({ isFollowing: false });
  }

  // Check if target is a user
  const targetUser = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true },
  });

  if (targetUser) {
    // Target is a user - check Follow model
    const follow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: authUser.userId,
          followingId: targetId,
        },
      },
    });

    logger.info('Follow status checked', { userId: authUser.userId, targetId, isFollowing: !!follow }, 'GET /api/users/[userId]/follow');

    return successResponse({
      isFollowing: !!follow,
    });
  } else {
    // Target might be an actor (NPC) - check FollowStatus model
    const targetActor = await prisma.actor.findUnique({
      where: { id: targetId },
      select: { id: true },
    });

    if (targetActor) {
      const followStatus = await prisma.followStatus.findUnique({
        where: {
          userId_npcId: {
            userId: authUser.userId,
            npcId: targetId,
          },
        },
      });

      const isFollowing = !!(followStatus && followStatus.isActive);
      logger.info('Actor follow status checked', { userId: authUser.userId, npcId: targetId, isFollowing }, 'GET /api/users/[userId]/follow');

      return successResponse({
        isFollowing,
      });
    } else {
      // Neither user nor actor found - return false for isFollowing
      // This prevents errors when checking follow status for non-existent profiles
      logger.info('Follow status checked for non-existent target', { userId: authUser.userId, targetId }, 'GET /api/users/[userId]/follow');

      return successResponse({
        isFollowing: false,
      });
    }
  }
});

