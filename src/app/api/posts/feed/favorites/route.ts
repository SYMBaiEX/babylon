/**
 * API Route: /api/posts/feed/favorites
 * Methods: GET (get posts from favorited profiles)
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
 * GET /api/posts/feed/favorites
 * Get posts from profiles the user has favorited
 * Query params:
 * - limit: number of posts to return (default 20, max 100)
 * - offset: pagination offset (default 0)
 */
export async function GET(request: NextRequest) {
  try {
    // Optional authentication - returns null if not authenticated
    const user = await optionalAuth(request);

    // If not authenticated, return empty array
    if (!user) {
      return successResponse({
        posts: [],
        total: 0,
        hasMore: false,
      });
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(
      Number.parseInt(searchParams.get('limit') || '20'),
      100
    );
    const offset = Number.parseInt(searchParams.get('offset') || '0');

    // Get favorited profile IDs
    const favorites = await prisma.favorite.findMany({
      where: {
        userId: user.userId,
      },
      select: {
        targetUserId: true,
      },
    });

    const favoritedUserIds = favorites.map((f) => f.targetUserId);

    // If no favorites, return empty array
    if (favoritedUserIds.length === 0) {
      return successResponse({
        posts: [],
        total: 0,
        hasMore: false,
      });
    }

    // Get posts from favorited profiles
    const posts = await prisma.post.findMany({
      where: {
        authorId: {
          in: favoritedUserIds,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip: offset,
      take: limit + 1, // Take one extra to check if there are more
    });

    // Check if there are more posts
    const hasMore = posts.length > limit;
    const postsToReturn = hasMore ? posts.slice(0, limit) : posts;

    // Get total count
    const totalCount = await prisma.post.count({
      where: {
        authorId: {
          in: favoritedUserIds,
        },
      },
    });

    // Get interaction counts and user states for each post
    const transformedPosts = await Promise.all(
      postsToReturn.map(async (post) => {
        const [likeCount, commentCount, shareCount, userLike, userShare] =
          await Promise.all([
            prisma.reaction.count({
              where: { postId: post.id, type: 'like' },
            }),
            prisma.comment.count({
              where: { postId: post.id },
            }),
            prisma.share.count({
              where: { postId: post.id },
            }),
            prisma.reaction.findUnique({
              where: {
                postId_userId_type: {
                  postId: post.id,
                  userId: user.userId,
                  type: 'like',
                },
              },
            }),
            prisma.share.findUnique({
              where: {
                userId_postId: {
                  userId: user.userId,
                  postId: post.id,
                },
              },
            }),
          ]);

        return {
          id: post.id,
          content: post.content,
          createdAt: post.createdAt,
          timestamp: post.timestamp,
          authorId: post.authorId, // Game actor ID
          gameId: post.gameId,
          dayNumber: post.dayNumber,
          interactions: {
            likeCount,
            commentCount,
            shareCount,
            isLiked: !!userLike,
            isShared: !!userShare,
          },
        };
      })
    );

    return successResponse({
      posts: transformedPosts,
      total: totalCount,
      hasMore,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error fetching favorites feed:', error);
    return errorResponse('Failed to fetch favorites feed');
  }
}
