/**
 * API Route: /api/comments/[id]/replies
 * Methods: POST (add reply to comment)
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
 * POST /api/comments/[id]/replies
 * Add a reply to a comment
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate user
    const user = await authenticate(request);
    const { id: parentCommentId } = await params;

    // Validate parent comment ID
    if (!parentCommentId) {
      return errorResponse('Parent comment ID is required', 400);
    }

    // Parse request body
    const body = await request.json();
    const { content } = body;

    // Validate content
    if (!content || typeof content !== 'string') {
      return errorResponse('Reply content is required', 400);
    }

    if (content.trim().length === 0) {
      return errorResponse('Reply cannot be empty', 400);
    }

    if (content.length > 5000) {
      return errorResponse('Reply is too long (max 5000 characters)', 400);
    }

    // Check if parent comment exists
    const parentComment = await prisma.comment.findUnique({
      where: { id: parentCommentId },
    });

    if (!parentComment) {
      return errorResponse('Parent comment not found', 404);
    }

    // Auto-create post if it doesn't exist (for consistency)
    // PostId format: gameId-authorId-timestamp
    const postId = parentComment.postId;
    const postParts = postId.split('-');
    if (postParts.length >= 3) {
      const gameId = postParts[0];
      const authorId = postParts[1];
      const timestampStr = postParts.slice(2).join('-');

      if (gameId && authorId) {
        // Ensure post exists (upsert pattern)
        await prisma.post.upsert({
          where: { id: postId },
          update: {},  // Don't update if exists
          create: {
            id: postId,
            content: '[Game-generated post]',  // Placeholder content
            authorId,
            gameId,
            timestamp: new Date(timestampStr),
          },
        });
      }
    }

    // Create reply (comment with parentCommentId)
    const reply = await prisma.comment.create({
      data: {
        content: content.trim(),
        postId: parentComment.postId,
        authorId: user.userId,
        parentCommentId,
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

    return successResponse(
      {
        id: reply.id,
        content: reply.content,
        postId: reply.postId,
        authorId: reply.authorId,
        parentCommentId: reply.parentCommentId,
        createdAt: reply.createdAt,
        updatedAt: reply.updatedAt,
        author: reply.author,
        likeCount: reply._count.reactions,
        replyCount: reply._count.replies,
      },
      201
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication failed') {
      return authErrorResponse('Unauthorized');
    }
    logger.error('Error creating reply:', error, 'POST /api/comments/[id]/replies');
    return errorResponse('Failed to create reply');
  }
}
