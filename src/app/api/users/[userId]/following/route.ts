/**
 * API Route: /api/users/[userId]/following
 * Methods: GET (get following list)
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
 * GET /api/users/[userId]/following
 * Get list of users/actors that the target user is following
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

    // Get users being followed (Follow model)
    const userFollows = await prisma.follow.findMany({
      where: {
        followerId: targetId,
      },
      include: {
        following: {
          select: {
            id: true,
            displayName: true,
            username: true,
            profileImageUrl: true,
            bio: true,
            isActor: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Get actors being followed (FollowStatus model)
    const actorFollows = await prisma.followStatus.findMany({
      where: {
        userId: targetId,
        isActive: true,
      },
      orderBy: {
        followedAt: 'desc',
      },
    });

    // Fetch actor details from Actor table
    const actorIds = actorFollows.map((f) => f.npcId);
    const actors = await prisma.actor.findMany({
      where: {
        id: { in: actorIds },
      },
      select: {
        id: true,
        name: true,
        description: true,
        postStyle: true,
      },
    });

    const actorMap = new Map(actors.map((a) => [a.id, a]));

    const following = [
      ...userFollows.map((f) => ({
        id: f.following.id,
        displayName: f.following.displayName,
        username: f.following.username,
        profileImageUrl: f.following.profileImageUrl,
        bio: f.following.bio,
        isActor: f.following.isActor,
        followedAt: f.createdAt.toISOString(),
        type: 'user' as const,
      })),
      ...actorFollows.map((f) => {
        const actor = actorMap.get(f.npcId);
        return {
          id: f.npcId,
          displayName: actor?.name || f.npcId,
          username: null,
          profileImageUrl: null,
          bio: actor?.description || null,
          isActor: true,
          followedAt: f.followedAt.toISOString(),
          type: 'actor' as const,
        };
      }),
    ].sort((a, b) => new Date(b.followedAt).getTime() - new Date(a.followedAt).getTime());

    return successResponse({
      following,
      count: following.length,
    });
  } catch (error) {
    console.error('Error fetching following:', error);
    return errorResponse('Failed to fetch following', 500);
  }
}

