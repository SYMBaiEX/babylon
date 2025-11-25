/**
 * User Following API
 * 
 * @route GET /api/users/[userId]/following - Get following list
 * @access Public
 * 
 * @description
 * Returns list of users and actors that the target user is following. Supports
 * both regular users and NPCs/actors. Includes mutual follow indicators when
 * viewing own following list.
 * 
 * @openapi
 * /api/users/{userId}/following:
 *   get:
 *     tags:
 *       - Users
 *     summary: Get following list
 *     description: Returns list of users/actors that the target user is following
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID, username, or wallet address
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Results per page
 *       - in: query
 *         name: includeMutual
 *         schema:
 *           type: boolean
 *         description: Include mutual follow indicators
 *     responses:
 *       200:
 *         description: Following list retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 following:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       displayName:
 *                         type: string
 *                       username:
 *                         type: string
 *                         nullable: true
 *                       profileImageUrl:
 *                         type: string
 *                         nullable: true
 *                       bio:
 *                         type: string
 *                         nullable: true
 *                       followedAt:
 *                         type: string
 *                         format: date-time
 *                       isActor:
 *                         type: boolean
 *                       type:
 *                         type: string
 *                         enum: [user, actor]
 *                       tier:
 *                         type: string
 *                         nullable: true
 *                       isMutualFollow:
 *                         type: boolean
 *                 count:
 *                   type: integer
 * 
 * @example
 * ```typescript
 * const response = await fetch('/api/users/user_123/following');
 * const { following, count } = await response.json();
 * ```
 * 
 * @see {@link /lib/db/context} RLS context
 */

