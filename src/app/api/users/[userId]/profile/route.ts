/**
 * API Route: /api/users/[userId]/profile
 * Methods: GET (get user profile)
 */

import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/database-service';
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler';
import { UserIdParamSchema } from '@/lib/validation/schemas';
import { optionalAuth } from '@/lib/api/auth-middleware';
import { logger } from '@/lib/logger';
import { requireUserByIdentifier } from '@/lib/users/user-lookup';

/**
 * GET /api/users/[userId]/profile
 * Get user profile information
 */
export const GET = withErrorHandling(async (
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) => {
  const params = await context.params;
  const { userId } = UserIdParamSchema.parse(params);

  // Optional authentication
  await optionalAuth(request);

  // Get user profile
  const dbUser = await requireUserByIdentifier(userId, {
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
        userActorFollows: true, // Count of actors this user follows
      },
    },
  });

  // Calculate total following count (users + actors)
  const totalFollowing = dbUser._count.following + dbUser._count.userActorFollows;

  // Get post count for user
  const postCount = await prisma.post.count({
    where: { authorId: dbUser.id },
  });

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
        following: totalFollowing, // Include both user and actor follows
        posts: postCount,
      },
    },
  });
});
