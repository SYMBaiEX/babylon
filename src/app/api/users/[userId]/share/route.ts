/**
 * API Route: /api/users/[userId]/share
 * Methods: POST (track share action and award points)
 */

import {
  authenticate,
  successResponse
} from '@/lib/api/auth-middleware'
import { asUser } from '@/lib/db/context'
import { AuthorizationError, BusinessLogicError } from '@/lib/errors'
import { withErrorHandling } from '@/lib/errors/error-handler'
import { logger } from '@/lib/logger'
import { PointsService } from '@/lib/services/points-service'
import { UserIdParamSchema, UUIDSchema } from '@/lib/validation/schemas'
import type { NextRequest } from 'next/server'
import { z } from 'zod'

const ShareRequestSchema = z.object({
  platform: z.enum(['twitter', 'farcaster', 'link', 'telegram', 'discord']),
  contentType: z.enum(['post', 'profile', 'market', 'referral', 'leaderboard']),
  contentId: UUIDSchema.optional(),
  url: z.string().url().optional()
});

/**
 * POST /api/users/[userId]/share
 * Track a share action and award points
 */
export const POST = withErrorHandling(async (
  request: NextRequest,
  context?: { params: Promise<{ userId: string }> }
) => {
  // Authenticate user
  const authUser = await authenticate(request);
  const params = await (context?.params || Promise.reject(new BusinessLogicError('Missing route context', 'MISSING_CONTEXT')));
  const { userId } = UserIdParamSchema.parse(params);

  // Verify user is sharing their own content
  if (authUser.userId !== userId) {
    throw new AuthorizationError('You can only track your own shares', 'share-action', 'create');
  }

  // Parse and validate request body
  const body = await request.json();
  const { platform, contentType, contentId, url } = ShareRequestSchema.parse(body);

  // Create share action with RLS
  const { shareAction, pointsResult } = await asUser(authUser, async (db) => {
    // Create share action record
    const action = await db.shareAction.create({
      data: {
        userId,
        platform,
        contentType,
        contentId,
        url,
        pointsAwarded: false,
      },
    });

    // Award points for the share
    const points = await PointsService.awardShareAction(
      userId,
      platform,
      contentType,
      contentId
    );

    // Update share action to mark points as awarded
    if (points.success && points.pointsAwarded > 0) {
      await db.shareAction.update({
        where: { id: action.id },
        data: { pointsAwarded: true },
      });
    }

    return { shareAction: action, pointsResult: points };
  });

  logger.info(
    `User ${userId} shared ${contentType} on ${platform}`,
    { userId, platform, contentType, contentId, pointsAwarded: pointsResult.pointsAwarded },
    'POST /api/users/[userId]/share'
  );

  return successResponse({
    shareAction,
    points: {
      awarded: pointsResult.pointsAwarded,
      newTotal: pointsResult.newTotal,
      alreadyAwarded: pointsResult.alreadyAwarded,
    },
  });
});

