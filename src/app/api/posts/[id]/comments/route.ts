/**
 * API Route: /api/posts/[id]/comments
 * Methods: GET (get comments), POST (add comment)
 */

import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import {
  authenticate,
  optionalAuth,
  authErrorResponse,
  successResponse,
  errorResponse,
} from '@/lib/api/auth-middleware';

const prisma = new PrismaClient();

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
): unknown[] {
  return comments
    .filter((comment) => comment.parentCommentId === parentId)
    .map((comment) => ({
      id: comment.id,
      content: comment.content,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      userId: comment.author.id,
      userName: comment.author.displayName || comment.author.username || 'Anonymous',
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
      comments: threadedComments,
      total: totalComments,
    });
  } catch (error) {
    console.error('Error fetching comments:', error);
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

    // Auto-create post if it doesn't exist
    // PostId format: gameId-gameTimestamp-authorId-timestamp
    // Example: babylon-1761441310151-kash-patrol-2025-10-01T02:12:00Z
    
    // Extract ISO timestamp from the end (matches YYYY-MM-DDTHH:mm:ssZ pattern)
    const isoTimestampMatch = postId.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)$/);

    if (!isoTimestampMatch || !isoTimestampMatch[1]) {
      return errorResponse('Invalid post ID format - no valid timestamp', 400);
    }

    const timestampStr = isoTimestampMatch[1];
    
    // Extract gameId (first part before first hyphen)
    const firstHyphenIndex = postId.indexOf('-');
    if (firstHyphenIndex === -1) {
      return errorResponse('Invalid post ID format', 400);
    }
    const gameId = postId.substring(0, firstHyphenIndex);
    
    // Extract authorId (everything between second hyphen and the ISO timestamp)
    const parts = postId.split('-');
    if (parts.length < 3) {
      return errorResponse('Invalid post ID format', 400);
    }
    
    // AuthorId is everything between gameId+gameTimestamp and the ISO timestamp
    // Remove gameId, remove timestamp at end, extract what's left
    const withoutGameId = postId.substring(firstHyphenIndex + 1);
    const secondHyphenIndex = withoutGameId.indexOf('-');
    if (secondHyphenIndex === -1) {
      return errorResponse('Invalid post ID format', 400);
    }
    const afterGameTimestamp = withoutGameId.substring(secondHyphenIndex + 1);
    const authorId = afterGameTimestamp.substring(0, afterGameTimestamp.lastIndexOf('-' + timestampStr));

    if (!gameId || !authorId) {
      return errorResponse('Invalid post ID format', 400);
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
    console.error('Error creating comment:', error);
    return errorResponse('Failed to create comment');
  }
}
