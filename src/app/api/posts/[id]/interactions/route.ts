/**
 * Post Interactions API
 * 
 * @route GET /api/posts/[id]/interactions - Get interaction counts and user state
 * @access Public (authenticated users get additional state)
 * 
 * @description
 * Returns aggregated interaction data for a post including like count, comment count,
 * and share count. For authenticated users, also returns whether the user has liked
 * or shared the post. Highly optimized with caching for feed performance.
 * 
 * @openapi
 * /api/posts/{id}/interactions:
 *   get:
 *     tags:
 *       - Posts
 *     summary: Get post interaction counts
 *     description: Returns like, comment, and share counts. For authenticated users, also returns interaction state.
 *     security:
 *       - PrivyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Post ID
 *       - in: query
 *         name: includeComments
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Include comment count
 *       - in: query
 *         name: includeReactions
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Include reaction/like count
 *       - in: query
 *         name: includeShares
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include share count
 *     responses:
 *       200:
 *         description: Interaction data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 postId:
 *                   type: string
 *                 likeCount:
 *                   type: integer
 *                 commentCount:
 *                   type: integer
 *                 shareCount:
 *                   type: integer
 *                 isLiked:
 *                   type: boolean
 *                 isShared:
 *                   type: boolean
 *                 fetchedAt:
 *                   type: string
 *                   format: date-time
 *       404:
 *         description: Post not found
 * 
 * @example
 * ```typescript
 * const response = await fetch(`/api/posts/${postId}/interactions`);
 * const { likeCount, commentCount, isLiked } = await response.json();
 * ```
 * 
 * @see {@link /lib/cache-service} Caching service
 */

import type { NextRequest } from 'next/server';
import { optionalAuth } from '@/lib/api/auth-middleware';
import { asUser } from '@/lib/db/context';
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler';
import { PostIdParamSchema, PostInteractionsQuerySchema } from '@/lib/validation/schemas';
import { logger } from '@/lib/logger';
import { getCacheOrFetch, CACHE_KEYS } from '@/lib/cache-service';

/**
 * GET /api/posts/[id]/interactions
 * Get aggregated interaction data for a post
 * Includes: like count, comment count, share count
 * If authenticated: also returns user's interaction state (isLiked, isShared)
 */
export const GET = withErrorHandling(async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) => {
  const { id: postId } = PostIdParamSchema.parse(await context.params);
  
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

  // OPTIMIZED: Cache post interactions (called for every post in feed!)
  const cacheKey = user 
    ? `post:${postId}:interactions:user:${user.userId}`
    : `post:${postId}:interactions:public`;
  
  const result = await getCacheOrFetch(
    cacheKey,
    async () => {
      // Get interactions with RLS
      return await asUser(user, async (db) => {
        // Check if post exists and is not in the future - if not, return zero counts
        const now = new Date();
        const post = await db.post.findUnique({
          where: { id: postId },
          select: { id: true, deletedAt: true, timestamp: true },
        });

        // ✅ Don't allow access to future posts
        if (post && post.timestamp > now) {
          return {
            likeCount: 0,
            commentCount: 0,
            shareCount: 0,
            userLike: null,
            userShare: null,
          };
        }

        if (!post || post.deletedAt) {
          return {
            likeCount: 0,
            commentCount: 0,
            shareCount: 0,
            userLike: null,
            userShare: null,
          };
        }

        // Get all interaction counts in parallel
        const [likeCount, commentCount, shareCount, userLike, userShare] =
          await Promise.all([
            // Count likes
            db.reaction.count({
              where: {
                postId,
                type: 'like',
              },
            }),
            // Count comments (including replies)
            db.comment.count({
              where: {
                postId,
              },
            }),
            // Count shares
            db.share.count({
              where: {
                postId,
              },
            }),
            // Check if user liked (if authenticated)
            user
              ? db.reaction.findUnique({
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
              ? db.share.findUnique({
                  where: {
                    userId_postId: {
                      userId: user.userId,
                      postId,
                    },
                  },
                })
              : Promise.resolve(null),
          ]);

        return { likeCount, commentCount, shareCount, userLike, userShare };
      });
    },
    {
      namespace: CACHE_KEYS.POST,
      ttl: 30, // 30 second cache (frequent but can be slightly stale)
    }
  );

  if (result.likeCount === 0 && result.commentCount === 0 && result.shareCount === 0) {
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

  logger.info('Post interactions fetched successfully', { postId, likeCount: result.likeCount, commentCount: result.commentCount, shareCount: result.shareCount }, 'GET /api/posts/[id]/interactions');

  return successResponse({
    postId,
    likeCount: result.likeCount,
    commentCount: result.commentCount,
    shareCount: result.shareCount,
    isLiked: !!result.userLike,
    isShared: !!result.userShare,
    // Include timestamp for cache invalidation
    fetchedAt: new Date().toISOString(),
  });
});
