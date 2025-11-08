/**
 * API Route: /api/posts/[id]/comments
 * Methods: GET (get comments), POST (add comment)
 */

import { authenticate, optionalAuth } from '@/lib/api/auth-middleware';
import { asUser } from '@/lib/db/context';
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler';
import { BusinessLogicError, NotFoundError } from '@/lib/errors';
import { CreateCommentSchema, IdParamSchema } from '@/lib/validation/schemas';
import { logger } from '@/lib/logger';
import { notifyCommentOnPost, notifyReplyToComment } from '@/lib/services/notification-service';
import type { NextRequest } from 'next/server';

/**
 * Build threaded comment structure recursively
 */
type CommentTreeItem = {
  id: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
  userName: string;
  userUsername: string | null;
  userAvatar: string | null;
  parentCommentId: string | null;
  parentCommentAuthorName?: string;
  likeCount: number;
  isLiked: boolean;
  replies: CommentTreeItem[];
};

function buildCommentTree(
  comments: Array<{
    id: string;
    content: string;
    createdAt: Date;
    updatedAt: Date;
    parentCommentId: string | null;
    author: {
      id: string;
      displayName: string | null;
      username: string | null;
      profileImageUrl: string | null;
    };
    _count: {
      reactions: number;
      replies: number;
    };
    reactions: Array<{ id: string }>;
  }>,
  parentId: string | null = null
): CommentTreeItem[] {
  // Helper to find parent comment author name
  const findParentAuthorName = (parentCommentId: string | null): string | undefined => {
    if (!parentCommentId) return undefined;
    const parentComment = comments.find(c => c.id === parentCommentId);
    if (parentComment) {
      return parentComment.author.displayName || parentComment.author.username || 'Anonymous';
    }
    return undefined;
  };

  return comments
    .filter((comment) => comment.parentCommentId === parentId)
    .map((comment) => ({
      id: comment.id,
      content: comment.content,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      userId: comment.author.id,
      userName: comment.author.displayName || comment.author.username || 'Anonymous',
      userUsername: comment.author.username || null,
      userAvatar: comment.author.profileImageUrl,
      parentCommentId: comment.parentCommentId,
      parentCommentAuthorName: findParentAuthorName(comment.parentCommentId),
      likeCount: comment._count.reactions,
      isLiked: comment.reactions.length > 0,
      replies: buildCommentTree(comments, comment.id),
    }));
}

/**
 * GET /api/posts/[id]/comments
 * Get threaded comments for a post
 */
