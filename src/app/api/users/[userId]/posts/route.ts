/**
 * API Route: /api/users/[userId]/posts
 * Methods: GET (get user posts and comments/replies)
 */

import type { NextRequest } from 'next/server';
import { optionalAuth } from '@/lib/api/auth-middleware';
import { asUser } from '@/lib/db/context';
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler';
import { BusinessLogicError } from '@/lib/errors';
import { UserIdParamSchema, UserPostsQuerySchema } from '@/lib/validation/schemas';
import { logger } from '@/lib/logger';

/**
 * GET /api/users/[userId]/posts
 * Get user's posts and comments/replies
 */
export const GET = withErrorHandling(async (
  request: NextRequest,
  context?: { params: Promise<{ userId: string }> }
) => {
  const params = await (context?.params || Promise.reject(new BusinessLogicError('Missing route context', 'MISSING_CONTEXT')));
  const { userId } = UserIdParamSchema.parse(params);
  
  // Validate query parameters
  const { searchParams } = new URL(request.url);
  const queryParams = {
    type: searchParams.get('type') || 'posts',
    page: searchParams.get('page') || '1',
    limit: searchParams.get('limit') || '100'
  };
  const { type } = UserPostsQuerySchema.parse(queryParams);

  // Optional authentication
  const user = await optionalAuth(request);

  // Get posts/replies with RLS
  if (type === 'replies') {
    const result = await asUser(user, async (db) => {
      // Verify user exists first
      const dbUser = await db.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      
      if (!dbUser) {
        return { items: [], total: 0 };
      }
      
      // Get user's comments (replies) - query by authorId
      const comments = await db.comment.findMany({
        where: {
          authorId: dbUser.id,
        },
        include: {
          post: {
            select: {
              id: true,
              content: true,
              authorId: true,
              timestamp: true,
            },
          },
          _count: {
            select: {
              reactions: {
                where: { type: 'like' },
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
      const postAuthorIds = [...new Set(comments.map(c => c.post.authorId))];
      
      // Fetch User and Actor info for post authors
      const [postAuthorsUsers, postAuthorsActors] = await Promise.all([
        db.user.findMany({
          where: { id: { in: postAuthorIds } },
          select: {
            id: true,
            displayName: true,
            username: true,
            profileImageUrl: true,
          },
        }),
        db.actor.findMany({
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
        const authorUser = userAuthorsMap.get(comment.post.authorId);
        const authorActor = actorAuthorsMap.get(comment.post.authorId);
        
        return {
          id: comment.id,
          content: comment.content,
          postId: comment.postId,
          createdAt: comment.createdAt.toISOString(),
          updatedAt: comment.updatedAt.toISOString(),
          likeCount: comment._count.reactions,
          replyCount: comment._count.replies,
          isLiked: comment.reactions.length > 0,
          post: {
            id: comment.post.id,
            content: comment.post.content,
            authorId: comment.post.authorId,
            timestamp: comment.post.timestamp.toISOString(),
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

      return { items: replies, total: replies.length };
    });

    logger.info('User replies fetched successfully', { userId, total: result.total }, 'GET /api/users/[userId]/posts');

    return successResponse({
      type: 'replies',
      items: result.items,
      total: result.total,
    });
  } else {
    // Get user's posts
    const result = await asUser(user, async (db) => {
      const posts = await db.post.findMany({
        where: {
          authorId: userId,
        },
        include: {
          _count: {
            select: {
              reactions: {
                where: { type: 'like' },
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
                select: { id: true },
              }
            : false,
          shares: user
            ? {
                where: {
                  userId: user.userId,
                },
                select: { id: true },
              }
            : false,
        },
        orderBy: {
          timestamp: 'desc',
        },
        take: 100,
      });

      // Also get user's shares (reposts)
      const shares = await db.share.findMany({
        where: {
          userId: userId,
        },
        include: {
          post: {
            select: {
              id: true,
              content: true,
              authorId: true,
              timestamp: true,
              _count: {
                select: {
                  reactions: {
                    where: { type: 'like' },
                  },
                  comments: true,
                  shares: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 100,
      });

      // Fetch author info for the user (posts are all from userId)
      const postAuthor = await db.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          displayName: true,
          username: true,
          profileImageUrl: true,
        },
      });
      
      // Get unique author IDs from shared posts
      const sharedPostAuthorIds = [...new Set(shares.map(s => s.post.authorId))];
      
      // Fetch User and Actor info for shared post authors
      const [sharedAuthorsUsers, sharedAuthorsActors] = await Promise.all([
        db.user.findMany({
          where: { id: { in: sharedPostAuthorIds } },
          select: {
            id: true,
            displayName: true,
            username: true,
            profileImageUrl: true,
          },
        }),
        db.actor.findMany({
          where: { id: { in: sharedPostAuthorIds } },
          select: {
            id: true,
            name: true,
            profileImageUrl: true,
          },
        }),
      ]);
      
      // Create author lookup maps
      const userAuthorsMap = new Map(sharedAuthorsUsers.map(u => [u.id, u]));
      const actorAuthorsMap = new Map(sharedAuthorsActors.map(a => [a.id, a]));
      
      // Format posts
      const formattedPosts = posts.map((post) => ({
        id: post.id,
        content: post.content,
        authorId: post.authorId,
        timestamp: post.timestamp.toISOString(),
        createdAt: post.createdAt.toISOString(),
        likeCount: post._count.reactions,
        commentCount: post._count.comments,
        shareCount: post._count.shares,
        isLiked: post.reactions.length > 0,
        isShared: post.shares.length > 0,
        author: postAuthor
          ? {
              id: postAuthor.id,
              displayName: postAuthor.displayName,
              username: postAuthor.username,
              profileImageUrl: postAuthor.profileImageUrl,
            }
          : null,
      }));

      // Format shares as reposts
      const reposts = shares.map((share) => {
        const authorUser = userAuthorsMap.get(share.post.authorId);
        const authorActor = actorAuthorsMap.get(share.post.authorId);
        
        return {
          id: `share-${share.id}`,
          content: share.post.content,
          authorId: share.post.authorId,
          timestamp: share.createdAt.toISOString(),
          createdAt: share.createdAt.toISOString(),
          likeCount: share.post._count.reactions,
          commentCount: share.post._count.comments,
          shareCount: share.post._count.shares,
          isLiked: false,
          isShared: true,
          isRepost: true,
          originalPostId: share.post.id,
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
        };
      });

      // Combine and sort by timestamp
      const allItems = [...formattedPosts, ...reposts].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      return { items: allItems, total: allItems.length };
    });

    logger.info('User posts fetched successfully', { userId, total: result.total }, 'GET /api/users/[userId]/posts');

    return successResponse({
      type: 'posts',
      items: result.items,
      total: result.total,
    });
  }
});

