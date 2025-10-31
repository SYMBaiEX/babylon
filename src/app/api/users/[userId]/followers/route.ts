/**
 * API Route: /api/users/[userId]/followers
 * Methods: GET (get followers list)
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
 * GET /api/users/[userId]/followers
 * Get list of users following the target user
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
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

    const followers = follows.map((f) => ({
      id: f.follower.id,
      displayName: f.follower.displayName,
      username: f.follower.username,
      profileImageUrl: f.follower.profileImageUrl,
      bio: f.follower.bio,
      followedAt: f.createdAt.toISOString(),
    }));

    return successResponse({
      followers,
      count: followers.length,
    });
  } catch (error) {
    console.error('Error fetching followers:', error);
    return errorResponse('Failed to fetch followers', 500);
  }
}

