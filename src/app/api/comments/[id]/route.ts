/**
 * API Route: /api/comments/[id]
 * Methods: PATCH (edit), DELETE (delete)
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
 * PATCH /api/comments/[id]
 * Edit a comment (only by the author)
 */
export async function PATCH(
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

    // Parse request body
    const body = await request.json();
    const { content } = body;

    // Validate content
    if (!content || typeof content !== 'string') {
      return errorResponse('Comment content is required', 400);
    }

    if (content.trim().length === 0) {
      return errorResponse('Comment cannot be empty', 400);
    }

    if (content.length > 5000) {
      return errorResponse('Comment is too long (max 5000 characters)', 400);
    }

    // Find comment
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
    });

    if (!comment) {
      return errorResponse('Comment not found', 404);
    }

    // Check if user is the author
    if (comment.authorId !== user.userId) {
      return errorResponse('You can only edit your own comments', 403);
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
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication failed') {
      return authErrorResponse('Unauthorized');
    }
    logger.error('Error updating comment:', error, 'PATCH /api/comments/[id]');
    return errorResponse('Failed to update comment');
  }
}

/**
 * DELETE /api/comments/[id]
 * Delete a comment (only by the author)
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
      return errorResponse('Comment not found', 404);
    }

    // Check if user is the author
    if (comment.authorId !== user.userId) {
      return errorResponse('You can only delete your own comments', 403);
    }

    // Delete comment (cascade will delete reactions and replies)
    await prisma.comment.delete({
      where: { id: commentId },
    });

    return successResponse({
      message: 'Comment deleted successfully',
      deletedCommentId: commentId,
      deletedRepliesCount: comment._count.replies,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication failed') {
      return authErrorResponse('Unauthorized');
    }
    logger.error('Error deleting comment:', error, 'DELETE /api/comments/[id]');
    return errorResponse('Failed to delete comment');
  }
}
