/**
 * API Route: /api/users/[userId]/follow
 * Methods: POST (follow), DELETE (unfollow), GET (check status)
 */

import type { NextRequest } from 'next/server';
import type { PrismaClient } from '@prisma/client';
import { authenticate } from '@/lib/api/auth-middleware';
import { asUser } from '@/lib/db/context';
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler';
import { NotFoundError, BusinessLogicError } from '@/lib/errors';
import { UserIdParamSchema } from '@/lib/validation/schemas';
import { notifyFollow } from '@/lib/services/notification-service';
import { logger } from '@/lib/logger';

/**
 * Helper function to resolve username or user ID to actual user ID
 * Accepts both usernames and user IDs (UUID or Privy DID)
 * Also checks for actors (NPCs) if user lookup fails
 * Returns the identifier as-is if it's an actor ID (actors don't need resolution)
 */
async function resolveUserId(
  identifier: string,
  authUser: Awaited<ReturnType<typeof authenticate>>,
  db: PrismaClient
): Promise<string> {
  // Check if it's a UUID or Privy DID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89abAB][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const privyDidRegex = /^did:privy:[a-z0-9]+$/i;
  
  if (uuidRegex.test(identifier) || privyDidRegex.test(identifier)) {
    // It's already a user ID format, validate and return
    UserIdParamSchema.parse({ userId: identifier });
    logger.debug('Resolved identifier as user ID', { identifier, userId: authUser.userId }, 'resolveUserId');
    return identifier;
  }
  
  // Check if it's an actor ID first (actors are identified by their ID directly)
  // Actor IDs are typically lowercase with hyphens (e.g., "sucker-carlton")
  const actorExists = await db.actor.findUnique({
    where: { id: identifier },
    select: { id: true },
  });
  
  if (actorExists) {
    // Actor IDs are used directly, no resolution needed
    logger.debug('Resolved identifier as actor ID', { identifier, userId: authUser.userId }, 'resolveUserId');
    return identifier;
  }
  
  // Looks like a username, try to resolve it to user ID
  const resolvedUser = await db.user.findUnique({
    where: { username: identifier },
    select: { id: true },
  });
  
  if (resolvedUser) {
    logger.debug('Resolved username to user ID', { 
      username: identifier, 
      userId: resolvedUser.id,
      requesterId: authUser.userId 
    }, 'resolveUserId');
    return resolvedUser.id;
  }
  
  // Try checking actor by name as fallback
  const actorByName = await db.actor.findFirst({
    where: { name: identifier },
    select: { id: true },
  });
  
  if (actorByName) {
    logger.debug('Resolved identifier as actor name', { 
      name: identifier, 
      actorId: actorByName.id,
      userId: authUser.userId 
    }, 'resolveUserId');
    return actorByName.id;
  }
  
  // Neither user nor actor found
  logger.warn('Failed to resolve identifier', { 
    identifier, 
    userId: authUser.userId 
  }, 'resolveUserId');
  throw new NotFoundError('User or actor', identifier);
}

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
  const identifier = params.userId;
  
  // Resolve username to user ID if needed
  const targetId = await asUser(user, async (db) => {
    return await resolveUserId(identifier, user, db);
  });

  // Prevent self-following
  if (user.userId === targetId) {
    throw new BusinessLogicError('Cannot follow yourself', 'SELF_FOLLOW');
  }

  // Follow user/actor with RLS
  const result = await asUser(user, async (db) => {
    // Check if target exists (could be a user or actor)
    // First check if it's a user
    const targetUser = await db.user.findUnique({
      where: { id: targetId },
      select: { id: true, isActor: true },
    });

    // If not a user, check if it's an actor (from actors.json)
    // Try to find in Actor table
    const targetActor = targetUser ? null : await db.actor.findUnique({
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
      const existingFollow = await db.follow.findUnique({
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
      const follow = await db.follow.create({
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

      return { type: 'user' as const, follow };
    } else {
      // Target is an actor (NPC) - use FollowStatus model
      // Check if already following
      const existingFollowStatus = await db.followStatus.findUnique({
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
      const followStatus = await db.followStatus.upsert({
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

      return { type: 'actor' as const, followStatus };
    }
  });

  // Create notification for the followed user (if user, not actor)
  if (result.type === 'user') {
    await notifyFollow(targetId, user.userId);
    logger.info('User followed successfully', { userId: user.userId, targetId }, 'POST /api/users/[userId]/follow');
    return successResponse(
      {
        id: result.follow.id,
        following: result.follow.following,
        createdAt: result.follow.createdAt,
      },
      201
    );
  } else {
    logger.info('Actor followed successfully', { userId: user.userId, npcId: targetId }, 'POST /api/users/[userId]/follow');
    return successResponse(
      {
        id: result.followStatus.id,
        npcId: result.followStatus.npcId,
        createdAt: result.followStatus.followedAt,
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
  const identifier = params.userId;
  
  // Resolve username to user ID if needed
  const targetId = await asUser(user, async (db) => {
    return await resolveUserId(identifier, user, db);
  });

  // Unfollow with RLS
  await asUser(user, async (db) => {
    // Check if target is a user
    const targetUser = await db.user.findUnique({
      where: { id: targetId },
      select: { id: true },
    });

    if (targetUser) {
      // Target is a user - use Follow model
      const follow = await db.follow.findUnique({
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
      await db.follow.delete({
        where: {
          id: follow.id,
        },
      });

      logger.info('User unfollowed successfully', { userId: user.userId, targetId }, 'DELETE /api/users/[userId]/follow');
    } else {
      // Target is an actor (NPC) - use FollowStatus model
      const followStatus = await db.followStatus.findUnique({
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
      await db.followStatus.update({
        where: {
          id: followStatus.id,
        },
        data: {
          isActive: false,
          unfollowedAt: new Date(),
        },
      });

      logger.info('Actor unfollowed successfully', { userId: user.userId, npcId: targetId }, 'DELETE /api/users/[userId]/follow');
    }
  });

  return successResponse({
    message: 'Unfollowed successfully',
  });
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
  const identifier = params.userId;

  if (!authUser) {
    return successResponse({ isFollowing: false });
  }

  // Resolve username to user ID if needed and check follow status with RLS
  const isFollowing = await asUser(authUser, async (db) => {
    const targetId = await resolveUserId(identifier, authUser, db);
    
    // Check if target is a user
    const targetUser = await db.user.findUnique({
      where: { id: targetId },
      select: { id: true },
    });

    if (targetUser) {
      // Target is a user - check Follow model
      const follow = await db.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: authUser.userId,
            followingId: targetId,
          },
        },
      });

      logger.info('Follow status checked', { userId: authUser.userId, targetId, isFollowing: !!follow }, 'GET /api/users/[userId]/follow');
      return !!follow;
    } else {
      // Target might be an actor (NPC) - check FollowStatus model
      const targetActor = await db.actor.findUnique({
        where: { id: targetId },
        select: { id: true },
      });

      if (targetActor) {
        const followStatus = await db.followStatus.findUnique({
          where: {
            userId_npcId: {
              userId: authUser.userId,
              npcId: targetId,
            },
          },
        });

        const isFollowing = !!(followStatus && followStatus.isActive);
        logger.info('Actor follow status checked', { userId: authUser.userId, npcId: targetId, isFollowing }, 'GET /api/users/[userId]/follow');
        return isFollowing;
      } else {
        // Neither user nor actor found - return false for isFollowing
        // This prevents errors when checking follow status for non-existent profiles
        logger.info('Follow status checked for non-existent target', { userId: authUser.userId, targetId }, 'GET /api/users/[userId]/follow');
        return false;
      }
    }
  });

  return successResponse({
    isFollowing,
  });
});

