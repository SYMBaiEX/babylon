/**
 * Posts API Route
 * 
 * GET /api/posts - Get recent posts from database
 * POST /api/posts - Create a new post
 */

import { gameService } from '@/lib/game-service';
import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { authenticate, errorResponse, successResponse } from '@/lib/api/auth-middleware';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/lib/logger';

const prisma = new PrismaClient();

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
      // Get list of followed users
      const userFollows = await prisma.follow.findMany({
        where: {
          followerId: userId,
        },
        select: {
          followingId: true,
        },
      });

      // Get list of followed actors
      const actorFollows = await prisma.followStatus.findMany({
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
        // User is not following anyone
        return NextResponse.json({
          success: true,
          posts: [],
          total: 0,
          limit,
          offset,
          source: 'following',
        });
      }

      // Get posts from followed users/actors
      const posts = await prisma.post.findMany({
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
      const users = await prisma.user.findMany({
        where: { id: { in: authorIds } },
        select: { id: true, username: true, displayName: true },
      });
      const userMap = new Map(users.map(u => [u.id, u]));
      
      // Get interaction counts for all posts in parallel
      const postIds = posts.map(p => p.id);
      const [allReactions, allComments, allShares] = await Promise.all([
        prisma.reaction.groupBy({
          by: ['postId'],
          where: { postId: { in: postIds }, type: 'like' },
          _count: { postId: true },
        }),
        prisma.comment.groupBy({
          by: ['postId'],
          where: { postId: { in: postIds } },
          _count: { postId: true },
        }),
        prisma.share.groupBy({
          by: ['postId'],
          where: { postId: { in: postIds } },
          _count: { postId: true },
        }),
      ]);
      
      // Create maps for quick lookup
      const reactionMap = new Map(allReactions.map(r => [r.postId, r._count.postId]));
      const commentMap = new Map(allComments.map(c => [c.postId, c._count.postId]));
      const shareMap = new Map(allShares.map(s => [s.postId, s._count.postId]));
      
      return NextResponse.json({
        success: true,
        posts: posts.map((post) => {
          const user = userMap.get(post.authorId);
          return {
            id: post.id,
            content: post.content,
            author: post.authorId,
            authorId: post.authorId,
            authorName: user?.displayName || user?.username || post.authorId,
            authorUsername: user?.username || null,
            timestamp: post.timestamp.toISOString(),
            createdAt: post.createdAt.toISOString(),
            likeCount: reactionMap.get(post.id) ?? 0,
            commentCount: commentMap.get(post.id) ?? 0,
            shareCount: shareMap.get(post.id) ?? 0,
            isLiked: false,
            isShared: false,
          };
        }),
        total: posts.length,
        limit,
        offset,
        source: 'following',
      });
    }
    // Get posts from database (GameEngine persists posts here)
    let posts;
    
    if (actorId) {
      // Get posts by specific actor
      posts = await gameService.getPostsByActor(actorId, limit);
    } else {
      // Get recent posts from database
      posts = await gameService.getRecentPosts(limit, offset);
    }
    
    // Get unique author IDs to fetch user data
    const authorIds = [...new Set(posts.map(p => p.authorId))];
    const users = await prisma.user.findMany({
      where: { id: { in: authorIds } },
      select: { id: true, username: true, displayName: true },
    });
    const userMap = new Map(users.map(u => [u.id, u]));
    
    // Get interaction counts for all posts in parallel
    const postIds = posts.map(p => p.id);
    const [allReactions, allComments, allShares] = await Promise.all([
      prisma.reaction.groupBy({
        by: ['postId'],
        where: { postId: { in: postIds }, type: 'like' },
        _count: { postId: true },
      }),
      prisma.comment.groupBy({
        by: ['postId'],
        where: { postId: { in: postIds } },
        _count: { postId: true },
      }),
      prisma.share.groupBy({
        by: ['postId'],
        where: { postId: { in: postIds } },
        _count: { postId: true },
      }),
    ]);
    
    // Create maps for quick lookup
    const reactionMap = new Map(allReactions.map(r => [r.postId, r._count.postId]));
    const commentMap = new Map(allComments.map(c => [c.postId, c._count.postId]));
    const shareMap = new Map(allShares.map(s => [s.postId, s._count.postId]));
    
    // Format posts to match FeedPost interface
    const formattedPosts = posts.map((post) => {
      const user = userMap.get(post.authorId);
      return {
        id: post.id,
        content: post.content,
        author: post.authorId, // Use authorId as author
        authorId: post.authorId,
        authorName: user?.displayName || user?.username || post.authorId,
        authorUsername: user?.username || null,
        timestamp: post.timestamp.toISOString(),
        createdAt: post.createdAt.toISOString(),
        gameId: post.gameId || undefined,
        dayNumber: post.dayNumber || undefined,
        likeCount: reactionMap.get(post.id) ?? 0,
        commentCount: commentMap.get(post.id) ?? 0,
        shareCount: shareMap.get(post.id) ?? 0,
        isLiked: false, // Will be updated by interaction store polling
        isShared: false, // Will be updated by interaction store polling
      };
    });
    
    // Next.js 16: Add cache headers for real-time feeds
    // Use 'no-store' to ensure fresh data for real-time updates
    // This prevents stale data in client-side caches
    const response = NextResponse.json({
      success: true,
      posts: formattedPosts,
      total: posts.length,
      limit,
      offset,
    });
    
    // Real-time feeds should not be cached (no-store)
    // This ensures WebSocket updates reflect immediately
    response.headers.set('Cache-Control', 'no-store, must-revalidate');
    
    return response;
  } catch (error) {
    logger.error('API Error:', error, 'GET /api/posts');
    return NextResponse.json(
      { success: false, error: 'Failed to load posts' },
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
    let dbUser = await prisma.user.findUnique({
      where: { id: authUser.userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        profileImageUrl: true,
      },
    });

    if (!dbUser) {
      // Create user if they don't exist yet
      dbUser = await prisma.user.create({
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
    const post = await prisma.post.create({
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

    // Determine author name for display (prefer username or displayName, fallback to generated name)
    const authorName = dbUser.username || dbUser.displayName || `user_${authUser.userId.slice(0, 8)}`;

    // Broadcast new post to WebSocket feed channel for real-time updates
    try {
      const { broadcastToChannel } = await import('@/app/api/ws/chat/route');
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
      logger.error('Failed to broadcast post to WebSocket:', error, 'POST /api/posts');
      // Don't fail the request if WebSocket broadcast fails
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
