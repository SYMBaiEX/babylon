/**
 * API Route: /api/posts/[id]/comments
 * Methods: GET (get comments), POST (add comment)
 */

import type { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import {
  authenticate,
  optionalAuth,
  authErrorResponse,
  successResponse,
  errorResponse,
} from '@/lib/api/auth-middleware';
import { notifyCommentOnPost, notifyReplyToComment } from '@/lib/services/notification-service';
import { logger } from '@/lib/logger';

const prisma = new PrismaClient();

/**
 * Recursive comment type
 */
interface CommentTreeNode {
  id: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
  userName: string;
  userUsername: string | null;
  userAvatar: string | null;
  parentCommentId: string | null;
  likeCount: number;
  isLiked: boolean;
  replies: CommentTreeNode[];
}

/**
 * Build threaded comment structure recursively
 */
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
): CommentTreeNode[] {
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
      likeCount: comment._count.reactions,
      isLiked: comment.reactions.length > 0,
      replies: buildCommentTree(comments, comment.id),
    }));
}

/**
 * GET /api/posts/[id]/comments
 * Get threaded comments for a post
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: postId } = await params;

    // Optional authentication (to show liked status for logged-in users)
    const user = await optionalAuth(request);

    // Validate post ID
    if (!postId) {
      return errorResponse('Post ID is required', 400);
    }

    // Check if post exists
    const post = await prisma.post.findUnique({
      where: { id: postId },
    });

    if (!post) {
      return errorResponse('Post not found', 404);
    }

    // Get all comments for the post (including nested replies)
    const comments = await prisma.comment.findMany({
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

    // Build threaded structure
    const threadedComments = buildCommentTree(comments);

    // Get total comment count (including replies)
    const totalComments = comments.length;

    return successResponse({
      data: {
        comments: threadedComments,
        total: totalComments,
      },
    });
  } catch (error) {
    logger.error('Error fetching comments:', error, 'GET /api/posts/[id]/comments');
    return errorResponse('Failed to fetch comments');
  }
}

/**
 * POST /api/posts/[id]/comments
 * Add a comment to a post
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

    // Parse request body
    const body = await request.json();
    const { content, parentCommentId } = body;

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
    const post = await prisma.post.findUnique({
      where: { id: postId },
    });

    // If post doesn't exist, try to auto-create it based on format
    if (!post) {
      // Try multiple post ID formats
      // Format 1: gameId-gameTimestamp-authorId-isoTimestamp (e.g., babylon-1761441310151-kash-patrol-2025-10-01T02:12:00Z)
      // Format 2: post-{timestamp}-{random} (e.g., post-1762099655817-0.7781412938928327)
      // Format 3: post-{timestamp}-{actorId}-{random} (e.g., post-1762099655817-kash-patrol-abc123)

      let gameId = 'babylon'; // default game
      let authorId = 'system'; // default author for game-generated posts
      let timestamp = new Date();

      // Check Format 1: Has ISO timestamp at the end
      const isoTimestampMatch = postId.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)$/);

      if (isoTimestampMatch && isoTimestampMatch[1]) {
        // Format 1: gameId-gameTimestamp-authorId-isoTimestamp
        const timestampStr = isoTimestampMatch[1];
        timestamp = new Date(timestampStr);

        // Extract gameId (first part before first hyphen)
        const firstHyphenIndex = postId.indexOf('-');
        if (firstHyphenIndex !== -1) {
          gameId = postId.substring(0, firstHyphenIndex);

          // Extract authorId (everything between second hyphen and the ISO timestamp)
          const withoutGameId = postId.substring(firstHyphenIndex + 1);
          const secondHyphenIndex = withoutGameId.indexOf('-');
          if (secondHyphenIndex !== -1) {
            const afterGameTimestamp = withoutGameId.substring(secondHyphenIndex + 1);
            authorId = afterGameTimestamp.substring(0, afterGameTimestamp.lastIndexOf('-' + timestampStr));
          }
        }
      } else if (postId.startsWith('post-')) {
        // Format 2 or 3: GameEngine format
        const parts = postId.split('-');

        if (parts.length >= 3 && parts[1]) {
          // Try to extract timestamp from second part
          const timestampPart = parts[1];
          const timestampNum = parseInt(timestampPart, 10);

          if (!isNaN(timestampNum) && timestampNum > 1000000000000) {
            // Valid timestamp (milliseconds since epoch)
            timestamp = new Date(timestampNum);

            // Check if third part looks like an actor ID (not a decimal)
            if (parts.length >= 4 && parts[2] && !parts[2].includes('.')) {
              // Format 3: post-{timestamp}-{actorId}-{random}
              authorId = parts[2];
            }
            // Otherwise Format 2: post-{timestamp}-{random}
            // Keep default authorId = 'system'
          }
        }
      } else {
        // Unknown format, reject
        return errorResponse('Invalid post ID format', 400);
      }

      // Ensure post exists (upsert pattern)
      await prisma.post.upsert({
        where: { id: postId },
        update: {},  // Don't update if exists
        create: {
          id: postId,
          content: '[Game-generated post]',  // Placeholder content
          authorId,
          gameId,
          timestamp,
        },
      });
    }

    // If parentCommentId provided, validate it exists and belongs to this post
    if (parentCommentId) {
      const parentComment = await prisma.comment.findUnique({
        where: { id: parentCommentId },
      });

      if (!parentComment) {
        return errorResponse('Parent comment not found', 404);
      }

      if (parentComment.postId !== postId) {
        return errorResponse('Parent comment does not belong to this post', 400);
      }
    }

    // Get the post to find the authorId for notifications
    // Check if author is a User (not an Actor) - only Users can receive notifications
    const postRecord = await prisma.post.findUnique({
      where: { id: postId },
      include: { 
        author: {
          select: { id: true },
        },
      },
    });

    // Create comment
    const comment = await prisma.comment.create({
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

    // Create notifications
    if (parentCommentId) {
      // Reply to comment - notify the parent comment author
      // Comments are always authored by Users, so we can safely notify
      const parentComment = await prisma.comment.findUnique({
        where: { id: parentCommentId },
        select: { authorId: true },
      });
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
      // Check if post.author exists (means authorId references a User, not an Actor)
      if (
        postRecord && 
        postRecord.authorId && 
        postRecord.authorId !== user.userId &&
        postRecord.author // Only notify if author is a User (not an Actor)
      ) {
        await notifyCommentOnPost(
          postRecord.authorId,
          user.userId,
          postId,
          comment.id
        );
      }
    }

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
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication failed') {
      return authErrorResponse('Unauthorized');
    }
    logger.error('Error creating comment:', error, 'POST /api/posts/[id]/comments');
    return errorResponse('Failed to create comment');
  }
}
