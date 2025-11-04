/**
 * API Route: /api/posts/[id]/interactions
 * Methods: GET (get all interaction counts and user's interaction state)
 */

import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/database-service';
import { optionalAuth } from '@/lib/api/auth-middleware';
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler';
import { BusinessLogicError } from '@/lib/errors';
import { IdParamSchema, PostInteractionsQuerySchema } from '@/lib/validation/schemas';
import { logger } from '@/lib/logger';

/**
 * GET /api/posts/[id]/interactions
 * Get aggregated interaction data for a post
 * Includes: like count, comment count, share count
 * If authenticated: also returns user's interaction state (isLiked, isShared)
 */
export const GET = withErrorHandling(async (
  request: NextRequest,
  context?: { params: Promise<{ id: string }> }
) => {
  const params = await (context?.params || Promise.reject(new BusinessLogicError('Missing route context', 'MISSING_CONTEXT')));
  const { id: postId } = IdParamSchema.parse(params);
  
  // Validate query parameters
  const { searchParams } = new URL(request.url);
  const queryParams = {
    includeComments: searchParams.get('includeComments') || 'true',
    includeReactions: searchParams.get('includeReactions') || 'true',
    includeShares: searchParams.get('includeShares') || 'false',
    limit: searchParams.get('limit')
  };
  PostInteractionsQuerySchema.parse(queryParams);

  // Optional authentication
  const user = await optionalAuth(request);

  // Check if post exists - if not, return zero counts
  // (Post will be auto-created when user first interacts with it)
  const post = await prisma.post.findUnique({
    where: { id: postId },
  });

  if (!post) {
    // Post hasn't been created yet (no interactions)
    logger.info('Post interactions fetched (not created yet)', { postId }, 'GET /api/posts/[id]/interactions');
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

  logger.info('Post interactions fetched successfully', { postId, likeCount, commentCount, shareCount }, 'GET /api/posts/[id]/interactions');

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
});
