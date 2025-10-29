/**
 * API Route: /api/users/[userId]/profile
 * Methods: GET (get user's profile)
 */

import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import {
  optionalAuth,
  successResponse,
  errorResponse,
} from '@/lib/api/auth-middleware';

const prisma = new PrismaClient();

/**
 * GET /api/users/[userId]/profile
 * Get user's profile information
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;

    // Try to get user from database
    let user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        bio: true,
        profileImageUrl: true,
        walletAddress: true,
        profileComplete: true,
        hasProfileImage: true,
        hasUsername: true,
        hasBio: true,
        isActor: true,
        createdAt: true,
      },
    });

    // If user doesn't exist in database yet, create them
    if (!user) {
      user = await prisma.user.create({
        data: {
          id: userId,
          isActor: false,
        },
        select: {
          id: true,
          username: true,
          displayName: true,
          bio: true,
          profileImageUrl: true,
          walletAddress: true,
          profileComplete: true,
          hasProfileImage: true,
          hasUsername: true,
          hasBio: true,
          isActor: true,
          createdAt: true,
        },
      });
    }

    return successResponse({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        bio: user.bio,
        profileImageUrl: user.profileImageUrl,
        walletAddress: user.walletAddress,
        profileComplete: user.profileComplete,
        hasProfileImage: user.hasProfileImage,
        hasUsername: user.hasUsername,
        hasBio: user.hasBio,
        isActor: user.isActor,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    return errorResponse('Failed to fetch profile');
  }
}
