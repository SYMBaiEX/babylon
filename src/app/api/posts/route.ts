/**
 * Posts API Route
 * 
 * GET /api/posts - Get recent posts from database
 * POST /api/posts - Create a new post
 */

import { gameService } from '@/lib/game-service';
import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { authenticate, errorResponse, successResponse, optionalAuth } from '@/lib/api/auth-middleware';
import { asUser, asPublic } from '@/lib/db/context';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/lib/logger';
import { broadcastToChannel } from '@/lib/sse/event-broadcaster';
import type { PrismaClient } from '@prisma/client';

/**
 * Safely convert a date value to ISO string
 * Handles Date objects, strings, and null/undefined
 */
function toISOStringSafe(date: Date | string | null | undefined): string {
  if (!date) {
    return new Date().toISOString();
  }
  if (date instanceof Date) {
    return date.toISOString();
  }
  if (typeof date === 'string') {
    // If it's already an ISO string, return it
    if (date.includes('T') && date.includes('Z')) {
      return date;
    }
    // Try to parse and convert
    const parsed = new Date(date);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  // Fallback to current date
  return new Date().toISOString();
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');
    const actorId = searchParams.get('actorId') || undefined;
    const following = searchParams.get('following') === 'true';
    const userId = searchParams.get('userId') || undefined; // For following feed, need userId

    // If following feed is requested, filter by followed users/actors
    if (following && userId) {
      const authUser = await optionalAuth(request as NextRequest).catch(() => null);
      
      const dbOperation = async (db: PrismaClient) => {
        // Get list of followed users
        const userFollows = await db.follow.findMany({
          where: {
            followerId: userId,
          },
          select: {
            followingId: true,
          },
        });

        // Get list of followed actors
        const actorFollows = await db.followStatus.findMany({
          where: {
            userId: userId,
            isActive: true,
          },
          select: {
            npcId: true,
          },
        });

        const followedUserIds = userFollows.map((f) => f.followingId);
        const followedActorIds = actorFollows.map((f) => f.npcId);
        const allFollowedIds = [...followedUserIds, ...followedActorIds];

        if (allFollowedIds.length === 0) {
          return { posts: [], users: [], reactions: [], comments: [], shares: [] };
        }

        // Get posts from followed users/actors
        const posts = await db.post.findMany({
          where: {
            authorId: { in: allFollowedIds },
          },
          orderBy: {
            timestamp: 'desc',
          },
          take: limit,
          skip: offset,
        });

        // Get user data for posts
        const authorIds = [...new Set(posts.map(p => p.authorId))];
        const users = await db.user.findMany({
          where: { id: { in: authorIds } },
          select: { id: true, username: true, displayName: true },
        });
        
        // Get interaction counts for all posts in parallel
        const postIds = posts.map(p => p.id);
        const [allReactions, allComments, allShares] = await Promise.all([
          db.reaction.groupBy({
            by: ['postId'],
            where: { postId: { in: postIds }, type: 'like' },
            _count: { postId: true },
          }),
          db.comment.groupBy({
            by: ['postId'],
            where: { postId: { in: postIds } },
            _count: { postId: true },
          }),
          db.share.groupBy({
            by: ['postId'],
            where: { postId: { in: postIds } },
            _count: { postId: true },
          }),
        ]);

        return { posts, users, reactions: allReactions, comments: allComments, shares: allShares };
      }

      const result = authUser 
        ? await asUser(authUser, dbOperation)
        : await asPublic(dbOperation)

      if (result.posts.length === 0) {
        return NextResponse.json({
          success: true,
          posts: [],
          total: 0,
          limit,
          offset,
          source: 'following',
        });
      }

      const userMap = new Map(result.users.map(u => [u.id, u]));
      const reactionMap = new Map(result.reactions.map(r => [r.postId, r._count.postId]));
      const commentMap = new Map(result.comments.map(c => [c.postId, c._count.postId]));
      const shareMap = new Map(result.shares.map(s => [s.postId, s._count.postId]));
      
      return NextResponse.json({
        success: true,
        posts: result.posts.map((post) => {
          const user = userMap.get(post.authorId);
          return {
            id: post.id,
            content: post.content,
            author: post.authorId,
            authorId: post.authorId,
            authorName: user?.displayName || user?.username || post.authorId,
            authorUsername: user?.username || null,
            timestamp: toISOStringSafe(post.timestamp),
            createdAt: toISOStringSafe(post.createdAt),
            likeCount: reactionMap.get(post.id) ?? 0,
            commentCount: commentMap.get(post.id) ?? 0,
            shareCount: shareMap.get(post.id) ?? 0,
            isLiked: false,
            isShared: false,
          };
        }),
        total: result.posts.length,
        limit,
        offset,
        source: 'following',
      });
    }
    // Get posts from database (GameEngine persists posts here)
    let posts;
    
    logger.info('Fetching posts from database', { limit, offset, actorId, hasActorId: !!actorId }, 'GET /api/posts');
    
    if (actorId) {
      // Get posts by specific actor
      posts = await gameService.getPostsByActor(actorId, limit);
      logger.info('Fetched posts by actor', { actorId, count: posts.length }, 'GET /api/posts');
    } else {
      // Get recent posts from database
      posts = await gameService.getRecentPosts(limit, offset);
      logger.info('Fetched recent posts', { count: posts.length, limit, offset }, 'GET /api/posts');
    }
    
    // Log post structure for debugging
    if (posts.length > 0) {
      const samplePost = posts[0];
      if (samplePost) {
        logger.debug('Sample post structure', {
          id: samplePost.id,
          hasTimestamp: !!samplePost.timestamp,
          timestampType: typeof samplePost.timestamp,
          timestampValue: samplePost.timestamp,
          hasCreatedAt: !!samplePost.createdAt,
          createdAtType: typeof samplePost.createdAt,
          createdAtValue: samplePost.createdAt,
        }, 'GET /api/posts');
      }
    }
    
    // Get unique author IDs to fetch user data
    const authorIds = [...new Set(posts.map(p => p.authorId))];
    const authUser = await optionalAuth(request as NextRequest).catch(() => null);
    
    const dbOperation2 = async (db: PrismaClient) => {
      const usrs = await db.user.findMany({
        where: { id: { in: authorIds } },
        select: { id: true, username: true, displayName: true, profileImageUrl: true },
      });
      
      // Get interaction counts for all posts in parallel
      const postIds = posts.map(p => p.id);
      const [allReactions, allComments, allShares] = await Promise.all([
        db.reaction.groupBy({
          by: ['postId'],
          where: { postId: { in: postIds }, type: 'like' },
          _count: { postId: true },
        }),
        db.comment.groupBy({
          by: ['postId'],
          where: { postId: { in: postIds } },
          _count: { postId: true },
        }),
        db.share.groupBy({
          by: ['postId'],
          where: { postId: { in: postIds } },
          _count: { postId: true },
        }),
      ]);
      
      return { users: usrs, reactions: allReactions, comments: allComments, shares: allShares };
    }

    const { users, reactions, comments, shares } = authUser 
      ? await asUser(authUser, dbOperation2)
      : await asPublic(dbOperation2)
    
    const userMap = new Map(users.map(u => [u.id, u]));
    
    // Create maps for quick lookup
    const reactionMap = new Map(reactions.map(r => [r.postId, r._count.postId]));
    const commentMap = new Map(comments.map(c => [c.postId, c._count.postId]));
    const shareMap = new Map(shares.map(s => [s.postId, s._count.postId]));
    
    // Format posts to match FeedPost interface
    const formattedPosts = posts.map((post) => {
      try {
        // Validate post structure
        if (!post || !post.id) {
          logger.warn('Invalid post structure detected', { post }, 'GET /api/posts');
          return null;
        }
        
        const user = userMap.get(post.authorId);
        
        // Safely convert dates with null checks
        const timestamp = toISOStringSafe(post.timestamp);
        const createdAt = toISOStringSafe(post.createdAt);
        
        return {
          id: post.id,
          content: post.content || '',
          author: post.authorId, // Use authorId as author
          authorId: post.authorId,
          authorName: user?.displayName || user?.username || post.authorId || 'Unknown',
          authorUsername: user?.username || null,
          authorProfileImageUrl: user?.profileImageUrl || null,
          timestamp,
          createdAt,
          gameId: post.gameId || undefined,
          dayNumber: post.dayNumber || undefined,
          likeCount: reactionMap.get(post.id) ?? 0,
          commentCount: commentMap.get(post.id) ?? 0,
          shareCount: shareMap.get(post.id) ?? 0,
          isLiked: false, // Will be updated by interaction store polling
          isShared: false, // Will be updated by interaction store polling
        };
      } catch (error) {
        logger.error('Error formatting post', { error, postId: post?.id, post }, 'GET /api/posts');
        return null;
      }
    }).filter((post): post is NonNullable<typeof post> => post !== null);
    
    logger.info('Formatted posts', { 
      originalCount: posts.length, 
      formattedCount: formattedPosts.length,
      filteredOut: posts.length - formattedPosts.length 
    }, 'GET /api/posts');
    
    // Next.js 16: Add cache headers for real-time feeds
    // Use 'no-store' to ensure fresh data for real-time updates
    // This prevents stale data in client-side caches
    logger.info('Returning formatted posts', { 
      postCount: formattedPosts.length,
      total: formattedPosts.length,
      limit,
      offset 
    }, 'GET /api/posts');
    
    const response = NextResponse.json({
      success: true,
      posts: formattedPosts,
      total: formattedPosts.length,
      limit,
      offset,
    });
    
    // Real-time feeds should not be cached (no-store)
    // This ensures WebSocket updates reflect immediately
    response.headers.set('Cache-Control', 'no-store, must-revalidate');
    
    return response;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    logger.error('API Error in GET /api/posts', {
      error: errorMessage,
      stack: errorStack,
      errorType: error?.constructor?.name,
      errorString: String(error),
    }, 'GET /api/posts');
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to load posts',
        message: process.env.NODE_ENV === 'development' ? errorMessage : undefined
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/posts - Create a new post
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const authUser = await authenticate(request);

    // Parse request body
    const body = await request.json();
    const { content } = body;

    // Validate input
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return errorResponse('Post content is required', 400);
    }

    if (content.length > 280) {
      return errorResponse('Post content must be 280 characters or less', 400);
    }

    // Ensure user exists in database and fetch with username/displayName
    const { dbUser, post } = await asUser(authUser, async (db) => {
      let usr = await db.user.findUnique({
        where: { id: authUser.userId },
        select: {
          id: true,
          username: true,
          displayName: true,
          profileImageUrl: true,
        },
      });

      if (!usr) {
        // Create user if they don't exist yet
        usr = await db.user.create({
          data: {
            id: authUser.userId,
            isActor: false,
          },
          select: {
            id: true,
            username: true,
            displayName: true,
            profileImageUrl: true,
          },
        });
      }

      // Create post
      const newPost = await db.post.create({
        data: {
          id: uuidv4(),
          content: content.trim(),
          authorId: authUser.userId,
          timestamp: new Date(),
        },
        include: {
          comments: false,
          reactions: false,
          shares: false,
        },
      });

      return { dbUser: usr, post: newPost };
    });

    // Determine author name for display (prefer username or displayName, fallback to generated name)
    const authorName = dbUser.username || dbUser.displayName || `user_${authUser.userId.slice(0, 8)}`;

    // Broadcast new post to SSE feed channel for real-time updates
    try {
      broadcastToChannel('feed', {
        type: 'new_post',
        post: {
          id: post.id,
          content: post.content,
          authorId: post.authorId,
          authorName: authorName,
          authorUsername: dbUser.username,
          authorDisplayName: dbUser.displayName,
          authorProfileImageUrl: dbUser.profileImageUrl,
          timestamp: post.timestamp.toISOString(),
        },
      });
      logger.info('Broadcast new user post to feed channel', { postId: post.id }, 'POST /api/posts');
    } catch (error) {
      logger.error('Failed to broadcast post to SSE:', error, 'POST /api/posts');
      // Don't fail the request if SSE broadcast fails
    }

    return successResponse({
      success: true,
      post: {
        id: post.id,
        content: post.content,
        authorId: post.authorId,
        authorName: authorName,
        authorUsername: dbUser.username,
        authorDisplayName: dbUser.displayName,
        authorProfileImageUrl: dbUser.profileImageUrl,
        timestamp: post.timestamp.toISOString(),
        createdAt: post.createdAt.toISOString(),
      },
    });
  } catch (error) {
    logger.error('Error creating post:', error, 'POST /api/posts');
    
    if (error instanceof Error && error.message === 'Authentication failed') {
      return errorResponse('Authentication required', 401);
    }
    
    return errorResponse('Failed to create post', 500);
  }
}
