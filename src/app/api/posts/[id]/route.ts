/**
 * API Route: /api/posts/[id]
 * Methods: GET (get single post details)
 */

import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/database-service';
import {
  optionalAuth,
  successResponse,
  errorResponse,
} from '@/lib/api/auth-middleware';
import { logger } from '@/lib/logger';

/**
 * GET /api/posts/[id]
 * Get a single post by ID
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

    // Try to get post from database first
    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        _count: {
          select: {
            reactions: {
              where: {
                type: 'like',
              },
            },
            comments: true,
            shares: true,
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
        shares: user
          ? {
              where: {
                userId: user.userId,
              },
              select: {
                id: true,
              },
            }
          : false,
      },
    });

    // If not in database, return 404 immediately
    // Realtime posts should have been synced to DB by the continuous engine
    if (!post) {
      return errorResponse('Post not found', 404);
    }

    // Return database post
    return successResponse({
      data: {
        id: post.id,
        content: post.content,
        authorId: post.authorId,
        authorName: post.authorId, // No author relation in schema
        authorAvatar: undefined,
        isActorPost: true, // Posts are from game actors
        timestamp: post.timestamp.toISOString(),
        createdAt: post.createdAt.toISOString(),
        likeCount: post._count.reactions,
        commentCount: post._count.comments,
        shareCount: post._count.shares,
        isLiked: post.reactions.length > 0,
        isShared: post.shares.length > 0,
        source: 'database',
      },
    });
  } catch (error) {
    logger.error('Error fetching post:', error, 'GET /api/posts/[id]');
    return errorResponse('Failed to fetch post');
  }
}

