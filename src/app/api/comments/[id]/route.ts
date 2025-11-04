/**
 * API Route: /api/comments/[id]
 * Methods: PATCH (edit), DELETE (delete)
 */

import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/database-service';
import { authenticate } from '@/lib/api/auth-middleware';
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler';
import { BusinessLogicError, NotFoundError, AuthorizationError } from '@/lib/errors';
import { IdParamSchema, UpdateCommentSchema } from '@/lib/validation/schemas';
import { logger } from '@/lib/logger';

/**
 * PATCH /api/comments/[id]
 * Edit a comment (only by the author)
 */
export const PATCH = withErrorHandling(async (
  request: NextRequest,
  context?: { params: Promise<{ id: string }> }
) => {
  // Authenticate user
  const user = await authenticate(request);
  const params = await (context?.params || Promise.reject(new BusinessLogicError('Missing route context', 'MISSING_CONTEXT')));
  const { id: commentId } = IdParamSchema.parse(params);

  // Parse and validate request body
  const body = await request.json();
  const { content } = UpdateCommentSchema.parse(body);

  // Find comment
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
  });

  if (!comment) {
    throw new NotFoundError('Comment', commentId);
  }

  // Check if user is the author
  if (comment.authorId !== user.userId) {
    throw new AuthorizationError('You can only edit your own comments', 'comment', 'edit');
  }

  // Update comment
  const updatedComment = await prisma.comment.update({
    where: { id: commentId },
    data: {
      content: content.trim(),
    },
    include: {
      author: {
        select: {
          id: true,
          displayName: true,
          username: true,
          profileImageUrl: true,
        },
      },
      _count: {
        select: {
          reactions: true,
          replies: true,
        },
      },
    },
  });

  logger.info('Comment updated successfully', { commentId, userId: user.userId }, 'PATCH /api/comments/[id]');

  return successResponse({
    id: updatedComment.id,
    content: updatedComment.content,
    postId: updatedComment.postId,
    authorId: updatedComment.authorId,
    parentCommentId: updatedComment.parentCommentId,
    createdAt: updatedComment.createdAt,
    updatedAt: updatedComment.updatedAt,
    author: updatedComment.author,
    likeCount: updatedComment._count.reactions,
    replyCount: updatedComment._count.replies,
  });
});

/**
 * DELETE /api/comments/[id]
 * Delete a comment (only by the author)
 */
export const DELETE = withErrorHandling(async (
  request: NextRequest,
  context?: { params: Promise<{ id: string }> }
) => {
  // Authenticate user
  const user = await authenticate(request);
  const params = await (context?.params || Promise.reject(new BusinessLogicError('Missing route context', 'MISSING_CONTEXT')));
  const { id: commentId } = IdParamSchema.parse(params);

  // Find comment
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    include: {
      _count: {
        select: {
          replies: true,
        },
      },
    },
  });

  if (!comment) {
    throw new NotFoundError('Comment', commentId);
  }

  // Check if user is the author
  if (comment.authorId !== user.userId) {
    throw new AuthorizationError('You can only delete your own comments', 'comment', 'delete');
  }

  // Delete comment (cascade will delete reactions and replies)
  await prisma.comment.delete({
    where: { id: commentId },
  });

  logger.info('Comment deleted successfully', { commentId, userId: user.userId, deletedRepliesCount: comment._count.replies }, 'DELETE /api/comments/[id]');

  return successResponse({
    message: 'Comment deleted successfully',
    deletedCommentId: commentId,
    deletedRepliesCount: comment._count.replies,
  });
});
