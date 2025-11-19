/**
 * User Posts API
 * 
 * @route GET /api/users/[userId]/posts - Get user posts and replies
 * @access Public
 * 
 * @description
 * Returns user's posts and comments/replies with interaction counts. Supports
 * filtering by type (posts or replies). Includes reposts/shares and excludes
 * future posts. Optimized with batch queries to prevent N+1 problems.
 * 
 * @openapi
 * /api/users/{userId}/posts:
 *   get:
 *     tags:
 *       - Users
 *     summary: Get user posts and replies
 *     description: Returns user's posts or replies with interaction counts and author information
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID, username, or wallet address
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [posts, replies]
 *           default: posts
 *         description: Type of content to retrieve
 *     responses:
 *       200:
 *         description: User posts/replies retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 type:
 *                   type: string
 *                   enum: [posts, replies]
 *                 items:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       content:
 *                         type: string
 *                       authorId:
 *                         type: string
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                       likeCount:
 *                         type: integer
 *                       commentCount:
 *                         type: integer
 *                       shareCount:
 *                         type: integer
 *                       isLiked:
 *                         type: boolean
 *                       isShared:
 *                         type: boolean
 *                 total:
 *                   type: integer
 * 
 * @example
 * ```typescript
 * // Get user posts
 * const posts = await fetch('/api/users/user_123/posts?type=posts');
 * 
 * // Get user replies
 * const replies = await fetch('/api/users/user_123/posts?type=replies');
 * ```
 * 
 * @see {@link /lib/db/context} RLS context
 */

import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { optionalAuth } from '@/lib/api/auth-middleware';
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler';
import { UserIdParamSchema, UserPostsQuerySchema } from '@/lib/validation/schemas';
import { logger } from '@/lib/logger';
import { findUserByIdentifier } from '@/lib/users/user-lookup';
import type { Post } from '@prisma/client';

// Type for posts with included original post relation
type PostWithOriginal = Post & {
  _count: {
    Reaction: number;
    Comment: number;
    Share: number;
  };
  Reaction: Array<{ id: string }>;
  Share: Array<{ id: string }>;
  Post_Post_originalPostIdToPost?: {
    id: string;
    content: string;
    authorId: string;
    timestamp: Date;
  } | null;
};

/**
 * GET /api/users/[userId]/posts
 * Get user's posts and comments/replies
 */
