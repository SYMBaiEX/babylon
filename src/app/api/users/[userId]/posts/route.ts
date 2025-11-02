/**
 * API Route: /api/users/[userId]/posts
 * Methods: GET (get user posts and comments/replies)
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
 * GET /api/users/[userId]/posts
 * Get user's posts and comments/replies
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'posts'; // 'posts' or 'replies'

    if (!userId) {
      return errorResponse('User ID is required', 400);
    }

    // Optional authentication
    const user = await optionalAuth(request);

    if (type === 'replies') {
      // Get user's comments (replies)
      // Verify user exists first
      const dbUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      
      if (!dbUser) {
        return successResponse({
          type: 'replies',
          items: [],
          total: 0,
        });
      }
      
      // Get user's comments (replies) - query by authorId
      const comments = await prisma.comment.findMany({
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
              author: {
                select: {
                  id: true,
                  displayName: true,
                  username: true,
                  profileImageUrl: true,
                },
              },
              authorActor: {
                select: {
                  id: true,
                  name: true,
                  profileImageUrl: true,
                },
              },
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

      // Format comments as replies
      const replies = comments.map((comment) => ({
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
          author: comment.post.author
            ? {
                id: comment.post.author.id,
                displayName: comment.post.author.displayName,
                username: comment.post.author.username,
                profileImageUrl: comment.post.author.profileImageUrl,
              }
            : comment.post.authorActor
              ? {
                  id: comment.post.authorActor.id,
                  displayName: comment.post.authorActor.name,
                  username: null,
                  profileImageUrl: comment.post.authorActor.profileImageUrl,
                }
              : null,
        },
      }));

      return successResponse({
        type: 'replies',
        items: replies,
        total: replies.length,
      });
    } else {
      // Get user's posts
      const posts = await prisma.post.findMany({
        where: {
          authorId: userId,
          // Exclude reposts (posts with replyTo field will be handled separately)
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
      const shares = await prisma.share.findMany({
        where: {
          userId: userId,
        },
        include: {
          post: {
            include: {
              author: {
                select: {
                  id: true,
                  displayName: true,
                  username: true,
                  profileImageUrl: true,
                },
              },
              authorActor: {
                select: {
                  id: true,
                  name: true,
                  profileImageUrl: true,
                },
              },
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
        author: post.author
          ? {
              id: post.author.id,
              displayName: post.author.displayName,
              username: post.author.username,
              profileImageUrl: post.author.profileImageUrl,
            }
          : null,
      }));

      // Format shares as reposts
      const reposts = shares.map((share) => ({
        id: `share-${share.id}`,
        content: share.post.content,
        authorId: share.post.authorId,
        timestamp: share.createdAt.toISOString(),
        createdAt: share.createdAt.toISOString(),
        likeCount: share.post._count.reactions,
        commentCount: share.post._count.comments,
        shareCount: share.post._count.shares,
        isLiked: false, // Could check if user liked original post
        isShared: true,
        isRepost: true,
        // originalPostId: share.post.id,  // Temporarily removed due to DB mismatch
        author: share.post.author
          ? {
              id: share.post.author.id,
              displayName: share.post.author.displayName,
              username: share.post.author.username,
              profileImageUrl: share.post.author.profileImageUrl,
            }
          : share.post.authorActor
            ? {
                id: share.post.authorActor.id,
                displayName: share.post.authorActor.name,
                username: null,
                profileImageUrl: share.post.authorActor.profileImageUrl,
              }
            : null,
      }));

      // Combine and sort by timestamp
      const allItems = [...formattedPosts, ...reposts].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      return successResponse({
        type: 'posts',
        items: allItems,
        total: allItems.length,
      });
    }
  } catch (error) {
    logger.error('Error fetching user posts/comments:', error, 'GET /api/users/[userId]/posts');
    return errorResponse('Failed to fetch posts/comments');
  }
}

