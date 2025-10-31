/**
 * Posts API Route
 * 
 * GET /api/posts - Get recent posts from database
 * POST /api/posts - Create a new post
 */

import { gameService } from '@/lib/game-service';
import { NextRequest, NextResponse } from 'next/server';
import { authenticate, errorResponse, successResponse } from '@/lib/api/auth-middleware';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

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

      return NextResponse.json({
        success: true,
        posts: posts.map((post) => ({
          id: post.id,
          content: post.content,
          author: post.authorId,
          authorId: post.authorId,
          timestamp: post.timestamp.toISOString(),
          createdAt: post.createdAt.toISOString(),
        })),
        total: posts.length,
        limit,
        offset,
        source: 'following',
      });
    }

    // Prefer realtime history when available
    const realtimeResult = await gameService.getRealtimePosts(limit, offset, actorId || undefined);
    if (realtimeResult && realtimeResult.posts.length > 0) {
      return NextResponse.json({
        success: true,
        posts: realtimeResult.posts,
        total: realtimeResult.total,
        limit,
        offset,
        source: 'realtime',
      });
    }

    let posts;
    
    if (actorId) {
      // Get posts by specific actor
      posts = await gameService.getPostsByActor(actorId, limit);
    } else {
      // Get recent posts
      posts = await gameService.getRecentPosts(limit, offset);
    }
    
    return NextResponse.json({
      success: true,
      posts,
      total: posts.length,
      limit,
      offset,
    });
  } catch (error) {
    console.error('API Error:', error);
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
    const { content, replyTo } = body;

    // Validate input
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return errorResponse('Post content is required', 400);
    }

    if (content.length > 280) {
      return errorResponse('Post content must be 280 characters or less', 400);
    }

    // Ensure user exists in database
    let dbUser = await prisma.user.findUnique({
      where: { id: authUser.userId },
    });

    if (!dbUser) {
      // Create user if they don't exist yet
      dbUser = await prisma.user.create({
        data: {
          id: authUser.userId,
          isActor: false,
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

    return successResponse({
      success: true,
      post: {
        id: post.id,
        content: post.content,
        authorId: post.authorId,
        timestamp: post.timestamp.toISOString(),
        createdAt: post.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error creating post:', error);
    
    if (error instanceof Error && error.message === 'Authentication failed') {
      return errorResponse('Authentication required', 401);
    }
    
    return errorResponse('Failed to create post', 500);
  }
}
