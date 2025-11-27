/**
 * User Share API
 *
 * @route GET /api/users/[userId]/share - Get verified shares
 * @route POST /api/users/[userId]/share - Track share action
 * @access Authenticated
 *
 * @description
 * GET: Retrieves verified and earned shares for a user by content type
 * POST: Tracks a share action and awards points. Supports multiple platforms
 * (Twitter, Farcaster, Link, Telegram, Discord) and content types.
 *
 * @openapi
 * /api/users/{userId}/share:
 *   get:
 *     tags:
 *       - Users
 *     summary: Get verified shares
 *     description: Retrieves verified and earned shares for a user
 *     security:
 *       - PrivyAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *       - in: query
 *         name: contentType
 *         schema:
 *           type: string
 *         description: Filter by content type
 *     responses:
 *       200:
 *         description: Verified shares retrieved
 *   post:
 *     tags:
 *       - Users
 *     summary: Track share action
 *     description: Tracks share and awards points (authenticated user only)
 *     security:
 *       - PrivyAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - platform
 *               - contentType
 *             properties:
 *               platform:
 *                 type: string
 *                 enum: [twitter, farcaster, link, telegram, discord]
 *               contentType:
 *                 type: string
 *                 enum: [post, profile, market, referral, leaderboard]
 *               contentId:
 *                 type: string
 *                 description: ID of shared content
 *               url:
 *                 type: string
 *                 format: uri
 *                 description: Share URL
 *     responses:
 *       200:
 *         description: Share tracked successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not authorized for this user
 *
 * @example
 * ```typescript
 * // Check existing shares
 * await fetch(`/api/users/${userId}/share?contentType=profile`, {
 *   headers: { 'Authorization': `Bearer ${token}` }
 * });
 *
 * // Track new share
 * await fetch(`/api/users/${userId}/share`, {
 *   method: 'POST',
 *   headers: { 'Authorization': `Bearer ${token}` },
 *   body: JSON.stringify({
 *     platform: 'twitter',
 *     contentType: 'post',
 *     contentId: 'post-id'
 *   })
 * });
 * ```
 */

import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { and, db, desc, eq, shareActions } from '@/db';
import { authenticate, successResponse } from '@/lib/api/auth-middleware';
import { AuthorizationError } from '@/lib/errors';
import { withErrorHandling } from '@/lib/errors/error-handler';
import { logger } from '@/lib/logger';
import { generateSnowflakeId } from '@/lib/snowflake';
import { requireUserByIdentifier } from '@/lib/users/user-lookup';
import { UserIdParamSchema } from '@/lib/validation/schemas';

const ShareRequestSchema = z.object({
  platform: z.enum(['twitter', 'farcaster', 'link', 'telegram', 'discord']),
  contentType: z.enum(['post', 'profile', 'market', 'referral', 'leaderboard']),
  contentId: z.string().optional(), // Allow any string (user IDs can be Privy DIDs or Snowflake IDs)
  url: z.string().url().optional(),
});

/**
 * GET /api/users/[userId]/share
 * Get verified and earned shares for a user
 */
export const GET = withErrorHandling(
  async (
    request: NextRequest,
    context: { params: Promise<{ userId: string }> }
  ) => {
    // Authenticate user
    const authUser = await authenticate(request);
    const params = await context.params;
    const { userId } = UserIdParamSchema.parse(params);
    const targetUser = await requireUserByIdentifier(userId, { id: true });
    const canonicalUserId = targetUser.id;

    // Verify user is accessing their own shares
    if (authUser.userId !== canonicalUserId) {
      throw new AuthorizationError(
        'You can only access your own shares',
        'share-action',
        'read'
      );
    }

    // Get contentType filter from query params
    const { searchParams } = new URL(request.url);
    const contentType = searchParams.get('contentType');

    // Query for verified and earned shares
    const whereConditions = [
      eq(shareActions.userId, canonicalUserId),
      eq(shareActions.verified, true),
      eq(shareActions.pointsAwarded, true),
    ];

    if (contentType) {
      whereConditions.push(eq(shareActions.contentType, contentType));
    }

    const sharesData = await db
      .select({
        id: shareActions.id,
        platform: shareActions.platform,
        contentType: shareActions.contentType,
        contentId: shareActions.contentId,
        createdAt: shareActions.createdAt,
        verifiedAt: shareActions.verifiedAt,
      })
      .from(shareActions)
      .where(and(...whereConditions))
      .orderBy(desc(shareActions.verifiedAt));

    logger.info(
      `Retrieved ${sharesData.length} verified shares for user ${canonicalUserId}`,
      { userId: canonicalUserId, contentType, count: sharesData.length },
      'GET /api/users/[userId]/share'
    );

    return successResponse({
      shares: sharesData,
      count: sharesData.length,
    });
  }
);

/**
 * POST /api/users/[userId]/share
 * Track a share action and award points
 */
export const POST = withErrorHandling(
  async (
    request: NextRequest,
    context: { params: Promise<{ userId: string }> }
  ) => {
    // Authenticate user
    const authUser = await authenticate(request);
    const params = await context.params;
    const { userId } = UserIdParamSchema.parse(params);
    const targetUser = await requireUserByIdentifier(userId, { id: true });
    const canonicalUserId = targetUser.id;

    // Verify user is sharing their own content
    if (authUser.userId !== canonicalUserId) {
      throw new AuthorizationError(
        'You can only track your own shares',
        'share-action',
        'create'
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const { platform, contentType, contentId, url } =
      ShareRequestSchema.parse(body);

    // Create share action record (points will be awarded after verification)
    const shareActionId = await generateSnowflakeId();
    const [shareAction] = await db
      .insert(shareActions)
      .values({
        id: shareActionId,
        userId: canonicalUserId,
        platform,
        contentType,
        contentId,
        url,
        pointsAwarded: false,
        verified: false, // Must be verified before points are awarded
      })
      .returning();

    logger.info(
      `User ${canonicalUserId} initiated share for ${contentType} on ${platform} (pending verification)`,
      {
        userId: canonicalUserId,
        platform,
        contentType,
        contentId,
        shareId: shareAction?.id,
      },
      'POST /api/users/[userId]/share'
    );

    return successResponse({
      shareAction,
      points: {
        awarded: 0, // Points will be awarded after verification
        newTotal: 0,
        alreadyAwarded: false,
      },
      message: 'Share action created. Please verify your post to earn points.',
    });
  }
);
