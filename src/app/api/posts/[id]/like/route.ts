/**
 * API Route: /api/posts/[id]/like
 * Methods: POST (like), DELETE (unlike)
 */

import type { NextRequest } from 'next/server';
import { authenticate } from '@/lib/api/auth-middleware';
import { asUser } from '@/lib/db/context';
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler';
import { BusinessLogicError, NotFoundError } from '@/lib/errors';
import { IdParamSchema } from '@/lib/validation/schemas';
import { notifyReactionOnPost } from '@/lib/services/notification-service';
import { logger } from '@/lib/logger';
import { parsePostId } from '@/lib/post-id-parser';

/**
 * POST /api/posts/[id]/like
 * Like a post
 */
export const POST = withErrorHandling(async (
  request: NextRequest,
  context?: { params: Promise<{ id: string }> }
) => {
  // Authenticate user
  const user = await authenticate(request);
  const params = await (context?.params || Promise.reject(new BusinessLogicError('Missing route context', 'MISSING_CONTEXT')));
  const { id: postId } = IdParamSchema.parse(params);

  // Like post with RLS
  const likeCount = await asUser(user, async (db) => {
    // Ensure user exists in database (upsert pattern)
    await db.user.upsert({
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
    let post = await db.post.findUnique({
      where: { id: postId },
      select: { id: true, authorId: true },
    });

    if (!post) {
      const parseResult = parsePostId(postId);
      const { gameId, authorId, timestamp } = parseResult.metadata;

      post = await db.post.create({
        data: {
          id: postId,
          content: '[Game-generated post]',
          authorId,
          gameId,
          timestamp,
        },
      });
    }

    // Check if already liked
    const existingReaction = await db.reaction.findUnique({
      where: {
        postId_userId_type: {
          postId,
          userId: user.userId,
          type: 'like',
        },
      },
    });

    if (existingReaction) {
      throw new BusinessLogicError('Post already liked', 'ALREADY_LIKED');
    }

    // Create like reaction
    await db.reaction.create({
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
    const count = await db.reaction.count({
      where: {
        postId,
        type: 'like',
      },
    });

    return count;
  });

  logger.info('Post liked successfully', { postId, userId: user.userId, likeCount }, 'POST /api/posts/[id]/like');

  return successResponse({
    data: {
      likeCount,
      isLiked: true,
    },
  });
});

/**
 * DELETE /api/posts/[id]/like
 * Unlike a post
 */
export const DELETE = withErrorHandling(async (
  request: NextRequest,
  context?: { params: Promise<{ id: string }> }
) => {
  // Authenticate user
  const user = await authenticate(request);
  const { id: postId } = await (context?.params || Promise.reject(new BusinessLogicError('Missing route context', 'MISSING_CONTEXT')));

  // Validate post ID
  if (!postId) {
    throw new BusinessLogicError('Post ID is required', 'POST_ID_REQUIRED');
  }

  // Unlike post with RLS
  const likeCount = await asUser(user, async (db) => {
    // Ensure user exists in database (upsert pattern)
    await db.user.upsert({
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
    const reaction = await db.reaction.findUnique({
      where: {
        postId_userId_type: {
          postId,
          userId: user.userId,
          type: 'like',
        },
      },
    });

    if (!reaction) {
      throw new NotFoundError('Like', `${postId}-${user.userId}`);
    }

    // Delete like
    await db.reaction.delete({
      where: {
        id: reaction.id,
      },
    });

    // Get updated like count
    const count = await db.reaction.count({
      where: {
        postId,
        type: 'like',
      },
    });

    return count;
  });

  logger.info('Post unliked successfully', { postId, userId: user.userId, likeCount }, 'DELETE /api/posts/[id]/like');

  return successResponse({
    data: {
      likeCount,
      isLiked: false,
    },
  });
});
