/**
 * API Route: /api/profiles/favorites
 * Methods: GET (get user's favorited profiles)
 */

import type { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import {
  authenticate,
  authErrorResponse,
  successResponse,
  errorResponse,
} from '@/lib/api/auth-middleware';
import { logger } from '@/lib/logger';

const prisma = new PrismaClient();

/**
 * GET /api/profiles/favorites
 * Get list of profiles the authenticated user has favorited
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const user = await authenticate(request);

    // Get favorited profiles
    const favorites = await prisma.favorite.findMany({
      where: {
        userId: user.userId,
      },
      include: {
        targetUser: {
          select: {
            id: true,
            displayName: true,
            username: true,
            profileImageUrl: true,
            bio: true,
            isActor: true,
            _count: {
              select: {
                favoritedBy: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Get post counts for each profile (posts are authored by actor IDs)
    const favoritedProfiles = await Promise.all(
      favorites.map(async (favorite) => {
        const postCount = await prisma.post.count({
          where: {
            authorId: favorite.targetUser.id,
          },
        });

        return {
          id: favorite.targetUser.id,
          displayName: favorite.targetUser.displayName,
          username: favorite.targetUser.username,
          profileImageUrl: favorite.targetUser.profileImageUrl,
          bio: favorite.targetUser.bio,
          isActor: favorite.targetUser.isActor,
          postCount,
          favoriteCount: favorite.targetUser._count.favoritedBy,
          favoritedAt: favorite.createdAt,
          isFavorited: true,
        };
      })
    );

    return successResponse({
      profiles: favoritedProfiles,
      total: favoritedProfiles.length,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication failed') {
      return authErrorResponse('Unauthorized');
    }
    logger.error('Error fetching favorited profiles:', error, 'GET /api/profiles/favorites');
    return errorResponse('Failed to fetch favorited profiles');
  }
}