export const GET = withErrorHandling(async (
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) => {
  const params = await context.params;
  const { userId } = UserIdParamSchema.parse(params);
  const targetUser = await findUserByIdentifier(userId, { id: true });
  
  // If user doesn't exist yet (new Privy user), return empty data
  if (!targetUser) {
    logger.info('User not found - returning empty data (may be new Privy user)', { userId }, 'GET /api/users/[userId]/posts');
    return successResponse({
      items: [],
      total: 0,
      type: 'posts',
    });
  }
  
  const canonicalUserId = targetUser.id;
  
  // Validate query parameters
  const { searchParams } = new URL(request.url);
  const queryParams = {
    type: searchParams.get('type') || 'posts',
    page: searchParams.get('page') ?? undefined,
    limit: searchParams.get('limit') ?? undefined,
  };
  const { type } = UserPostsQuerySchema.parse(queryParams);

  // Optional authentication
  const user = await optionalAuth(request);

    if (type === 'replies') {
      // Get user's comments (replies) - query by authorId
      const comments = await prisma.comment.findMany({
        where: {
          authorId: canonicalUserId,
        },
        include: {
          Post: {
            select: {
              id: true,
              content: true,
              authorId: true,
              timestamp: true,
            },
          },
          _count: {
            select: {
              Reaction: {
                where: { type: 'like' },
              },
              other_Comment: true,
            },
          },
          Reaction: user
            ? {
                where: {
                  userId: user.userId,
                  type: 'like',
                },
                select: { id: true },
              }
            : false,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 100,
      });

      // Get unique post author IDs to fetch author info
      const postAuthorIds = [...new Set(comments.map(c => c.Post.authorId))];
      
      // Fetch User and Actor info for post authors
      const [postAuthorsUsers, postAuthorsActors] = await Promise.all([
        prisma.user.findMany({
          where: { id: { in: postAuthorIds } },
          select: {
            id: true,
            displayName: true,
            username: true,
            profileImageUrl: true,
          },
        }),
        prisma.actor.findMany({
          where: { id: { in: postAuthorIds } },
          select: {
            id: true,
            name: true,
            profileImageUrl: true,
          },
        }),
      ]);
      
      // Create author lookup maps
      const userAuthorsMap = new Map(postAuthorsUsers.map(u => [u.id, u]));
      const actorAuthorsMap = new Map(postAuthorsActors.map(a => [a.id, a]));
      
      // Format comments as replies
      const replies = comments.map((comment) => {
        const authorUser = userAuthorsMap.get(comment.Post.authorId);
        const authorActor = actorAuthorsMap.get(comment.Post.authorId);
        
        return {
          id: comment.id,
          content: comment.content,
          postId: comment.postId,
          createdAt: comment.createdAt.toISOString(),
          updatedAt: comment.updatedAt.toISOString(),
          likeCount: comment._count.Reaction,
          replyCount: comment._count.other_Comment,
          isLiked: comment.Reaction.length > 0,
          post: {
            id: comment.Post.id,
            content: comment.Post.content,
            authorId: comment.Post.authorId,
            timestamp: comment.Post.timestamp.toISOString(),
            author: authorUser
              ? {
                  id: authorUser.id,
                  displayName: authorUser.displayName,
                  username: authorUser.username,
                  profileImageUrl: authorUser.profileImageUrl,
                }
              : authorActor
                ? {
                    id: authorActor.id,
                    displayName: authorActor.name,
                    username: null,
                    profileImageUrl: authorActor.profileImageUrl,
                  }
                : null,
          },
        };
      });

      logger.info('User replies fetched successfully', { userId: canonicalUserId, total: replies.length }, 'GET /api/users/[userId]/posts');

      return successResponse({
        type: 'replies',
        items: replies,
        total: replies.length,
      });
    } else {
      // Get user's posts - filter out future posts
      const now = new Date();
      const posts = await prisma.post.findMany({
        where: {
          authorId: canonicalUserId,
          deletedAt: null, // Filter out deleted posts
          timestamp: { lte: now }, // ✅ No future posts
        },
        include: {
          _count: {
            select: {
              Reaction: {
                where: { type: 'like' },
              },
              Comment: true,
              Share: true,
            },
          },
          Reaction: user
            ? {
                where: {
                  userId: user.userId,
                  type: 'like',
                },
                select: { id: true },
              }
            : false,
          Share: user
            ? {
                where: {
                  userId: user.userId,
                },
                select: { id: true },
              }
            : false,
          // Include original post for reposts/quotes
          Post_Post_originalPostIdToPost: {
            where: { deletedAt: null },
            select: {
              id: true,
              content: true,
              authorId: true,
              timestamp: true,
            }
          }
        },
        orderBy: {
          timestamp: 'desc',
        },
        take: 100,
      });

      // Fetch author info for the user (posts are all from userId)
      const postAuthor = await prisma.user.findUnique({
        where: { id: canonicalUserId },
        select: {
          id: true,
          displayName: true,
          username: true,
          profileImageUrl: true,
        },
      });
      
      // Get unique author IDs from original posts (for reposts/quotes)
      const postsWithOriginal = posts as PostWithOriginal[];
      const originalPostAuthorIds = postsWithOriginal
        .filter(p => p.originalPostId && p.Post_Post_originalPostIdToPost)
        .map(p => p.Post_Post_originalPostIdToPost!.authorId)
        .filter((id): id is string => !!id);
      
      const uniqueOriginalAuthorIds = [...new Set(originalPostAuthorIds)];
      
      // Fetch User, Actor, and Organization info for original post authors
      const [originalAuthorsUsers, originalAuthorsActors, originalAuthorsOrgs] = await Promise.all([
        prisma.user.findMany({
          where: { id: { in: uniqueOriginalAuthorIds } },
          select: {
            id: true,
            displayName: true,
            username: true,
            profileImageUrl: true,
          },
        }),
        prisma.actor.findMany({
          where: { id: { in: uniqueOriginalAuthorIds } },
          select: {
            id: true,
            name: true,
            profileImageUrl: true,
          },
        }),
        prisma.organization.findMany({
          where: { id: { in: uniqueOriginalAuthorIds } },
          select: {
            id: true,
            name: true,
            imageUrl: true,
          },
        }),
      ]);
      
      // Create author lookup maps
      const userAuthorsMap = new Map(originalAuthorsUsers.map(u => [u.id, u]));
      const actorAuthorsMap = new Map(originalAuthorsActors.map(a => [a.id, a]));
      const orgAuthorsMap = new Map(originalAuthorsOrgs.map(o => [o.id, o]));
      
      // Format posts (includes both regular posts and reposts/quotes)
      const formattedPosts = postsWithOriginal.map((post) => {
        const basePost = {
          id: post.id,
          content: post.content,
          authorId: post.authorId,
          timestamp: post.timestamp.toISOString(),
          createdAt: post.createdAt.toISOString(),
          likeCount: post._count.Reaction,
          commentCount: post._count.Comment,
          shareCount: post._count.Share,
          isLiked: post.Reaction.length > 0,
          isShared: post.Share.length > 0,
          author: postAuthor
            ? {
                id: postAuthor.id,
                displayName: postAuthor.displayName,
                username: postAuthor.username,
                profileImageUrl: postAuthor.profileImageUrl,
              }
            : null,
        };
        
        // Check if this is a repost/quote
        if (post.originalPostId && post.Post_Post_originalPostIdToPost) {
          const originalPost = post.Post_Post_originalPostIdToPost;
          const isQuote = post.content && post.content.length > 0;
          
          // Get original post author info
          const originalUser = userAuthorsMap.get(originalPost.authorId);
          const originalActor = actorAuthorsMap.get(originalPost.authorId);
          const originalOrg = orgAuthorsMap.get(originalPost.authorId);
          
          return {
            ...basePost,
            isRepost: true,
            isQuote,
            quoteComment: isQuote ? post.content : null,
            originalPostId: originalPost.id,
            originalPost: {
              id: originalPost.id,
              content: originalPost.content,
              authorId: originalPost.authorId,
              authorName: originalUser?.displayName || originalActor?.name || originalOrg?.name || originalPost.authorId,
              authorUsername: originalUser?.username || null,
              authorProfileImageUrl: originalUser?.profileImageUrl || originalActor?.profileImageUrl || originalOrg?.imageUrl || null,
              timestamp: originalPost.timestamp.toISOString(),
            }
          };
        }
        
        return basePost;
      });

      // Sort by timestamp (posts already include reposts/quotes)
      const allItems = formattedPosts.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      logger.info('User posts fetched successfully', { userId: canonicalUserId, total: allItems.length }, 'GET /api/users/[userId]/posts');

      return successResponse({
        type: 'posts',
        items: allItems,
        total: allItems.length,
      });
    }
});
