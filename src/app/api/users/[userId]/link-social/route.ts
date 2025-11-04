/**
 * API Route: /api/users/[userId]/link-social
 * Methods: POST (link social account and award points)
 */

import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/database-service';
import { authenticate } from '@/lib/api/auth-middleware';
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler';
import { BusinessLogicError, NotFoundError, AuthorizationError } from '@/lib/errors';
import { UserIdParamSchema } from '@/lib/validation/schemas';
import { PointsService } from '@/lib/services/points-service';
import { logger } from '@/lib/logger';

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

  // Get current user state
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      hasFarcaster: true,
      hasTwitter: true,
      walletAddress: true,
    },
  });

  if (!user) {
    throw new NotFoundError('User', userId);
  }

  // Check if already linked
  let alreadyLinked = false;
  switch (platform) {
    case 'farcaster':
      alreadyLinked = user.hasFarcaster;
      break;
    case 'twitter':
      alreadyLinked = user.hasTwitter;
      break;
    case 'wallet':
      alreadyLinked = !!user.walletAddress;
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

  await prisma.user.update({
    where: { id: userId },
    data: updateData,
  });

  // Award points if not already linked
  let pointsResult;
  if (!alreadyLinked) {
    switch (platform) {
      case 'farcaster':
        pointsResult = await PointsService.awardFarcasterLink(userId, username);
        break;
      case 'twitter':
        pointsResult = await PointsService.awardTwitterLink(userId, username);
        break;
      case 'wallet':
        pointsResult = await PointsService.awardWalletConnect(userId, address);
        break;
    }
  }

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

