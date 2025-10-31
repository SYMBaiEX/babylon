/**
 * API Route: /api/users/[userId]/profile
 * Methods: GET (get user profile)
 */

import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import {
  authenticate,
  optionalAuth,
  successResponse,
  errorResponse,
} from '@/lib/api/auth-middleware';

const prisma = new PrismaClient();

/**
 * GET /api/users/[userId]/profile
 * Get user profile information
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;

    if (!userId) {
      return errorResponse('User ID is required', 400);
    }

    // Optional authentication
    await optionalAuth(request);

    // Get user profile
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        walletAddress: true,
        username: true,
        displayName: true,
        bio: true,
        profileImageUrl: true,
        isActor: true,
        profileComplete: true,
        hasUsername: true,
        hasBio: true,
        hasProfileImage: true,
        onChainRegistered: true,
        nftTokenId: true,
        virtualBalance: true,
        lifetimePnL: true,
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
        isActor: dbUser.isActor,
        profileComplete: dbUser.profileComplete,
        hasUsername: dbUser.hasUsername,
        hasBio: dbUser.hasBio,
        hasProfileImage: dbUser.hasProfileImage,
        onChainRegistered: dbUser.onChainRegistered,
        nftTokenId: dbUser.nftTokenId,
        virtualBalance: Number(dbUser.virtualBalance),
        lifetimePnL: Number(dbUser.lifetimePnL),
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
    console.error('Error fetching profile:', error);
    return errorResponse('Failed to fetch profile', 500);
  }
}