export const GET = withErrorHandling(async (
  request: NextRequest,
  context?: { params: Promise<{ id: string }> }
) => {
  const { id: postId } = await (context?.params || Promise.reject(new BusinessLogicError('Missing route context', 'MISSING_CONTEXT')));

  // Optional authentication (to show liked status for logged-in users)
  const user = await optionalAuth(request);

  // Get comments with RLS
  const { comments } = await asUser(user, async (db) => {
    // Check if post exists
    const postRecord = await db.post.findUnique({
      where: { id: postId },
    });

    if (!postRecord) {
      throw new NotFoundError('Post', postId);
    }

    // Get all comments for the post (including nested replies)
    const commentList = await db.comment.findMany({
      where: {
        postId,
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
            reactions: {
              where: {
                type: 'like',
              },
            },
            replies: true,
          },
        },
        reactions: user
          ? {
              where: {
                userId: user.userId,
                type: 'like',
              },
              select: {
                id: true,
              },
            }
          : false,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return { comments: commentList };
  });

    // Build threaded structure
    const threadedComments = buildCommentTree(comments);

    // Get total comment count (including replies)
    const totalComments = comments.length;

  logger.info('Comments fetched successfully', { postId, total: totalComments }, 'GET /api/posts/[id]/comments');

  return successResponse({
    data: {
      comments: threadedComments,
      total: totalComments,
    },
  });
});

/**
 * POST /api/posts/[id]/comments
 * Add a comment to a post
 */
export const POST = withErrorHandling(async (
  request: NextRequest,
  context?: { params: Promise<{ id: string }> }
) => {
  // Authenticate user
  const user = await authenticate(request);
  const params = await (context?.params || Promise.reject(new BusinessLogicError('Missing route context', 'MISSING_CONTEXT')));
  const { id: postId } = IdParamSchema.parse(params);

  // Parse and validate request body
  const body = await request.json();
  const validatedData = CreateCommentSchema.parse(body);
  const { content, parentCommentId } = validatedData;

  if (content.length > 5000) {
    throw new BusinessLogicError('Comment is too long (max 5000 characters)', 'COMMENT_TOO_LONG');
  }

  // Create comment with RLS
  const { comment, postRecord, parentComment } = await asUser(user, async (db) => {
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
    let postRecord = await db.post.findUnique({
      where: { id: postId },
    });

    // If post doesn't exist, try to auto-create it based on format
    if (!postRecord) {
      // Try multiple post ID formats
      let gameId = 'babylon';
      let authorId = 'system';
      let timestamp = new Date();

      // Check Format 1: Has ISO timestamp at the end
      const isoTimestampMatch = postId.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)$/);

      if (isoTimestampMatch && isoTimestampMatch[1]) {
        const timestampStr = isoTimestampMatch[1];
        timestamp = new Date(timestampStr);

        const firstHyphenIndex = postId.indexOf('-');
        if (firstHyphenIndex !== -1) {
          gameId = postId.substring(0, firstHyphenIndex);

          const withoutGameId = postId.substring(firstHyphenIndex + 1);
          const secondHyphenIndex = withoutGameId.indexOf('-');
          if (secondHyphenIndex !== -1) {
            const afterGameTimestamp = withoutGameId.substring(secondHyphenIndex + 1);
            authorId = afterGameTimestamp.substring(0, afterGameTimestamp.lastIndexOf('-' + timestampStr));
          }
        }
      } else if (postId.startsWith('post-')) {
        const parts = postId.split('-');

        if (parts.length >= 3 && parts[1]) {
          const timestampPart = parts[1];
          const timestampNum = parseInt(timestampPart, 10);

          if (!isNaN(timestampNum) && timestampNum > 1000000000000) {
            timestamp = new Date(timestampNum);

            if (parts.length >= 4 && parts[2] && !parts[2].includes('.')) {
              authorId = parts[2];
            }
          }
        }
      } else {
        throw new BusinessLogicError('Invalid post ID format', 'INVALID_POST_ID_FORMAT');
      }

      // Ensure post exists (upsert pattern)
      postRecord = await db.post.upsert({
        where: { id: postId },
        update: {},
        create: {
          id: postId,
          content: '[Game-generated post]',
          authorId,
          gameId,
          timestamp,
        },
      });
    }

    // If parentCommentId provided, validate it exists and belongs to this post
    let parentComment = null;
    if (parentCommentId) {
      parentComment = await db.comment.findUnique({
        where: { id: parentCommentId },
      });

      if (!parentComment) {
        throw new NotFoundError('Parent comment', parentCommentId);
      }

      if (parentComment.postId !== postId) {
        throw new BusinessLogicError('Parent comment does not belong to this post', 'PARENT_COMMENT_MISMATCH');
      }
    }

    // Get the post to find the authorId for notifications
    const postForNotifications = await db.post.findUnique({
      where: { id: postId },
      select: { 
        id: true,
        authorId: true,
      },
    });

    // Create comment
    const newComment = await db.comment.create({
      data: {
        content: content.trim(),
        postId,
        authorId: user.userId,
        parentCommentId: parentCommentId || null,
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

    return { comment: newComment, postRecord: postForNotifications, parentComment };
  });

  // Create notifications
  if (parentCommentId) {
    // Reply to comment - notify the parent comment author
    if (parentComment && parentComment.authorId !== user.userId) {
      await notifyReplyToComment(
        parentComment.authorId,
        user.userId,
        postId,
        parentCommentId,
        comment.id
      );
    }
  } else {
    // Comment on post - notify the post author only if they're a User (not an Actor)
    if (
      postRecord && 
      postRecord.authorId && 
      postRecord.authorId !== user.userId
    ) {
      const postAuthorUser = await asUser(user, async (db) => {
        return await db.user.findUnique({
          where: { id: postRecord.authorId },
          select: { id: true },
        });
      });
      
      if (postAuthorUser) {
        await notifyCommentOnPost(
          postRecord.authorId,
          user.userId,
          postId,
          comment.id
        );
      }
    }
  }

  logger.info('Comment created successfully', { postId, userId: user.userId, commentId: comment.id, parentCommentId }, 'POST /api/posts/[id]/comments');

  return successResponse(
    {
      id: comment.id,
      content: comment.content,
      postId: comment.postId,
      authorId: comment.authorId,
      parentCommentId: comment.parentCommentId,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      author: comment.author,
      likeCount: comment._count.reactions,
      replyCount: comment._count.replies,
    },
    201
  );
});
