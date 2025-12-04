/**
 * User Followers API
 *
 * @route GET /api/users/[userId]/followers - Get followers list
 * @access Public
 *
 * @description
 * Returns list of users and actors following the target user. Supports both
 * regular users and NPCs/actors. Includes legacy follow status support.
 *
 * @openapi
 * /api/users/{userId}/followers:
 *   get:
 *     tags:
 *       - Users
 *     summary: Get followers list
 *     description: Returns list of users/actors following the target user
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
 *         description: Followers list retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 followers:
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
 *                       followedAt:
 *                         type: string
 *                         format: date-time
 *                       isActor:
 *                         type: boolean
 *                       tier:
 *                         type: string
 *                 count:
 *                   type: integer
 *
 * @example
 * ```typescript
 * const response = await fetch('/api/users/user_123/followers');
 * const { followers, count } = await response.json();
 * ```
 *
 * @see {@link /lib/db/context} RLS context
 */

import {
  optionalAuth,
  requireUserByIdentifier,
  successResponse,
  withErrorHandling,
} from '@babylon/api';
import {
  actorFollows,
  actors,
  and,
  db,
  desc,
  eq,
  followStatuses,
  follows,
  inArray,
  not,
  userActorFollows,
  users,
} from '@babylon/db';
import {
  logger,
  UserFollowersQuerySchema,
  UserIdParamSchema,
} from '@babylon/shared';
import type { NextRequest } from 'next/server';

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
export const GET = withErrorHandling(
  async (
    request: NextRequest,
    context: { params: Promise<{ userId: string }> }
  ) => {
    await optionalAuth(request);
    const params = await context.params;
    const { userId: targetIdentifier } = UserIdParamSchema.parse(params);

    // Validate query parameters
    const { searchParams } = new URL(request.url);
    const queryParams = {
      page: searchParams.get('page'),
      limit: searchParams.get('limit'),
      includeMutual: searchParams.get('includeMutual'),
    };
    UserFollowersQuerySchema.parse(queryParams);

    const targetUser = await requireUserByIdentifier(targetIdentifier, {
      id: true,
    });
    const targetId = targetUser.id;

    logger.debug(
      'Target not found as user, checking if actor',
      { targetIdentifier },
      'GET /api/users/[userId]/followers'
    );

    // Check if target is an actor
    const [targetActor] = await db
      .select({ id: actors.id })
      .from(actors)
      .where(eq(actors.id, targetId))
      .limit(1);

    let followersList: FollowerResponse[] = [];

    if (targetActor) {
      // Target is an NPC - get both actor followers and user followers
      const actorFollowersList = await db
        .select({
          id: actorFollows.id,
          followerId: actorFollows.followerId,
          createdAt: actorFollows.createdAt,
          followerName: actors.name,
          followerTier: actors.tier,
          followerProfileImageUrl: actors.profileImageUrl,
          followerDescription: actors.description,
        })
        .from(actorFollows)
        .innerJoin(actors, eq(actorFollows.followerId, actors.id))
        .where(eq(actorFollows.followingId, targetId))
        .orderBy(desc(actorFollows.createdAt));

      const userActorFollowersList = await db
        .select({
          id: userActorFollows.id,
          userId: userActorFollows.userId,
          createdAt: userActorFollows.createdAt,
          userDisplayName: users.displayName,
          userUsername: users.username,
          userProfileImageUrl: users.profileImageUrl,
          userBio: users.bio,
        })
        .from(userActorFollows)
        .innerJoin(users, eq(userActorFollows.userId, users.id))
        .where(eq(userActorFollows.actorId, targetId))
        .orderBy(desc(userActorFollows.createdAt))
        .limit(200);

      const migratedUserIds = new Set(
        userActorFollowersList.map((f) => f.userId)
      );

      const legacyUserFollowerStatuses = await db
        .select()
        .from(followStatuses)
        .where(
          and(
            eq(followStatuses.npcId, targetId),
            eq(followStatuses.isActive, true),
            eq(followStatuses.followReason, 'user_followed')
          )
        )
        .orderBy(desc(followStatuses.followedAt))
        .limit(100);

      // Fetch user data separately since FollowStatus doesn't have a relation to User
      const legacyUserIds = legacyUserFollowerStatuses
        .map((f) => f.userId)
        .filter((id) => !migratedUserIds.has(id));

      const legacyUsers =
        legacyUserIds.length > 0
          ? await db
              .select({
                id: users.id,
                displayName: users.displayName,
                username: users.username,
                profileImageUrl: users.profileImageUrl,
                bio: users.bio,
              })
              .from(users)
              .where(inArray(users.id, legacyUserIds))
          : [];

      // Create a map for quick lookup
      const userMap = new Map(legacyUsers.map((u) => [u.id, u]));

      followersList = [
        ...actorFollowersList.map((f) => ({
          id: f.followerId,
          displayName: f.followerName,
          username: f.followerId,
          profileImageUrl: f.followerProfileImageUrl || null,
          bio: f.followerDescription || '',
          followedAt: f.createdAt.toISOString(),
          isActor: true,
          tier: f.followerTier || undefined,
        })),
        ...userActorFollowersList.map((f) => ({
          id: f.userId,
          displayName: f.userDisplayName || '',
          username: f.userUsername || null,
          profileImageUrl: f.userProfileImageUrl || null,
          bio: f.userBio || '',
          followedAt: f.createdAt.toISOString(),
          isActor: false,
        })),
        ...legacyUserFollowerStatuses
          .filter((f) => !migratedUserIds.has(f.userId))
          .map((f) => {
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
      ].sort(
        (a, b) =>
          new Date(b.followedAt).getTime() - new Date(a.followedAt).getTime()
      );
    } else {
      // Target is a regular user
      const userFollows = await db
        .select({
          id: follows.id,
          followerId: follows.followerId,
          createdAt: follows.createdAt,
          followerDisplayName: users.displayName,
          followerUsername: users.username,
          followerProfileImageUrl: users.profileImageUrl,
          followerBio: users.bio,
        })
        .from(follows)
        .innerJoin(users, eq(follows.followerId, users.id))
        .where(eq(follows.followingId, targetId))
        .orderBy(desc(follows.createdAt));

      const npcFollowersList = await db
        .select()
        .from(followStatuses)
        .where(
          and(
            eq(followStatuses.userId, targetId),
            eq(followStatuses.isActive, true),
            not(eq(followStatuses.followReason, 'user_followed'))
          )
        )
        .orderBy(desc(followStatuses.followedAt));

      const npcIds = npcFollowersList.map((f) => f.npcId);
      const npcActors =
        npcIds.length > 0
          ? await db
              .select({
                id: actors.id,
                name: actors.name,
                tier: actors.tier,
                profileImageUrl: actors.profileImageUrl,
                description: actors.description,
              })
              .from(actors)
              .where(inArray(actors.id, npcIds))
          : [];
      const actorMap = new Map(npcActors.map((actor) => [actor.id, actor]));

      followersList = [
        ...userFollows.map((f) => ({
          id: f.followerId,
          displayName: f.followerDisplayName || '',
          username: f.followerUsername || null,
          profileImageUrl: f.followerProfileImageUrl || null,
          bio: f.followerBio || '',
          followedAt: f.createdAt.toISOString(),
          isActor: false,
        })),
        ...npcFollowersList.map((f) => {
          const actor = actorMap.get(f.npcId);
          return {
            id: f.npcId,
            displayName: actor?.name || f.npcId,
            username: actor?.id || null,
            profileImageUrl: actor?.profileImageUrl || null,
            bio: actor?.description || '',
            followedAt: f.followedAt.toISOString(),
            isActor: true,
            tier: actor?.tier || undefined,
          };
        }),
      ].sort(
        (a, b) =>
          new Date(b.followedAt).getTime() - new Date(a.followedAt).getTime()
      );
    }

    logger.info(
      'Followers fetched successfully',
      { targetId, count: followersList.length, isActor: !!targetActor },
      'GET /api/users/[userId]/followers'
    );

    return successResponse({
      followers: followersList,
      count: followersList.length,
    });
  }
);
