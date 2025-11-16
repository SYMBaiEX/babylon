/**
 * User Share API
 * 
 * @route POST /api/users/[userId]/share - Track share action
 * @access Authenticated
 * 
 * @description
 * Tracks a share action and awards points. Supports multiple platforms
 * (Twitter, Farcaster, Link, Telegram, Discord) and content types.
 * 
 * @openapi
 * /api/users/{userId}/share:
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

import {
  authenticate,
  successResponse
} from '@/lib/api/auth-middleware'
import { prisma } from '@/lib/prisma'
import { AuthorizationError } from '@/lib/errors'
import { withErrorHandling } from '@/lib/errors/error-handler'
import { logger } from '@/lib/logger'
import { UserIdParamSchema, SnowflakeIdSchema } from '@/lib/validation/schemas'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireUserByIdentifier } from '@/lib/users/user-lookup'
import { generateSnowflakeId } from '@/lib/snowflake'

const ShareRequestSchema = z.object({
  platform: z.enum(['twitter', 'farcaster', 'link', 'telegram', 'discord']),
  contentType: z.enum(['post', 'profile', 'market', 'referral', 'leaderboard']),
  contentId: SnowflakeIdSchema.optional(),
  url: z.string().url().optional()
});

/**
 * POST /api/users/[userId]/share
 * Track a share action and award points
 */
export const POST = withErrorHandling(async (
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
    throw new AuthorizationError('You can only track your own shares', 'share-action', 'create');
  }

  // Parse and validate request body
  const body = await request.json();
  const { platform, contentType, contentId, url } = ShareRequestSchema.parse(body);

  // Create share action record (points will be awarded after verification)
  const shareAction = await prisma.shareAction.create({
    data: {
      id: await generateSnowflakeId(),
      userId: canonicalUserId,
      platform,
      contentType,
      contentId,
      url,
      pointsAwarded: false,
      verified: false, // Must be verified before points are awarded
    },
  });

  logger.info(
    `User ${canonicalUserId} initiated share for ${contentType} on ${platform} (pending verification)`,
    { userId: canonicalUserId, platform, contentType, contentId, shareId: shareAction.id },
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
});
