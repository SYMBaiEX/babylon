/**
 * API Route: /api/posts/[id]
 * Methods: GET (get single post details)
 */

import { optionalAuth } from '@/lib/api/auth-middleware';
import { prisma } from '@/lib/database-service';
import { BusinessLogicError } from '@/lib/errors';
import { successResponse, withErrorHandling } from '@/lib/errors/error-handler';
import { gameService } from '@/lib/game-service';
import { logger } from '@/lib/logger';
import { IdParamSchema } from '@/lib/validation/schemas';
import type { NextRequest } from 'next/server';

/**
 * GET /api/posts/[id]
 * Get a single post by ID
 */
export const GET = withErrorHandling(async (
  request: NextRequest,
  context?: { params: Promise<{ id: string }> }
) => {
  const params = await (context?.params || Promise.reject(new BusinessLogicError('Missing route context', 'MISSING_CONTEXT')));
  const { id: postId } = IdParamSchema.parse(params);

  // Optional authentication (to show liked status for logged-in users)
  const user = await optionalAuth(request);

    // Try to get post from database first
    let post = await prisma.post.findUnique({
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
          : {
              where: {
                userId: 'never-match',
                type: 'like',
              },
              select: {
                id: true,
              },
            },
        shares: user
          ? {
              where: {
                userId: user.userId,
              },
              select: {
                id: true,
              },
            }
          : {
              where: {
                userId: 'never-match',
              },
              select: {
                id: true,
              },
            },
      },
    });

    // If not in database, try to find it in game store/realtime feed first
    if (!post) {
      // Try realtime posts first (most recent)
      const realtimeResult = await gameService.getRealtimePosts(1000, 0);
      const realtimePost = realtimeResult?.posts.find(p => p.id === postId);
      
      let gamePost = realtimePost;
      
      // If not found in realtime, try database posts (synced posts)
      if (!gamePost) {
        const dbPosts = await gameService.getRecentPosts(1000, 0);
        const foundPost = dbPosts.find(p => p.id === postId);
        if (foundPost) {
          gamePost = {
            ...foundPost,
            author: foundPost.authorId,
            timestamp: foundPost.timestamp instanceof Date ? foundPost.timestamp.toISOString() : foundPost.timestamp,
            createdAt: foundPost.createdAt instanceof Date ? foundPost.createdAt.toISOString() : foundPost.createdAt,
          } as typeof realtimePost;
        }
      }

      // If found in game store, return it directly
      if (gamePost) {
        const [likeCount, commentCount, shareCount] = await Promise.all([
          prisma.reaction.count({ where: { postId, type: 'like' } }),
          prisma.comment.count({ where: { postId } }),
          prisma.share.count({ where: { postId } }),
        ]);

        const actor = await prisma.actor.findUnique({
          where: { id: gamePost.authorId },
          select: { name: true },
        });
        
        let authorName = gamePost.authorId;
        let authorUsername: string | null = null;
        
        if (actor) {
          authorName = actor.name;
        } else {
          const userRecord = await prisma.user.findUnique({
            where: { id: gamePost.authorId },
            select: { displayName: true, username: true },
          });
          if (userRecord) {
            authorName = userRecord.displayName || userRecord.username || gamePost.authorId;
            authorUsername = userRecord.username;
          }
        }

        const isLiked = user
          ? (await prisma.reaction.findFirst({
              where: { postId, userId: user.userId, type: 'like' },
            })) !== null
          : false;
        const isShared = user
          ? (await prisma.share.findFirst({
              where: { postId, userId: user.userId },
            })) !== null
          : false;

        const timestampStr = gamePost.timestamp as string;
        const createdAtStr = (gamePost.createdAt || timestampStr) as string;

        return successResponse({
          data: {
            id: gamePost.id,
            type: 'post',
            content: gamePost.content,
            fullContent: null,
            articleTitle: null,
            byline: null,
            biasScore: null,
            sentiment: null,
            slant: null,
            category: null,
            authorId: gamePost.authorId,
            authorName,
            authorUsername,
            authorAvatar: undefined,
            isActorPost: true,
            timestamp: timestampStr,
            createdAt: createdAtStr,
            likeCount,
            commentCount,
            shareCount,
            isLiked,
            isShared,
            source: 'game-store',
          },
        });
      }

      let authorId = 'system';
      let gameId = 'babylon';
      let timestamp = new Date();

      const isoTimestampMatch = postId.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)$/);

      if (isoTimestampMatch?.[1]) {
        const timestampStr = isoTimestampMatch[1];
        timestamp = new Date(timestampStr);
        const firstHyphenIndex = postId.indexOf('-');
        if (firstHyphenIndex !== -1) {
          gameId = postId.substring(0, firstHyphenIndex);
          const withoutGameId = postId.substring(firstHyphenIndex + 1);
          const secondHyphenIndex = withoutGameId.indexOf('-');
          if (secondHyphenIndex !== -1) {
            const afterGameTimestamp = withoutGameId.substring(secondHyphenIndex + 1);
            authorId = afterGameTimestamp.substring(0, afterGameTimestamp.lastIndexOf('-' + timestampStr));
          }
        }
      } else if (postId.startsWith('post-')) {
        const parts = postId.split('-');
        if (parts.length >= 3 && parts[1]) {
          const timestampNum = parseInt(parts[1], 10);
          if (!isNaN(timestampNum) && timestampNum > 1000000000000) {
            timestamp = new Date(timestampNum);
            if (parts.length >= 4 && parts[2] && !parts[2].includes('.')) {
              const potentialActorId = parts[2];
              const actor = await prisma.actor.findUnique({
                where: { id: potentialActorId },
                select: { id: true },
              });
              if (actor) {
                authorId = potentialActorId;
              }
            }
          }
        }
      }

      post = await prisma.post.upsert({
        where: { id: postId },
        update: {},
        create: {
          id: postId,
          content: '[Game-generated post]',
          authorId,
          gameId,
          timestamp,
        },
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
            : {
                where: {
                  userId: 'never-match',
                  type: 'like',
                },
                select: {
                  id: true,
                },
              },
          shares: user
            ? {
                where: {
                  userId: user.userId,
                },
                select: {
                  id: true,
                },
              }
            : {
                where: {
                  userId: 'never-match',
                },
                select: {
                  id: true,
                },
              },
        },
      });
    }

    let authorName = post.authorId;
    let authorUsername: string | null = null;
    let authorProfileImageUrl: string | null = null;
    
    const actor = await prisma.actor.findUnique({
      where: { id: post.authorId },
      select: { name: true, profileImageUrl: true },
    });
    if (actor) {
      authorName = actor.name;
      authorProfileImageUrl = actor.profileImageUrl || null;
    } else {
      const user = await prisma.user.findUnique({
        where: { id: post.authorId },
        select: { displayName: true, username: true, profileImageUrl: true },
      });
      if (user) {
        authorName = user.displayName || user.username || post.authorId;
        authorUsername = user.username || null;
        authorProfileImageUrl = user.profileImageUrl || null;
      }
    }

    // Return database post
    // Safely check reactions and shares - Prisma may return undefined even when included
    const reactionsArray = post.reactions && Array.isArray(post.reactions) ? post.reactions : [];
    const sharesArray = post.shares && Array.isArray(post.shares) ? post.shares : [];

    logger.info('Post fetched successfully', { postId, source: 'database' }, 'GET /api/posts/[id]');

    return successResponse({
      data: {
        id: post.id,
        type: post.type || 'post',
        content: post.content,
        fullContent: post.fullContent || null,
        articleTitle: post.articleTitle || null,
        byline: post.byline || null,
        biasScore: post.biasScore !== undefined ? post.biasScore : null,
        sentiment: post.sentiment || null,
        slant: post.slant || null,
        category: post.category || null,
        authorId: post.authorId,
        authorName: authorName,
        authorUsername: authorUsername,
        authorProfileImageUrl: authorProfileImageUrl,
        authorAvatar: authorProfileImageUrl || undefined,
        isActorPost: true, // Posts are from game actors
        timestamp: post.timestamp ? post.timestamp.toISOString() : post.createdAt.toISOString(),
        createdAt: post.createdAt.toISOString(),
        likeCount: post._count?.reactions ?? 0,
        commentCount: post._count?.comments ?? 0,
        shareCount: post._count?.shares ?? 0,
        isLiked: reactionsArray.length > 0,
        isShared: sharesArray.length > 0,
        source: 'database',
      },
    });
});

