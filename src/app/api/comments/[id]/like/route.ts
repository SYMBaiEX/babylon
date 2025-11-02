/**
 * API Route: /api/comments/[id]/like
 * Methods: POST (like), DELETE (unlike)
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
 * POST /api/comments/[id]/like
 * Like a comment
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate user
    const user = await authenticate(request);
    const { id: commentId } = await params;

    // Validate comment ID
    if (!commentId) {
      return errorResponse('Comment ID is required', 400);
    }

    // Ensure user exists in database (upsert pattern)
    await prisma.user.upsert({
      where: { id: user.userId },
      update: {
        walletAddress: user.walletAddress,
      },
      create: {
        id: user.userId,
        walletAddress: user.walletAddress,
        displayName: user.walletAddress ? `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}` : 'Anonymous',
        isActor: false,
      },
    });

    // Check if comment exists
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
    });

    if (!comment) {
      return errorResponse('Comment not found', 404);
    }

    // Check if already liked
    const existingReaction = await prisma.reaction.findUnique({
      where: {
        commentId_userId_type: {
          commentId,
          userId: user.userId,
          type: 'like',
        },
      },
    });

    if (existingReaction) {
      return errorResponse('Comment already liked', 400);
    }

    // Create like reaction
    const reaction = await prisma.reaction.create({
      data: {
        commentId,
        userId: user.userId,
        type: 'like',
      },
    });

    // Get updated like count
    const likeCount = await prisma.reaction.count({
      where: {
        commentId,
        type: 'like',
      },
    });

    return successResponse(
      {
        id: reaction.id,
        commentId,
        likeCount,
        isLiked: true,
        createdAt: reaction.createdAt,
      },
      201
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication failed') {
      return authErrorResponse('Unauthorized');
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Error liking comment:', { error: errorMessage }, 'POST /api/comments/[id]/like');
    return errorResponse('Failed to like comment');
  }
}

/**
 * DELETE /api/comments/[id]/like
 * Unlike a comment
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate user
    const user = await authenticate(request);
    const { id: commentId } = await params;

    // Validate comment ID
    if (!commentId) {
      return errorResponse('Comment ID is required', 400);
    }

    // Ensure user exists in database (upsert pattern)
    await prisma.user.upsert({
      where: { id: user.userId },
      update: {
        walletAddress: user.walletAddress,
      },
      create: {
        id: user.userId,
        walletAddress: user.walletAddress,
        displayName: user.walletAddress ? `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}` : 'Anonymous',
        isActor: false,
      },
    });

    // Find existing like
    const reaction = await prisma.reaction.findUnique({
      where: {
        commentId_userId_type: {
          commentId,
          userId: user.userId,
          type: 'like',
        },
      },
    });

    if (!reaction) {
      return errorResponse('Like not found', 404);
    }

    // Delete like
    await prisma.reaction.delete({
      where: {
        id: reaction.id,
      },
    });

    // Get updated like count
    const likeCount = await prisma.reaction.count({
      where: {
        commentId,
        type: 'like',
      },
    });

    return successResponse({
      commentId,
      likeCount,
      isLiked: false,
      message: 'Comment unliked successfully',
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication failed') {
      return authErrorResponse('Unauthorized');
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Error unliking comment:', { error: errorMessage }, 'DELETE /api/comments/[id]/like');
    return errorResponse('Failed to unlike comment');
  }
}
