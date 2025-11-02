/**
 * API Route: /api/users/by-username/[username]
 * Methods: GET (get user by username)
 */

import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/database-service';
import {
  optionalAuth,
  successResponse,
  errorResponse,
} from '@/lib/api/auth-middleware';
import { logger } from '@/lib/logger';

/**
 * GET /api/users/by-username/[username]
 * Get user profile by username
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  let username: string | undefined;
  try {
    username = (await params).username;

    if (!username) {
      return errorResponse('Username is required', 400);
    }

    // Optional authentication
    await optionalAuth(request);

    // Get user profile by username
    const dbUser = await prisma.user.findUnique({
      where: { username },
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

    if (!dbUser) {
      return errorResponse('User not found', 404);
    }

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
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    const errorDetails = {
      message: errorMessage,
      stack: errorStack,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
      } : error,
      username: username || 'unknown',
    };
    logger.error('Error fetching profile by username:', errorDetails, 'GET /api/users/by-username/[username]');
    return errorResponse('Failed to fetch profile', 500);
  }
}

