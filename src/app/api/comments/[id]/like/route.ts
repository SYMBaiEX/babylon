/**
 * API Route: /api/comments/[id]/like
 * Methods: POST (like), DELETE (unlike)
 */

import type { NextRequest } from 'next/server';
import { authenticate } from '@/lib/api/auth-middleware';
import { asUser } from '@/lib/db/context';
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler';
import { BusinessLogicError, NotFoundError } from '@/lib/errors';
import { IdParamSchema } from '@/lib/validation/schemas';
import { logger } from '@/lib/logger';
/**
 * POST /api/comments/[id]/like
 * Like a comment
 */
export const POST = withErrorHandling(async (
  request: NextRequest,
  context?: { params: Promise<{ id: string }> }
) => {
  // Authenticate user
  const user = await authenticate(request);
  const params = await (context?.params || Promise.reject(new BusinessLogicError('Missing route context', 'MISSING_CONTEXT')));
  const { id: commentId } = IdParamSchema.parse(params);

  // Like comment with RLS
  const { reaction, likeCount } = await asUser(user, async (db) => {
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

    // Check if comment exists
    const comment = await db.comment.findUnique({
      where: { id: commentId },
    });

    if (!comment) {
      throw new NotFoundError('Comment', commentId);
    }

    // Check if already liked
    const existingReaction = await db.reaction.findUnique({
      where: {
        commentId_userId_type: {
          commentId,
          userId: user.userId,
          type: 'like',
        },
      },
    });

    if (existingReaction) {
      throw new BusinessLogicError('Comment already liked', 'ALREADY_LIKED');
    }

    // Create like reaction
    const newReaction = await db.reaction.create({
      data: {
        commentId,
        userId: user.userId,
        type: 'like',
      },
    });

    // Get updated like count
    const count = await db.reaction.count({
      where: {
        commentId,
        type: 'like',
      },
    });

    return { reaction: newReaction, likeCount: count };
  });

  logger.info('Comment liked successfully', { commentId, userId: user.userId, likeCount }, 'POST /api/comments/[id]/like');

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
});

/**
 * DELETE /api/comments/[id]/like
 * Unlike a comment
 */
export const DELETE = withErrorHandling(async (
  request: NextRequest,
  context?: { params: Promise<{ id: string }> }
) => {
  // Authenticate user
  const user = await authenticate(request);
  const params = await (context?.params || Promise.reject(new BusinessLogicError('Missing route context', 'MISSING_CONTEXT')));
  const { id: commentId } = IdParamSchema.parse(params);

  // Unlike comment with RLS
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
        commentId_userId_type: {
          commentId,
          userId: user.userId,
          type: 'like',
        },
      },
    });

    if (!reaction) {
      throw new NotFoundError('Like', `${commentId}-${user.userId}`);
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
        commentId,
        type: 'like',
      },
    });

    return count;
  });

  logger.info('Comment unliked successfully', { commentId, userId: user.userId, likeCount }, 'DELETE /api/comments/[id]/like');

  return successResponse({
    commentId,
    likeCount,
    isLiked: false,
    message: 'Comment unliked successfully',
  });
});
