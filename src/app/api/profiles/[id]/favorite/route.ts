/**
 * API Route: /api/profiles/[id]/favorite
 * Methods: POST (favorite), DELETE (unfavorite)
 */

import type { NextRequest } from 'next/server';
import {
  authenticate,
  authErrorResponse,
  successResponse,
  errorResponse,
} from '@/lib/api/auth-middleware';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';


/**
 * POST /api/profiles/[id]/favorite
 * Favorite a profile
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate user
    const user = await authenticate(request);
    const { id: targetIdentifier } = await params;

    // Validate target identifier
    if (!targetIdentifier) {
      return errorResponse('Profile ID is required', 400);
    }

    // Try to find user by ID first, then by username
    let targetUser = await prisma.user.findUnique({
      where: { id: targetIdentifier },
    });

    // If not found by ID, try username
    if (!targetUser) {
      targetUser = await prisma.user.findUnique({
        where: { username: targetIdentifier },
      });
    }

    if (!targetUser) {
      return errorResponse('Profile not found', 404);
    }

    const targetUserId = targetUser.id;

    // Prevent self-favoriting
    if (user.userId === targetUserId) {
      return errorResponse('Cannot favorite yourself', 400);
    }

    // Check if already favorited
    const existingFavorite = await prisma.favorite.findUnique({
      where: {
        userId_targetUserId: {
          userId: user.userId,
          targetUserId,
        },
      },
    });

    if (existingFavorite) {
      return errorResponse('Profile already favorited', 400);
    }

    // Create favorite
    const favorite = await prisma.favorite.create({
      data: {
        userId: user.userId,
        targetUserId,
      },
      include: {
        targetUser: {
          select: {
            id: true,
            displayName: true,
            username: true,
            profileImageUrl: true,
            bio: true,
          },
        },
      },
    });

    return successResponse(
      {
        id: favorite.id,
        targetUser: favorite.targetUser,
        createdAt: favorite.createdAt,
      },
      201
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication failed') {
      return authErrorResponse('Unauthorized');
    }
    logger.error('Error favoriting profile:', error, 'POST /api/profiles/[id]/favorite');
    return errorResponse('Failed to favorite profile');
  }
}

/**
 * DELETE /api/profiles/[id]/favorite
 * Unfavorite a profile
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate user
    const user = await authenticate(request);
    const { id: targetIdentifier } = await params;

    // Validate target identifier
    if (!targetIdentifier) {
      return errorResponse('Profile ID is required', 400);
    }

    // Try to find user by ID first, then by username
    let targetUser = await prisma.user.findUnique({
      where: { id: targetIdentifier },
    });

    // If not found by ID, try username
    if (!targetUser) {
      targetUser = await prisma.user.findUnique({
        where: { username: targetIdentifier },
      });
    }

    if (!targetUser) {
      return errorResponse('Profile not found', 404);
    }

    const targetUserId = targetUser.id;

    // Find existing favorite
    const favorite = await prisma.favorite.findUnique({
      where: {
        userId_targetUserId: {
          userId: user.userId,
          targetUserId,
        },
      },
    });

    if (!favorite) {
      return errorResponse('Favorite not found', 404);
    }

    // Delete favorite
    await prisma.favorite.delete({
      where: {
        id: favorite.id,
      },
    });

    return successResponse({ message: 'Profile unfavorited successfully' });
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication failed') {
      return authErrorResponse('Unauthorized');
    }
    logger.error('Error unfavoriting profile:', error, 'DELETE /api/profiles/[id]/favorite');
    return errorResponse('Failed to unfavorite profile');
  }
}
