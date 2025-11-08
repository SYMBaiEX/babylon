/**
 * API Route: /api/users/[userId]/profile
 * Methods: GET (get user profile)
 */

import type { NextRequest } from 'next/server';
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler';
import { BusinessLogicError } from '@/lib/errors';
import { UserIdParamSchema } from '@/lib/validation/schemas';
import { optionalAuth } from '@/lib/api/auth-middleware';
import { asUser, asPublic } from '@/lib/db/context';
import { logger } from '@/lib/logger';
import type { PrismaClient } from '@prisma/client';

/**
 * GET /api/users/[userId]/profile
 * Get user profile information
 */
export const GET = withErrorHandling(async (
  request: NextRequest,
  context?: { params: Promise<{ userId: string }> }
) => {
  const params = await (context?.params || Promise.reject(new BusinessLogicError('Missing route context', 'MISSING_CONTEXT')));
  const { userId } = UserIdParamSchema.parse(params);

  // Optional authentication
  const authUser = await optionalAuth(request);

  // Get user profile with RLS - create minimal record if doesn't exist (for new Privy users)
  // Use asUser if authenticated, asPublic if not (for viewing public profiles)
  const dbOperation = async (db: PrismaClient) => {
    let user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      walletAddress: true,
      username: true,
      displayName: true,
      bio: true,
      profileImageUrl: true,
      coverImageUrl: true,
      isActor: true,
      profileComplete: true,
      hasUsername: true,
      hasBio: true,
      hasProfileImage: true,
      onChainRegistered: true,
      nftTokenId: true,
      virtualBalance: true,
      lifetimePnL: true,
      reputationPoints: true,
      referralCount: true,
      referralCode: true,
      hasFarcaster: true,
      hasTwitter: true,
      farcasterUsername: true,
      twitterUsername: true,
      usernameChangedAt: true,
      createdAt: true,
      _count: {
        select: {
          positions: true,
          comments: true,
          reactions: true,
          followedBy: true,
          following: true,
        },
      },
    },
  });

    // If user doesn't exist, create a minimal record (will be completed during onboarding)
    if (!user) {
      logger.info('Creating minimal user record for new user', { userId }, 'GET /api/users/[userId]/profile');
      
      user = await db.user.create({
        data: {
          id: userId, // id is the Privy DID
          walletAddress: null,
          username: null,
          displayName: null,
          bio: null,
          isActor: false,
          virtualBalance: 0,
          totalDeposited: 0,
          lifetimePnL: 0,
          reputationPoints: 0,
          referralCount: 0,
          profileComplete: false,
          hasUsername: false,
          hasBio: false,
          hasProfileImage: false,
          onChainRegistered: false,
        },
        select: {
          id: true,
          walletAddress: true,
          username: true,
          displayName: true,
          bio: true,
          profileImageUrl: true,
          coverImageUrl: true,
          isActor: true,
          profileComplete: true,
          hasUsername: true,
          hasBio: true,
          hasProfileImage: true,
          onChainRegistered: true,
          nftTokenId: true,
          virtualBalance: true,
          lifetimePnL: true,
          reputationPoints: true,
          referralCount: true,
          referralCode: true,
          hasFarcaster: true,
          hasTwitter: true,
          farcasterUsername: true,
          twitterUsername: true,
          usernameChangedAt: true,
          createdAt: true,
          _count: {
            select: {
              positions: true,
              comments: true,
              reactions: true,
              followedBy: true,
              following: true,
            },
          },
        },
      });
    }

    return user;
  };

  // Execute with appropriate context based on authentication
  const dbUser = authUser 
    ? await asUser(authUser, dbOperation)
    : await asPublic(dbOperation);

  logger.info('User profile fetched successfully', { userId }, 'GET /api/users/[userId]/profile');

  return successResponse({
    user: {
      id: dbUser.id,
      walletAddress: dbUser.walletAddress,
      username: dbUser.username,
      displayName: dbUser.displayName,
      bio: dbUser.bio,
      profileImageUrl: dbUser.profileImageUrl,
      coverImageUrl: dbUser.coverImageUrl,
      isActor: dbUser.isActor,
      profileComplete: dbUser.profileComplete,
      hasUsername: dbUser.hasUsername,
      hasBio: dbUser.hasBio,
      hasProfileImage: dbUser.hasProfileImage,
      onChainRegistered: dbUser.onChainRegistered,
      nftTokenId: dbUser.nftTokenId,
      // Include registration status for quick frontend checks
      isRegistered: dbUser.onChainRegistered && dbUser.nftTokenId !== null,
      needsOnboarding: !dbUser.onChainRegistered || !dbUser.profileComplete,
      virtualBalance: Number(dbUser.virtualBalance),
      lifetimePnL: Number(dbUser.lifetimePnL),
      reputationPoints: dbUser.reputationPoints,
      referralCount: dbUser.referralCount,
      referralCode: dbUser.referralCode,
      hasFarcaster: dbUser.hasFarcaster,
      hasTwitter: dbUser.hasTwitter,
      farcasterUsername: dbUser.farcasterUsername,
      twitterUsername: dbUser.twitterUsername,
      usernameChangedAt: dbUser.usernameChangedAt?.toISOString() || null,
      createdAt: dbUser.createdAt.toISOString(),
      stats: {
        positions: dbUser._count.positions,
        comments: dbUser._count.comments,
        reactions: dbUser._count.reactions,
        followers: dbUser._count.followedBy,
        following: dbUser._count.following,
      },
    },
  });
});