import {
  optionalAuth,
  successResponse
} from '@/lib/api/auth-middleware';
import { 
  db, 
  actors, 
  actorFollows, 
  userActorFollows, 
  followStatuses, 
  users, 
  follows,
  eq,
  and,
  inArray,
  desc
} from '@/db';
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
  context: { params: Promise<{ userId: string }> }
) => {
  // Optional authentication - if authenticated, can provide personalized data
  const authUser = await optionalAuth(request);
  const params = await context.params;
  const { userId: targetIdentifier } = UserIdParamSchema.parse(params);
  
  // Validate query parameters
  const { searchParams } = new URL(request.url);
  const queryParams = {
    page: searchParams.get('page'),
    limit: searchParams.get('limit'),
    includeMutual: searchParams.get('includeMutual')
  };
  UserFollowersQuerySchema.parse(queryParams);

  const targetUser = await requireUserByIdentifier(targetIdentifier, { id: true })
  const targetId = targetUser.id

  logger.debug('Target not found as user, checking if actor', { targetIdentifier }, 'GET /api/users/[userId]/following')

  // Check if target is an actor
  const [targetActor] = await db.select({ id: actors.id })
    .from(actors)
    .where(eq(actors.id, targetId))
    .limit(1);

  let followingList: FollowingResponse[] = [];

  if (targetActor) {
    // Target is an NPC - get actors they follow
    const actorFollowsList = await db.select({
      id: actorFollows.id,
      followingId: actorFollows.followingId,
      createdAt: actorFollows.createdAt,
      followingName: actors.name,
      followingTier: actors.tier,
      followingProfileImageUrl: actors.profileImageUrl,
      followingDescription: actors.description,
    })
      .from(actorFollows)
      .innerJoin(actors, eq(actorFollows.followingId, actors.id))
      .where(eq(actorFollows.followerId, targetId))
      .orderBy(desc(actorFollows.createdAt));

    followingList = actorFollowsList.map(f => ({
      id: f.followingId,
      displayName: f.followingName,
      username: f.followingId,
      profileImageUrl: f.followingProfileImageUrl || null,
      bio: f.followingDescription || '',
      followedAt: f.createdAt.toISOString(),
      isActor: true,
      tier: f.followingTier || null,
    }));
  } else {
    // Target is a regular user
    // Get users being followed (Follow model)
    const userFollowsList = await db.select({
      id: follows.id,
      followingId: follows.followingId,
      createdAt: follows.createdAt,
      followingDisplayName: users.displayName,
      followingUsername: users.username,
      followingProfileImageUrl: users.profileImageUrl,
      followingBio: users.bio,
      followingIsActor: users.isActor,
    })
      .from(follows)
      .innerJoin(users, eq(follows.followingId, users.id))
      .where(eq(follows.followerId, targetId))
      .orderBy(desc(follows.createdAt));

    // Get actors being followed (UserActorFollow model with legacy support)
    const actorFollowsList = await db.select({
      id: userActorFollows.id,
      actorId: userActorFollows.actorId,
      createdAt: userActorFollows.createdAt,
      actorName: actors.name,
      actorDescription: actors.description,
      actorProfileImageUrl: actors.profileImageUrl,
      actorTier: actors.tier,
    })
      .from(userActorFollows)
      .leftJoin(actors, eq(userActorFollows.actorId, actors.id))
      .where(eq(userActorFollows.userId, targetId))
      .orderBy(desc(userActorFollows.createdAt));

    const migratedActorIds = new Set(actorFollowsList.map(f => f.actorId));

    const legacyActorFollows = await db.select()
      .from(followStatuses)
      .where(and(
        eq(followStatuses.userId, targetId),
        eq(followStatuses.isActive, true),
        eq(followStatuses.followReason, 'user_followed')
      ))
      .orderBy(desc(followStatuses.followedAt));

    const legacyActorIds = legacyActorFollows
      .map(f => f.npcId)
      .filter(id => !migratedActorIds.has(id));

    const legacyActors = legacyActorIds.length > 0
      ? await db.select({
          id: actors.id,
          name: actors.name,
          description: actors.description,
          profileImageUrl: actors.profileImageUrl,
          tier: actors.tier,
        })
        .from(actors)
        .where(inArray(actors.id, legacyActorIds))
      : [];

    const legacyActorMap = new Map(legacyActors.map(actor => [actor.id, actor]));

    // Check mutual follows if authenticated user is viewing their own following list
    const mutualFollowChecks = authUser && authUser.userId === targetId
      ? await Promise.all(
          userFollowsList.map(async (f) => {
            const [mutualFollow] = await db.select({ id: follows.id })
              .from(follows)
              .where(and(
                eq(follows.followerId, f.followingId),
                eq(follows.followingId, authUser.userId)
              ))
              .limit(1);
            return { userId: f.followingId, isMutual: !!mutualFollow };
          })
        )
      : [];

    const mutualFollowMap = new Map(
      mutualFollowChecks.map((check) => [check.userId, check.isMutual])
    );

    followingList = [
      ...userFollowsList.map((f) => ({
        id: f.followingId,
        displayName: f.followingDisplayName || '',
        username: f.followingUsername || null,
        profileImageUrl: f.followingProfileImageUrl || null,
        bio: f.followingBio || null,
        isActor: f.followingIsActor,
        followedAt: f.createdAt.toISOString(),
        type: 'user' as const,
        tier: null,
        isMutualFollow: mutualFollowMap.get(f.followingId) || false,
      })),
      ...actorFollowsList.map((f) => {
        if (!f.actorName) {
          return {
            id: f.actorId,
            displayName: f.actorId,
            username: null,
            profileImageUrl: null,
            bio: null,
            isActor: true,
            followedAt: f.createdAt.toISOString(),
            type: 'actor' as const,
            tier: null,
          };
        }

        return {
          id: f.actorId,
          displayName: f.actorName || f.actorId,
          username: null,
          profileImageUrl: f.actorProfileImageUrl || null,
          bio: f.actorDescription || null,
          isActor: true,
          followedAt: f.createdAt.toISOString(),
          type: 'actor' as const,
          tier: f.actorTier || null,
        };
      }),
      ...legacyActorFollows
        .filter(f => !migratedActorIds.has(f.npcId))
        .map((f) => {
          const actor = legacyActorMap.get(f.npcId);
          return {
            id: f.npcId,
            displayName: actor?.name || f.npcId,
            username: null,
            profileImageUrl: actor?.profileImageUrl || null,
            bio: actor?.description || null,
            isActor: true,
            followedAt: f.followedAt.toISOString(),
            type: 'actor' as const,
            tier: actor?.tier || null,
          };
        }),
    ].sort((a, b) => new Date(b.followedAt).getTime() - new Date(a.followedAt).getTime());
  }

  logger.info('Following list fetched successfully', { targetId, count: followingList.length, isActor: !!targetActor }, 'GET /api/users/[userId]/following');

  return successResponse({
    following: followingList,
    count: followingList.length,
  });
});
