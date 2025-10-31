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

    // Check if post exists, if not try to find it or create a minimal record
    let post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, authorId: true },
    });

    // If post doesn't exist, try to extract info from ID or create minimal record
    if (!post) {
      // Try to parse different post ID formats
      // Format 1: game-{gameId}-{timestamp}
      // Format 2: post-{timestamp}-{random}
      // Format 3: Simple UUID or database ID
      
      let authorId: string | undefined;
      let gameId: string | undefined;
      let timestamp: Date | undefined;

      // Try to extract from game-{gameId}-{timestamp} format
      if (postId.startsWith('game-')) {
        const parts = postId.split('-');
        if (parts.length >= 3) {
          gameId = parts[1];
          // Try to parse timestamp (could be ISO string or numeric)
          const timestampPart = parts.slice(2).join('-');
          timestamp = new Date(timestampPart);
          if (isNaN(timestamp.getTime())) {
            // Try numeric timestamp
            const numericTimestamp = parseInt(timestampPart);
            if (!isNaN(numericTimestamp)) {
              timestamp = new Date(numericTimestamp);
            }
          }
        }
      }

      // Try to extract from post-{timestamp}-{random} format
      if (postId.startsWith('post-')) {
        const parts = postId.split('-');
        if (parts.length >= 2) {
          const timestampPart = parts[1];
          if (timestampPart) {
            const parsedTimestamp = parseInt(timestampPart, 10);
            if (!isNaN(parsedTimestamp) && parsedTimestamp > 0) {
              timestamp = new Date(parsedTimestamp);
            }
          }
        }
      }

      // If we couldn't determine authorId, use a placeholder
      // The post will be created but may need to be updated later
      const finalAuthorId = authorId || 'unknown';

      // Create minimal post record to allow reactions
      try {
        post = await prisma.post.create({
          data: {
            id: postId,
            content: '[Auto-created for interaction]',
            authorId: finalAuthorId,
            gameId: gameId || 'continuous',
            timestamp: timestamp || new Date(),
          },
        });
      } catch (error: unknown) {
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
          return errorResponse(`Post not found and could not be created: ${prismaError?.message || 'Unknown error'}`, 400);
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
