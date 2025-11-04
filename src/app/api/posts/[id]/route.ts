/**
 * API Route: /api/posts/[id]
 * Methods: GET (get single post details)
 */

import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/database-service';
import { optionalAuth } from '@/lib/api/auth-middleware';
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler';
import { BusinessLogicError, NotFoundError } from '@/lib/errors';
import { IdParamSchema } from '@/lib/validation/schemas';
import { logger } from '@/lib/logger';
import { gameService } from '@/lib/game-service';

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
      const postContent = '[Game-generated post]'; // Default placeholder
      let authorId = 'system'; // default author
      let gameId = 'babylon'; // default game
      let timestamp = new Date();

      // First, try to get post from game store/realtime feed
      let gamePost: {
        id: string;
        content: string;
        authorId: string;
        author?: string;
        timestamp: string | Date;
        createdAt?: string | Date;
        gameId?: string | null;
      } | null = null;

      try {
        // Try realtime posts first (most recent)
        const realtimeResult = await gameService.getRealtimePosts(1000, 0);
        if (realtimeResult) {
          const foundPost = realtimeResult.posts.find(p => p.id === postId);
          if (foundPost) {
            gamePost = foundPost;
          }
        }

        // If not found in realtime, try database posts (synced posts)
        if (!gamePost) {
          const dbPosts = await gameService.getRecentPosts(1000, 0);
          const foundPost = dbPosts.find(p => p.id === postId);
          if (foundPost) {
            gamePost = {
              ...foundPost,
              timestamp: foundPost.timestamp instanceof Date ? foundPost.timestamp.toISOString() : foundPost.timestamp,
              createdAt: foundPost.createdAt instanceof Date ? foundPost.createdAt.toISOString() : foundPost.createdAt,
            };
          }
        }
      } catch (gameStoreError) {
        // If game store fetch fails, log and continue to fallback
        logger.debug('Could not fetch post from game store:', gameStoreError, 'GET /api/posts/[id]');
      }

      // If found in game store, return it directly (don't need to create in DB)
      if (gamePost) {
        // Get interaction counts from database (post might have interactions even if not fully synced)
        const [likeCount, commentCount, shareCount] = await Promise.all([
          prisma.reaction.count({ where: { postId, type: 'like' } }).catch(() => 0),
          prisma.comment.count({ where: { postId } }).catch(() => 0),
          prisma.share.count({ where: { postId } }).catch(() => 0),
        ]);

        // Get author name
        let authorName = gamePost.authorId;
        let authorUsername: string | null = null;
        try {
          const actor = await prisma.actor.findUnique({
            where: { id: gamePost.authorId },
            select: { name: true },
          });
          if (actor) {
            authorName = actor.name;
          } else {
            const userRecord = await prisma.user.findUnique({
              where: { id: gamePost.authorId },
              select: { displayName: true, username: true },
            });
            if (userRecord) {
              authorName = userRecord.displayName || userRecord.username || gamePost.authorId;
              authorUsername = userRecord.username || null;
            }
          }
        } catch {
          // Use authorId as fallback
        }

        // Check if user liked/shared
        const isLiked = user
          ? (await prisma.reaction.findFirst({
              where: { postId, userId: user.userId, type: 'like' },
            }).catch(() => null)) !== null
          : false;
        const isShared = user
          ? (await prisma.share.findFirst({
              where: { postId, userId: user.userId },
            }).catch(() => null)) !== null
          : false;

        const timestampStr = gamePost.timestamp instanceof Date 
          ? gamePost.timestamp.toISOString() 
          : (gamePost.timestamp || new Date().toISOString());
        const createdAtStr = gamePost.createdAt instanceof Date
          ? gamePost.createdAt.toISOString()
          : (gamePost.createdAt || timestampStr);

        return successResponse({
          data: {
            id: gamePost.id,
            content: gamePost.content,
            authorId: gamePost.authorId,
            authorName: authorName,
            authorUsername: authorUsername,
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

      // If not found in game store, try to parse ID format and create placeholder
      // Fallback: Try to parse post ID format
      // Format 1: gameId-gameTimestamp-authorId-isoTimestamp
      // Format 2: post-{timestamp}-{random} (e.g., post-1762099655817-0.7781412938928327)
      // Format 3: post-{timestamp}-{actorId}-{random}

      const isoTimestampMatch = postId.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)$/);

      if (isoTimestampMatch && isoTimestampMatch[1]) {
        // Format 1
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
        // Format 2 or 3
        const parts = postId.split('-');
        if (parts.length >= 3 && parts[1]) {
          const timestampPart = parts[1];
          const timestampNum = parseInt(timestampPart, 10);
          if (!isNaN(timestampNum) && timestampNum > 1000000000000) {
            timestamp = new Date(timestampNum);
            if (parts.length >= 4 && parts[2] && !parts[2].includes('.')) {
              const potentialActorId = parts[2];
              try {
                const actor = await prisma.actor.findUnique({
                  where: { id: potentialActorId },
                  select: { id: true },
                });
                if (actor) {
                  authorId = potentialActorId;
                }
              } catch (actorError) {
                logger.debug('Could not lookup actor:', actorError, 'GET /api/posts/[id]');
              }
            }
          }
        }
      }

      // Try to create the post in the database using upsert (only if not found in game store)
      try {
        const upsertedPost = await prisma.post.upsert({
          where: { id: postId },
          update: {}, // Don't update if exists
          create: {
            id: postId,
            content: postContent,
            authorId: authorId,
            gameId: gameId,
            timestamp: timestamp,
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
        post = upsertedPost;
      } catch (upsertError) {
        // If upsert fails, try to fetch again
        const errorMessage = upsertError instanceof Error ? upsertError.message : String(upsertError);
        logger.error('Failed to upsert post:', { error: errorMessage, postId }, 'GET /api/posts/[id]');
        
        post = await prisma.post.findUnique({
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

        // If still not found, throw 404
        if (!post) {
          throw new NotFoundError('Post', postId);
        }
      }
    }

    // Validate post exists
    if (!post) {
      logger.error('Post is null after all attempts:', { postId }, 'GET /api/posts/[id]');
      throw new NotFoundError('Post', postId);
    }

    // Get author name, username, and profile image from database
    let authorName = post.authorId;
    let authorUsername: string | null = null;
    let authorProfileImageUrl: string | null = null;
    try {
      // Try to get actor from database first
      const actor = await prisma.actor.findUnique({
        where: { id: post.authorId },
        select: { name: true, profileImageUrl: true },
      });
      if (actor) {
        authorName = actor.name;
        authorProfileImageUrl = actor.profileImageUrl || null;
      } else {
        // Check if it's a User instead of an Actor
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
    } catch (error) {
      // Fallback to authorId if actor/user lookup fails
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.debug('Could not load author name:', { error: errorMessage, authorId: post.authorId }, 'GET /api/posts/[id]');
    }

    // Return database post
    // Safely check reactions and shares - Prisma may return undefined even when included
    const reactionsArray = post.reactions && Array.isArray(post.reactions) ? post.reactions : [];
    const sharesArray = post.shares && Array.isArray(post.shares) ? post.shares : [];

    logger.info('Post fetched successfully', { postId, source: 'database' }, 'GET /api/posts/[id]');

    return successResponse({
      data: {
        id: post.id,
        content: post.content,
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

