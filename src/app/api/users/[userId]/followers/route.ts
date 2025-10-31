/**
 * API Route: /api/users/[userId]/followers
 * Methods: GET (get followers list)
 */

import type { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import {
  optionalAuth,
  successResponse,
  errorResponse,
} from '@/lib/api/auth-middleware';
import { logger } from '@/lib/logger';

const prisma = new PrismaClient();

/**
 * GET /api/users/[userId]/followers
 * Get list of users following the target user
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    // Optional authentication - if authenticated, can provide personalized data
    const authUser = await optionalAuth(request);
    const { userId: targetId } = await params;

    if (!targetId) {
      return errorResponse('User ID is required', 400);
    }

    // Check if target is a user
    const targetUser = await prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true },
    });

    if (!targetUser) {
      return errorResponse('User not found', 404);
    }

    // Get followers (users who follow this user)
    const follows = await prisma.follow.findMany({
      where: {
        followingId: targetId,
      },
      include: {
        follower: {
          select: {
            id: true,
            displayName: true,
            username: true,
            profileImageUrl: true,
            bio: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const followers = follows.map((f) => {
      const followerData = {
        id: f.follower.id,
        displayName: f.follower.displayName,
        username: f.follower.username,
        profileImageUrl: f.follower.profileImageUrl,
        bio: f.follower.bio,
        followedAt: f.createdAt.toISOString(),
      };

      // If authenticated, check if current user follows this follower
      if (authUser) {
        // This could be extended to show mutual follows, etc.
        return followerData;
      }

      return followerData;
    });

    return successResponse({
      followers,
      count: followers.length,
    });
  } catch (error) {
    logger.error('Error fetching followers:', error, 'GET /api/users/[userId]/followers');
    return errorResponse('Failed to fetch followers', 500);
  }
}

