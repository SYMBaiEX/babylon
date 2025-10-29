/**
 * API Route: /api/posts/[id]/interactions
 * Methods: GET (get all interaction counts and user's interaction state)
 */

import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import {
  optionalAuth,
  successResponse,
  errorResponse,
} from '@/lib/api/auth-middleware';

const prisma = new PrismaClient();

/**
 * GET /api/posts/[id]/interactions
 * Get aggregated interaction data for a post
 * Includes: like count, comment count, share count
 * If authenticated: also returns user's interaction state (isLiked, isShared)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: postId } = await params;

    // Optional authentication
    const user = await optionalAuth(request);

    // Validate post ID
    if (!postId) {
      return errorResponse('Post ID is required', 400);
    }

    // Check if post exists - if not, return zero counts
    // (Post will be auto-created when user first interacts with it)
    const post = await prisma.post.findUnique({
      where: { id: postId },
    });

    if (!post) {
      // Post hasn't been created yet (no interactions)
      return successResponse({
        postId,
        likeCount: 0,
        commentCount: 0,
        shareCount: 0,
        isLiked: false,
        isShared: false,
        fetchedAt: new Date().toISOString(),
      });
    }

    // Get all interaction counts in parallel
    const [likeCount, commentCount, shareCount, userLike, userShare] =
      await Promise.all([
        // Count likes
        prisma.reaction.count({
          where: {
            postId,
            type: 'like',
          },
        }),
        // Count comments (including replies)
        prisma.comment.count({
          where: {
            postId,
          },
        }),
        // Count shares
        prisma.share.count({
          where: {
            postId,
          },
        }),
        // Check if user liked (if authenticated)
        user
          ? prisma.reaction.findUnique({
              where: {
                postId_userId_type: {
                  postId,
                  userId: user.userId,
                  type: 'like',
                },
              },
            })
          : Promise.resolve(null),
        // Check if user shared (if authenticated)
        user
          ? prisma.share.findUnique({
              where: {
                userId_postId: {
                  userId: user.userId,
                  postId,
                },
              },
            })
          : Promise.resolve(null),
      ]);

    return successResponse({
      postId,
      likeCount,
      commentCount,
      shareCount,
      isLiked: !!userLike,
      isShared: !!userShare,
      // Include timestamp for cache invalidation
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching post interactions:', error);
    return errorResponse('Failed to fetch interactions');
  }
}
