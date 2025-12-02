/**
 * Actor Statistics API
 *
 * @route GET /api/actors/[actorId]/stats
 * @access Public
 *
 * @description
 * Returns comprehensive statistics for a specific actor (NPC), including follower
 * counts (from both ActorFollow and UserActorFollow), following count, and post count.
 * Supports lookup by actor ID or name (case-insensitive).
 *
 * @openapi
 * /api/actors/{actorId}/stats:
 *   get:
 *     tags:
 *       - Actors
 *     summary: Get actor statistics
 *     description: Returns follower counts, following count, and post count for a specific actor. Supports lookup by ID or name.
 *     parameters:
 *       - in: path
 *         name: actorId
 *         required: true
 *         schema:
 *           type: string
 *         description: Actor ID or name (case-insensitive)
 *     responses:
 *       200:
 *         description: Actor statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 stats:
 *                   type: object
 *                   properties:
 *                     followers:
 *                       type: integer
 *                       description: Total followers (actors + users)
 *                     following:
 *                       type: integer
 *                       description: Number of actors this actor follows
 *                     posts:
 *                       type: integer
 *                       description: Total posts by this actor
 *                     actorFollowers:
 *                       type: integer
 *                       description: Followers who are NPCs
 *                     userFollowers:
 *                       type: integer
 *                       description: Followers who are users
 *       404:
 *         description: Actor not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *
 * @param {string} actorId - Actor ID or name (path parameter)
 *
 * @returns {Promise<NextResponse>} Actor statistics including followers, following, and posts
 *
 * @example
 * ```typescript
 * const response = await fetch('/api/actors/actor_123/stats');
 * const { stats } = await response.json();
 * console.log(stats.followers); // Total follower count
 * ```
 *
 * @see {@link @babylon/api} Error handling utilities
 */

import type { NextRequest } from 'next/server';
import { db } from '@babylon/db';
import { BusinessLogicError } from '@babylon/api';
import { successResponse, withErrorHandling } from '@babylon/api';
import { logger } from '@babylon/shared';

/**
 * GET /api/actors/[actorId]/stats
 *
 * @description Get actor statistics (followers, following, posts)
 *
 * @param {NextRequest} _request - Request object
 * @param {Promise<{actorId: string}>} context.params - Route parameters
 *
 * @returns {Promise<NextResponse>} Actor statistics
 */
export const GET = withErrorHandling(
  async (
    _request: NextRequest,
    context: { params: Promise<{ actorId: string }> }
  ) => {
    const params = await context.params;
    const { actorId } = params;

    // Try to find actor by ID first, then by name (case-insensitive)
    let actor: { id: string } | null = await db.actor.findUnique({
      where: { id: actorId },
      select: { id: true },
    });

    // If not found by ID, try finding by name
    if (!actor) {
      actor = await db.actor.findFirst({
        where: {
          name: { equals: actorId, mode: 'insensitive' },
        },
        select: { id: true },
      });
    }

    if (!actor) {
      throw new BusinessLogicError(`Actor ${actorId} not found`, 'NOT_FOUND');
    }

    // Use the actual actor ID for all queries
    const actualActorId = actor.id;

    // Get follower counts (both from ActorFollow and UserActorFollow)
    const [
      actorFollowerCount,
      userActorFollowerCount,
      legacyUserFollowerCount,
      followingCount,
      postCount,
    ] = await Promise.all([
      // NPCs following this actor (ActorFollow)
      db.actorFollow.count({
        where: { followingId: actualActorId },
      }),
      // Users following this actor (UserActorFollow)
      db.userActorFollow.count({
        where: {
          actorId: actualActorId,
        },
      }),
      // Legacy FollowStatus entries created before migration
      db.followStatus.count({
        where: {
          npcId: actualActorId,
          isActive: true,
          followReason: 'user_followed',
        },
      }),
      // This actor following others (only NPC-to-NPC follows via ActorFollow)
      db.actorFollow.count({
        where: { followerId: actualActorId },
      }),
      // Posts by this actor
      db.post.count({
        where: { authorId: actualActorId },
      }),
    ]);

    const totalUserFollowers = userActorFollowerCount + legacyUserFollowerCount;
    const totalFollowers = actorFollowerCount + totalUserFollowers;

    logger.info(
      'Actor stats fetched successfully',
      {
        actorId,
        actualActorId,
        totalFollowers,
        actorFollowerCount,
        userActorFollowerCount,
        legacyUserFollowerCount,
        followingCount,
      },
      'GET /api/actors/[actorId]/stats'
    );

    return successResponse({
      stats: {
        followers: totalFollowers,
        following: followingCount,
        posts: postCount,
        actorFollowers: actorFollowerCount,
        userFollowers: totalUserFollowers,
      },
    });
  }
);
