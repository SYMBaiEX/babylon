/**
 * API Route: /api/users/[userId]/follow
 * Methods: POST (follow), DELETE (unfollow)
 */

import type { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import {
  authenticate,
  authErrorResponse,
  successResponse,
  errorResponse,
} from '@/lib/api/auth-middleware';
import { notifyFollow } from '@/lib/services/notification-service';
import { logger } from '@/lib/logger';

const prisma = new PrismaClient();

/**
 * POST /api/users/[userId]/follow
 * Follow a user or actor
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    // Authenticate user
    const user = await authenticate(request);
    const { userId: targetIdRaw } = await params;
    
    // Decode the target ID in case it was URL encoded
    const targetId = decodeURIComponent(targetIdRaw);

    // Validate target ID
    if (!targetId) {
      return errorResponse('User ID is required', 400);
    }

    // Prevent self-following
    if (user.userId === targetId) {
      return errorResponse('Cannot follow yourself', 400);
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
      return errorResponse('User or profile not found', 404);
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
        return errorResponse('Already following this user', 400);
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
        return errorResponse('Already following this actor', 400);
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

      return successResponse(
        {
          id: followStatus.id,
          npcId: followStatus.npcId,
          createdAt: followStatus.followedAt,
        },
        201
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication failed') {
      return authErrorResponse('Unauthorized');
    }
    logger.error('Error following user:', error, 'POST /api/users/[userId]/follow');
    return errorResponse('Failed to follow user');
  }
}

/**
 * DELETE /api/users/[userId]/follow
 * Unfollow a user or actor
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    // Authenticate user
    const user = await authenticate(request);
    const { userId: targetIdRaw } = await params;
    
    // Decode the target ID in case it was URL encoded
    const targetId = decodeURIComponent(targetIdRaw);

    // Validate target ID
    if (!targetId) {
      return errorResponse('User ID is required', 400);
    }

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
        return errorResponse('Not following this user', 404);
      }

      // Delete follow relationship
      await prisma.follow.delete({
        where: {
          id: follow.id,
        },
      });

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
        return errorResponse('Not following this actor', 404);
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

      return successResponse({
        message: 'Unfollowed successfully',
      });
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication failed') {
      return authErrorResponse('Unauthorized');
    }
    logger.error('Error unfollowing user:', error, 'DELETE /api/users/[userId]/follow');
    return errorResponse('Failed to unfollow user');
  }
}

/**
 * GET /api/users/[userId]/follow
 * Check if current user is following the target
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    // Optional authentication - if not authenticated, return false
    const authUser = await authenticate(request).catch(() => null);
    const { userId: targetId } = await params;

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

        return successResponse({
          isFollowing: !!(followStatus && followStatus.isActive),
        });
      } else {
        // Neither user nor actor found - return false for isFollowing
        // This prevents errors when checking follow status for non-existent profiles
        return successResponse({
          isFollowing: false,
        });
      }
    }
  } catch (error) {
    logger.error('Error checking follow status:', error, 'GET /api/users/[userId]/follow');
    return successResponse({ isFollowing: false });
  }
}

