/**
 * API Route: /api/users/[userId]/link-social
 * Methods: POST (link social account and award points)
 */

import {
  authenticate,
  successResponse
} from '@/lib/api/auth-middleware'
import { asUser } from '@/lib/db/context'
import { AuthorizationError, BusinessLogicError, NotFoundError } from '@/lib/errors'
import { withErrorHandling } from '@/lib/errors/error-handler'
import { logger } from '@/lib/logger'
import { PointsService } from '@/lib/services/points-service'
import { UserIdParamSchema } from '@/lib/validation/schemas'
import type { NextRequest } from 'next/server'
import { z } from 'zod'

// Link social schema (extending the one in schemas/game.ts)
const LinkSocialRequestSchema = z.object({
  platform: z.enum(['farcaster', 'twitter', 'wallet']),
  username: z.string().optional(),
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional()
});

/**
 * POST /api/users/[userId]/link-social
 * Link a social account and award points if first time
 */
export const POST = withErrorHandling(async (
  request: NextRequest,
  context?: { params: Promise<{ userId: string }> }
) => {
  // Authenticate user
  const authUser = await authenticate(request);
  const params = await (context?.params || Promise.reject(new BusinessLogicError('Missing route context', 'MISSING_CONTEXT')));
  const { userId } = UserIdParamSchema.parse(params);

  // Verify user is linking their own account
  if (authUser.userId !== userId) {
    throw new AuthorizationError('You can only link your own social accounts', 'social-account', 'link');
  }

  // Parse and validate request body
  const body = await request.json();
  const { platform, username, address } = LinkSocialRequestSchema.parse(body);

  // Link social account with RLS
  const { alreadyLinked, pointsResult } = await asUser(authUser, async (db) => {
    // Get current user state
    const usr = await db.user.findUnique({
      where: { id: userId },
      select: {
        hasFarcaster: true,
        hasTwitter: true,
        walletAddress: true,
      },
    });

    if (!usr) {
      throw new NotFoundError('User', userId);
    }

    // Check if already linked
    let linked = false;
    switch (platform) {
      case 'farcaster':
        linked = usr.hasFarcaster;
        break;
      case 'twitter':
        linked = usr.hasTwitter;
        break;
      case 'wallet':
        linked = !!usr.walletAddress;
        break;
    }

    // Update user with social connection
    const updateData: Record<string, string | boolean> = {};
    switch (platform) {
      case 'farcaster':
        updateData.hasFarcaster = true;
        if (username) updateData.farcasterUsername = username;
        break;
      case 'twitter':
        updateData.hasTwitter = true;
        if (username) updateData.twitterUsername = username;
        break;
      case 'wallet':
        if (address) updateData.walletAddress = address;
        break;
    }

    await db.user.update({
      where: { id: userId },
      data: updateData,
    });

    // Award points if not already linked
    let points = null;
    if (!linked) {
      switch (platform) {
        case 'farcaster':
          points = await PointsService.awardFarcasterLink(userId, username);
          break;
        case 'twitter':
          points = await PointsService.awardTwitterLink(userId, username);
          break;
        case 'wallet':
          points = await PointsService.awardWalletConnect(userId, address);
          break;
      }
    }

    return { alreadyLinked: linked, pointsResult: points };
  });

  logger.info(
    `User ${userId} linked ${platform} account`,
    { userId, platform, username, address, alreadyLinked },
    'POST /api/users/[userId]/link-social'
  );

  return successResponse({
    platform,
    linked: true,
    alreadyLinked,
    points: pointsResult ? {
      awarded: pointsResult.pointsAwarded,
      newTotal: pointsResult.newTotal,
    } : null,
  });
});

