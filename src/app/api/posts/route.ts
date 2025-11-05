/**
 * Posts API Route
 * 
 * GET /api/posts - Get recent posts from database
 * POST /api/posts - Create a new post
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { authenticate, errorResponse, successResponse } from '@/lib/api/auth-middleware';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/lib/logger';
import { broadcastToChannelSafe as broadcastToChannel } from '@/lib/websocket-utils';
import { generateTagsFromPost } from '@/lib/services/tag-generation-service';
import { storeTagsForPost } from '@/lib/services/tag-storage-service';
import { prisma } from '@/lib/prisma';


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
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '100');
  const offset = parseInt(searchParams.get('offset') || '0');
  const actorId = searchParams.get('actorId') || undefined;
  const type = searchParams.get('type') || undefined;
  const following = searchParams.get('following') === 'true';
  const userId = searchParams.get('userId') || undefined;

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
            timestamp: toISOStringSafe(post.timestamp),
            createdAt: toISOStringSafe(post.createdAt),
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
    logger.info('Fetching posts from database', { limit, offset, actorId, type, hasActorId: !!actorId }, 'GET /api/posts');
    
    // Build where clause
    const whereClause: {authorId?: string; type?: string} = {};
    if (actorId) whereClause.authorId = actorId;
    if (type) whereClause.type = type;
    
    // Query posts directly with filters
    const posts = await prisma.post.findMany({
      where: whereClause,
      orderBy: { timestamp: 'desc' },
      take: limit,
      skip: offset,
    });
    
    logger.info('Fetched posts', { count: posts.length, limit, offset, actorId, type }, 'GET /api/posts');
    
    // Get unique author IDs to fetch user/organization data
    const authorIds = [...new Set(posts.map(p => p.authorId))];
    
    // Fetch both users and organizations
    const [users, organizations] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: authorIds } },
        select: { id: true, username: true, displayName: true, profileImageUrl: true },
      }),
      prisma.organization.findMany({
        where: { id: { in: authorIds } },
        select: { id: true, name: true },
      }),
    ]);
    
    const userMap = new Map(users.map(u => [u.id, u]));
    const orgMap = new Map(organizations.map(o => [o.id, o]));
    
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
      const org = orgMap.get(post.authorId);
      
      const timestamp = toISOStringSafe(post.timestamp);
      const createdAt = toISOStringSafe(post.createdAt);
      
      const authorName = org?.name || user?.displayName || user?.username || post.authorId;
      
      return {
        id: post.id,
        type: post.type,
        content: post.content,
        fullContent: post.fullContent,
        articleTitle: post.articleTitle,
        byline: post.byline,
        biasScore: post.biasScore,
        sentiment: post.sentiment,
        slant: post.slant,
        category: post.category,
        author: post.authorId,
        authorId: post.authorId,
        authorName,
        authorUsername: user?.username || null,
        authorProfileImageUrl: user?.profileImageUrl || null,
        timestamp,
        createdAt,
        gameId: post.gameId,
        dayNumber: post.dayNumber,
        likeCount: reactionMap.get(post.id) ?? 0,
        commentCount: commentMap.get(post.id) ?? 0,
        shareCount: shareMap.get(post.id) ?? 0,
        isLiked: false,
        isShared: false,
      };
    });
    
  const response = NextResponse.json({
    success: true,
    posts: formattedPosts,
    total: formattedPosts.length,
    limit,
    offset,
  });
  
  response.headers.set('Cache-Control', 'no-store, must-revalidate');
  
  return response;
}

/**
 * POST /api/posts - Create a new post
 */
export async function POST(request: NextRequest) {
  const authUser = await authenticate(request);

  const body = await request.json();
  const { content } = body;

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return errorResponse('Post content is required', 400);
  }

  if (content.length > 280) {
    return errorResponse('Post content must be 280 characters or less', 400);
  }

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

  const authorName = dbUser.username || dbUser.displayName || `user_${authUser.userId.slice(0, 8)}`;

  void (async () => {
    const tags = await generateTagsFromPost(post.content);
    if (tags.length > 0) {
      await storeTagsForPost(post.id, tags);
    }
  })();

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
}
