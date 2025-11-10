/**
 * API Route: /api/users/[userId]/link-social
 * Methods: POST (link social account and award points)
 */

import {
  authenticate,
  successResponse
} from '@/lib/api/auth-middleware'
import { prisma } from '@/lib/database-service'
import { AuthorizationError, BusinessLogicError, ConflictError, NotFoundError } from '@/lib/errors'
import { withErrorHandling } from '@/lib/errors/error-handler'
import { logger } from '@/lib/logger'
import { PointsService } from '@/lib/services/points-service'
import { UserIdParamSchema } from '@/lib/validation/schemas'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireUserByIdentifier } from '@/lib/users/user-lookup'

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
  context: { params: Promise<{ userId: string }> }
) => {
  // Authenticate user
  const authUser = await authenticate(request);
  const params = await context.params);
  const { userId } = UserIdParamSchema.parse(params);
  const targetUser = await requireUserByIdentifier(userId, { id: true });
  const canonicalUserId = targetUser.id;

  // Verify user is linking their own account
  if (authUser.userId !== canonicalUserId) {
    throw new AuthorizationError('You can only link your own social accounts', 'social-account', 'link');
  }

  // Parse and validate request body
  const body = await request.json();
  const { platform, username, address } = LinkSocialRequestSchema.parse(body);

  // Get current user state
  const user = await prisma.user.findUnique({
    where: { id: canonicalUserId },
    select: {
      hasFarcaster: true,
      hasTwitter: true,
      walletAddress: true,
    },
  });

  if (!user) {
    throw new NotFoundError('User', canonicalUserId);
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

  // Check if wallet address is already in use by another user
  if (platform === 'wallet' && address) {
    const existingWalletUser = await prisma.user.findUnique({
      where: { walletAddress: address.toLowerCase() },
      select: { id: true },
    });

    if (existingWalletUser && existingWalletUser.id !== canonicalUserId) {
      throw new ConflictError('Wallet address already linked to another account', 'User.walletAddress');
    }
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
      if (address) updateData.walletAddress = address.toLowerCase();
      break;
  }

  await prisma.user.update({
    where: { id: canonicalUserId },
    data: updateData,
  });

  // Award points if not already linked
  let pointsResult;
  if (!alreadyLinked) {
    switch (platform) {
      case 'farcaster':
        pointsResult = await PointsService.awardFarcasterLink(canonicalUserId, username);
        break;
      case 'twitter':
        pointsResult = await PointsService.awardTwitterLink(canonicalUserId, username);
        break;
      case 'wallet':
        pointsResult = await PointsService.awardWalletConnect(canonicalUserId, address);
        break;
    }
  }

  logger.info(
    `User ${canonicalUserId} linked ${platform} account`,
    { userId: canonicalUserId, platform, username, address, alreadyLinked },
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
