/**
 * API Route: /api/posts/[id]/like
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
import { notifyReactionOnPost } from '@/lib/services/notification-service';
import { logger } from '@/lib/logger';
import { parsePostId } from '@/lib/post-id-parser';

const prisma = new PrismaClient();

/**
 * POST /api/posts/[id]/like
 * Like a post
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate user
    const user = await authenticate(request);
    const { id: postId } = await params;

    // Validate post ID
    if (!postId) {
      return errorResponse('Post ID is required', 400);
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

    // Check if post exists first
    let post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, authorId: true },
    });

    // If post doesn't exist, try to auto-create it based on format
    if (!post) {
      // Parse post ID to extract metadata
      const parseResult = parsePostId(postId);
      const { gameId, authorId, timestamp } = parseResult.metadata;
      
      // Log warning if parsing failed (unknown format)
      if (!parseResult.success) {
        logger.warn('Unknown post ID format for like:', { postId }, 'POST /api/posts/[id]/like');
      }

      // Create minimal post record to allow reactions
      try {
        post = await prisma.post.create({
          data: {
            id: postId,
            content: '[Game-generated post]',  // Placeholder content
            authorId,
            gameId,
            timestamp,
          },
        });
      } catch (error) {
        // If creation fails (e.g., duplicate, validation error), try to fetch again
        logger.error('Error creating post for like:', error, 'POST /api/posts/[id]/like');

        // Check if it's a unique constraint violation (duplicate post)
        const prismaError = error as { code?: string; message?: string };
        if (prismaError?.code === 'P2002') {
          // Post already exists, fetch it
          post = await prisma.post.findUnique({
            where: { id: postId },
            select: { id: true, authorId: true },
          });
        }

        if (!post) {
          logger.error('Failed to create or find post:', { postId, error }, 'POST /api/posts/[id]/like');
          return errorResponse('Post not found and could not be created', 400);
        }
      }
    }

    // Check if already liked
    const existingReaction = await prisma.reaction.findUnique({
      where: {
        postId_userId_type: {
          postId,
          userId: user.userId,
          type: 'like',
        },
      },
    });

    if (existingReaction) {
      return errorResponse('Post already liked', 400);
    }

    // Create like reaction
    await prisma.reaction.create({
      data: {
        postId,
        userId: user.userId,
        type: 'like',
      },
    });

    // Create notification for post author (if not self-like)
    if (post.authorId && post.authorId !== user.userId && post.authorId !== 'unknown') {
      await notifyReactionOnPost(
        post.authorId,
        user.userId,
        postId,
        'like'
      );
    }

    // Get updated like count
    const likeCount = await prisma.reaction.count({
      where: {
        postId,
        type: 'like',
      },
    });

    return successResponse({
      data: {
        likeCount,
        isLiked: true,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication failed') {
      return authErrorResponse('Unauthorized');
    }
    logger.error('Error liking post:', error, 'POST /api/posts/[id]/like');
    return errorResponse('Failed to like post');
  }
}

/**
 * DELETE /api/posts/[id]/like
 * Unlike a post
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate user
    const user = await authenticate(request);
    const { id: postId } = await params;

    // Validate post ID
    if (!postId) {
      return errorResponse('Post ID is required', 400);
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
        postId_userId_type: {
          postId,
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
        postId,
        type: 'like',
      },
    });

    return successResponse({
      data: {
        likeCount,
        isLiked: false,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication failed') {
      return authErrorResponse('Unauthorized');
    }
    logger.error('Error unliking post:', error, 'DELETE /api/posts/[id]/like');
    return errorResponse('Failed to unlike post');
  }
}
