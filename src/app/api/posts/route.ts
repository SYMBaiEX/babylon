/**
 * Posts API Route
 * 
 * GET /api/posts - Get recent posts from database
 * POST /api/posts - Create a new post
 */

import { authenticate, errorResponse, isAuthenticationError, successResponse } from '@/lib/api/auth-middleware';
import { getCacheOrFetch } from '@/lib/cache-service';
import { cachedDb } from '@/lib/cached-database-service';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { generateSnowflakeId } from '@/lib/snowflake';
import { broadcastToChannel } from '@/lib/sse/event-broadcaster';
import { ensureUserForAuth } from '@/lib/users/ensure-user';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { trackServerEvent } from '@/lib/posthog/server';
import { checkRateLimitAndDuplicates, RATE_LIMIT_CONFIGS, DUPLICATE_DETECTION_CONFIGS } from '@/lib/rate-limiting';
import { notifyMention } from '@/lib/services/notification-service';

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

/**
 * Parse repost content to extract metadata
 * Returns null if not a repost, otherwise returns parsed data
 */
function parseRepostContent(content: string): {
  isRepost: true;
  quoteComment: string | null;
  originalContent: string;
  originalAuthorUsername: string;
} | null {
  const separatorPattern = /\n\n--- Reposted from @(.+?) ---\n/;
  const match = content.match(separatorPattern);
  
  if (!match) return null;
  
  const parts = content.split(separatorPattern);
  const quoteComment = parts[0]?.trim() || null;
  const originalContent = parts[2]?.trim() || '';
  const originalAuthorUsername = match[1] || '';
  
  return {
    isRepost: true,
    quoteComment,
    originalContent,
    originalAuthorUsername,
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');
    const actorId = searchParams.get('actorId') || undefined;
    const following = searchParams.get('following') === 'true';
    const userId = searchParams.get('userId') || undefined; // For following feed, need userId
    const type = searchParams.get('type') || undefined; // Filter by post type (article, post, etc.)

    // If following feed is requested, filter by followed users/actors
    if (following && userId) {
      // Cache key for user's follows
      const followsCacheKey = `follows:${userId}`;
      
      // Get list of followed users/actors with caching
      const allFollowedIds = await getCacheOrFetch(
        followsCacheKey,
        async () => {
          const [userFollows, actorFollows, legacyActorFollows] = await Promise.all([
            prisma.follow.findMany({
              where: { followerId: userId },
              select: { followingId: true },
            }),
            prisma.userActorFollow.findMany({
              where: { userId: userId },
              select: { actorId: true },
            }),
            prisma.followStatus.findMany({
              where: { 
                userId: userId, 
                isActive: true,
                followReason: 'user_followed',
              },
              select: { npcId: true },
            }),
          ]);

          const followedUserIds = userFollows.map((f) => f.followingId);
          const followedActorIds = new Set<string>();
          actorFollows.forEach((f) => followedActorIds.add(f.actorId));
          legacyActorFollows.forEach((f) => followedActorIds.add(f.npcId));
          return [...followedUserIds, ...Array.from(followedActorIds)];
        },
        {
          namespace: 'user:follows',
          ttl: 120, // Cache follows for 2 minutes
        }
      );

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

      // Get posts from followed users/actors with caching
      const posts = await cachedDb.getPostsForFollowing(
        userId,
        allFollowedIds,
        limit,
        offset
      );

      // Get user data for posts
      const authorIds = [...new Set(posts.map(p => p.authorId).filter((id): id is string => id !== undefined))];
      const users = await prisma.user.findMany({
        where: { id: { in: authorIds } },
        select: { id: true, username: true, displayName: true },
      });
      const userMap = new Map(users.map(u => [u.id, u]));
      
      // Get interaction counts for all posts in parallel
      const postIds = posts.map(p => p.id);
      const [allReactions, allComments] = await Promise.all([
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
      ]);
      
      // Create maps for quick lookup
      const reactionMap = new Map(allReactions.map(r => [r.postId, r._count.postId]));
      const commentMap = new Map(allComments.map(c => [c.postId, c._count.postId]));
      
      // OPTIMIZED: Batch repost metadata lookups to avoid N+1
      // First, identify all reposts and extract original usernames
      const repostDataMap = new Map<string, ReturnType<typeof parseRepostContent>>();
      const originalUsernames = new Set<string>();
      
      for (const post of posts) {
        const repostData = parseRepostContent(post.content || '');
        if (repostData) {
          repostDataMap.set(post.id, repostData);
          originalUsernames.add(repostData.originalAuthorUsername);
        }
      }

      // Batch lookup original authors (users and actors)
      const originalAuthorsMap = new Map<string, { id: string; name: string; username: string; profileImageUrl: string | null }>();
      
      if (originalUsernames.size > 0) {
        const usernameArray = Array.from(originalUsernames);
        const [originalUsers, originalActors] = await Promise.all([
          prisma.user.findMany({
            where: { username: { in: usernameArray } },
            select: { id: true, username: true, displayName: true, profileImageUrl: true },
          }),
          prisma.actor.findMany({
            where: { id: { in: usernameArray } },
            select: { id: true, name: true, profileImageUrl: true },
          }),
        ]);

        // Map users
        for (const user of originalUsers) {
          originalAuthorsMap.set(user.username!, {
            id: user.id,
            name: user.displayName || user.username || user.id,
            username: user.username!,
            profileImageUrl: user.profileImageUrl,
          });
        }

        // Map actors
        for (const actor of originalActors) {
          originalAuthorsMap.set(actor.id, {
            id: actor.id,
            name: actor.name,
            username: actor.id,
            profileImageUrl: actor.profileImageUrl,
          });
        }

        // Batch lookup share records for all reposters
        const reposterIds = posts.filter(p => repostDataMap.has(p.id)).map(p => p.authorId).filter((id): id is string => !!id);
        const shareRecords = await prisma.share.findMany({
          where: { userId: { in: reposterIds } },
          select: { postId: true, userId: true },
          orderBy: { createdAt: 'desc' },
        });

        const shareMap = new Map(shareRecords.map(s => [s.userId, s.postId]));

        // Build repost metadata lookup
        const repostMetadataMap = new Map<string, Record<string, unknown>>();
        for (const [postId, repostData] of repostDataMap.entries()) {
          if (!repostData) continue; // Skip null entries
          
          const originalAuthor = originalAuthorsMap.get(repostData.originalAuthorUsername);
          const post = posts.find(p => p.id === postId);
          const shareRecord = post?.authorId ? shareMap.get(post.authorId) : undefined;

          if (originalAuthor) {
            repostMetadataMap.set(postId, {
              isRepost: true,
              quoteComment: repostData.quoteComment,
              originalContent: repostData.originalContent,
              originalPostId: shareRecord ?? null,
              originalAuthorId: originalAuthor.id,
              originalAuthorName: originalAuthor.name,
              originalAuthorUsername: originalAuthor.username,
              originalAuthorProfileImageUrl: originalAuthor.profileImageUrl,
            });
          } else {
            repostMetadataMap.set(postId, {
              isRepost: true,
              quoteComment: repostData.quoteComment,
              originalContent: repostData.originalContent,
              originalPostId: null,
              originalAuthorId: repostData.originalAuthorUsername,
              originalAuthorName: repostData.originalAuthorUsername,
              originalAuthorUsername: repostData.originalAuthorUsername,
              originalAuthorProfileImageUrl: null,
            });
          }
        }

        // Format following posts synchronously using lookup maps
        const formattedFollowingPosts = posts.map((post) => {
          const user = post.authorId ? userMap.get(post.authorId) : undefined;
          const repostMetadata = repostMetadataMap.get(post.id) || {};
          
          return {
            id: post.id,
            content: post.content,
            author: post.authorId,
            authorId: post.authorId,
            authorName: user?.displayName || user?.username || post.authorId || 'Unknown',
            authorUsername: user?.username || null,
            timestamp: toISOStringSafe(post.timestamp),
            createdAt: toISOStringSafe(post.createdAt),
            likeCount: reactionMap.get(post.id) ?? 0,
            commentCount: commentMap.get(post.id) ?? 0,
            shareCount: 0, // Share count not currently tracked in feed
            isLiked: false,
            isShared: false,
            ...repostMetadata,
          };
        });
        
        return NextResponse.json({
          success: true,
          posts: formattedFollowingPosts,
          limit,
          offset,
          source: 'following',
        });
      }
    }
    // Get posts from database with caching
    let posts;
    
    logger.info('Fetching posts from database (with cache)', { limit, offset, actorId, type, hasActorId: !!actorId, hasType: !!type }, 'GET /api/posts');
    
    if (type) {
      // Filter by type (e.g., 'article')
      logger.info('Filtering posts by type', { type, limit, offset }, 'GET /api/posts');
      posts = await prisma.post.findMany({
        where: { 
          type,
          deletedAt: null, // Filter out deleted posts
        },
        orderBy: { timestamp: 'desc' },
        take: limit,
        skip: offset,
      });
      logger.info('Fetched posts by type', { type, count: posts.length }, 'GET /api/posts');
    } else if (actorId) {
      // Get posts by specific actor (cached)
      posts = await cachedDb.getPostsByActor(actorId, limit);
      logger.info('Fetched posts by actor (cached)', { actorId, count: posts.length }, 'GET /api/posts');
    } else {
      // Get recent posts from database (cached)
      posts = await cachedDb.getRecentPosts(limit, offset);
      logger.info('Fetched recent posts (cached)', { count: posts.length, limit, offset }, 'GET /api/posts');
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
    
    // Get unique author IDs to fetch author data (users, actors, or organizations)
    const authorIds = [...new Set(posts.map(p => p.authorId).filter((id): id is string => id !== undefined))];
    const [users, actors, organizations] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: authorIds } },
        select: { id: true, username: true, displayName: true, profileImageUrl: true },
      }),
      prisma.actor.findMany({
        where: { id: { in: authorIds } },
        select: { id: true, name: true, profileImageUrl: true },
      }),
      prisma.organization.findMany({
        where: { id: { in: authorIds } },
        select: { id: true, name: true, imageUrl: true },
      }),
    ]);
    const userMap = new Map(users.map(u => [u.id, u]));
    const actorMap = new Map(actors.map(a => [a.id, a]));
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
    const formattedPosts = await Promise.all(posts.map(async (post) => {
      try {
        // Validate post structure
        if (!post || !post.id) {
          logger.warn('Invalid post structure detected', { post }, 'GET /api/posts');
          return null;
        }
        
        // Look up author from user, actor, or organization
        const user = post.authorId ? userMap.get(post.authorId) : undefined;
        const actor = post.authorId ? actorMap.get(post.authorId) : undefined;
        const org = post.authorId ? orgMap.get(post.authorId) : undefined;
        
        // Determine author info based on what was found
        let authorName = post.authorId || 'Unknown';
        let authorUsername: string | null = null;
        let authorProfileImageUrl: string | null = null;
        
        if (actor) {
          authorName = actor.name;
          // Use database profileImageUrl or construct path from actor ID
          authorProfileImageUrl = actor.profileImageUrl || `/images/actors/${actor.id}.jpg`;
        } else if (org) {
          authorName = org.name;
          // Use database imageUrl or construct path from organization ID  
          authorProfileImageUrl = org.imageUrl || `/images/organizations/${org.id}.jpg`;
        } else if (user) {
          authorName = user.displayName || user.username || post.authorId || 'Unknown';
          authorUsername = user.username || null;
          authorProfileImageUrl = user.profileImageUrl || null;
        }
        
        // Safely convert dates with null checks
        const timestamp = toISOStringSafe(post.timestamp);
        const createdAt = toISOStringSafe(post.createdAt);
        
        // Parse repost metadata if this is a repost
        const repostData = parseRepostContent(post.content || '');
        let repostMetadata = {};
        
        if (repostData) {
          // Look up original author by username (could be User, Actor, or Organization)
          const originalAuthor = await prisma.user.findUnique({
            where: { username: repostData.originalAuthorUsername },
            select: { id: true, username: true, displayName: true, profileImageUrl: true },
          }) || await prisma.actor.findFirst({
            where: { id: repostData.originalAuthorUsername },
            select: { id: true, name: true, profileImageUrl: true },
          }) || await prisma.organization.findFirst({
            where: { id: repostData.originalAuthorUsername },
            select: { id: true, name: true, imageUrl: true },
          });
          
          if (originalAuthor) {
            // Find the Share record for this repost to get the original post ID
            // Look for shares by this author where the original post author matches
            const shareRecord = await prisma.share.findFirst({
              where: { 
                userId: post.authorId || '',
                Post: {
                  authorId: originalAuthor.id
                }
              },
              orderBy: { createdAt: 'desc' },
              select: { postId: true },
            });
            
            let originalPostId = shareRecord?.postId || null;
            
            // If Share lookup failed, try to find the original post by content and author
            if (!originalPostId && repostData.originalContent) {
              const originalPost = await prisma.post.findFirst({
                where: {
                  authorId: originalAuthor.id,
                  content: repostData.originalContent,
                  deletedAt: null,
                },
                orderBy: { timestamp: 'desc' },
                select: { id: true },
              });
              originalPostId = originalPost?.id || null;
            }
            
            repostMetadata = {
              isRepost: true,
              quoteComment: repostData.quoteComment,
              originalContent: repostData.originalContent,
              originalPostId: originalPostId,
              originalAuthorId: originalAuthor.id,
              originalAuthorName: 'name' in originalAuthor ? originalAuthor.name : (originalAuthor.displayName || originalAuthor.username),
              originalAuthorUsername: 'username' in originalAuthor ? originalAuthor.username : originalAuthor.id,
              originalAuthorProfileImageUrl: 'imageUrl' in originalAuthor ? originalAuthor.imageUrl : (originalAuthor.profileImageUrl || null),
            };
          } else {
            // Even if we can't find the original author, still mark as repost
            // This prevents showing the separator text in the UI
            repostMetadata = {
              isRepost: true,
              quoteComment: repostData.quoteComment,
              originalContent: repostData.originalContent,
              originalPostId: null,
              originalAuthorId: repostData.originalAuthorUsername, // Use username as fallback ID
              originalAuthorName: repostData.originalAuthorUsername,
              originalAuthorUsername: repostData.originalAuthorUsername,
              originalAuthorProfileImageUrl: null,
            };
          }
        }
        
        return {
          id: post.id,
          type: post.type || undefined,
          content: post.content || '',
          fullContent: post.fullContent || undefined,
          articleTitle: post.articleTitle || undefined,
          byline: post.byline || undefined,
          biasScore: post.biasScore !== undefined ? post.biasScore : undefined,
          sentiment: post.sentiment || undefined,
          slant: post.slant || undefined,
          category: post.category || undefined,
          author: post.authorId, // Use authorId as author
          authorId: post.authorId,
          authorName,
          authorUsername,
          authorProfileImageUrl,
          timestamp,
          createdAt,
          gameId: post.gameId || undefined,
          dayNumber: post.dayNumber || undefined,
          likeCount: reactionMap.get(post.id) ?? 0,
          commentCount: commentMap.get(post.id) ?? 0,
          shareCount: shareMap.get(post.id) ?? 0,
          isLiked: false, // Will be updated by interaction store polling
          isShared: false, // Will be updated by interaction store polling
          ...repostMetadata, // Add repost metadata if applicable
        };
      } catch (error) {
        logger.error('Error formatting post', { error, postId: post?.id, post }, 'GET /api/posts');
        return null;
      }
    })).then(posts => posts.filter((post): post is NonNullable<typeof post> => post !== null));
    
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

    // Apply rate limiting and duplicate detection
    const rateLimitError = checkRateLimitAndDuplicates(
      authUser.userId,
      content,
      RATE_LIMIT_CONFIGS.CREATE_POST,
      DUPLICATE_DETECTION_CONFIGS.POST
    );
    if (rateLimitError) {
      return rateLimitError;
    }

    const fallbackDisplayName = authUser.walletAddress
      ? `${authUser.walletAddress.slice(0, 6)}...${authUser.walletAddress.slice(-4)}`
      : 'Anonymous';

    const { user: canonicalUser } = await ensureUserForAuth(authUser, {
      displayName: fallbackDisplayName,
    });
    const canonicalUserId = canonicalUser.id;

    // Create post with Snowflake ID
    const post = await prisma.post.create({
      data: {
        id: generateSnowflakeId(),
        content: content.trim(),
        authorId: canonicalUserId,
        timestamp: new Date(),
      },
      include: {
        Comment: false,
        Reaction: false,
        Share: false,
      },
    });

    // Determine author name for display (prefer username or displayName, fallback to generated name)
    const authorName = canonicalUser.username || canonicalUser.displayName || `user_${authUser.userId.slice(0, 8)}`;

    // Invalidate post caches
    try {
      await cachedDb.invalidatePostsCache();
      await cachedDb.invalidateActorPostsCache(canonicalUserId);
      logger.info('Invalidated post caches', { postId: post.id }, 'POST /api/posts');
    } catch (error) {
      logger.error('Failed to invalidate post caches:', error, 'POST /api/posts');
      // Don't fail the request if cache invalidation fails
    }

    // Broadcast new post to SSE feed channel for real-time updates
    try {
      broadcastToChannel('feed', {
        type: 'new_post',
        post: {
          id: post.id,
          content: post.content,
          authorId: post.authorId,
          authorName: authorName,
          authorUsername: canonicalUser.username,
          authorDisplayName: canonicalUser.displayName,
          authorProfileImageUrl: canonicalUser.profileImageUrl,
          timestamp: post.timestamp.toISOString(),
        },
      });
      logger.info('Broadcast new user post to feed channel', { postId: post.id }, 'POST /api/posts');
    } catch (error) {
      logger.error('Failed to broadcast post to SSE:', error, 'POST /api/posts');
      // Don't fail the request if SSE broadcast fails
    }

    // Extract and notify mentioned users (@username)
    try {
      const mentions = content.match(/@(\w+)/g);
      if (mentions && mentions.length > 0) {
        const usernames = [...new Set(mentions.map(m => m.substring(1)))]; // Remove @ and deduplicate
        
        // Look up users by username
        const mentionedUsers = await prisma.user.findMany({
          where: {
            username: { in: usernames },
          },
          select: { id: true, username: true },
        });

        // Send notifications to mentioned users
        await Promise.all(
          mentionedUsers.map(mentionedUser =>
            notifyMention(
              mentionedUser.id,
              canonicalUserId,
              post.id,
              undefined // No commentId for post mentions
            ).catch(error => {
              logger.warn('Failed to send mention notification', { 
                error, 
                mentionedUserId: mentionedUser.id,
                mentionedUsername: mentionedUser.username,
                postId: post.id
              }, 'POST /api/posts');
            })
          )
        );

        logger.info('Sent mention notifications', { 
          postId: post.id, 
          mentionCount: mentionedUsers.length,
          mentionedUsernames: mentionedUsers.map(u => u.username)
        }, 'POST /api/posts');
      }
    } catch (error) {
      logger.error('Failed to process mentions:', error, 'POST /api/posts');
      // Don't fail the request if mention processing fails
    }

    // Track post creation with PostHog
    trackServerEvent(canonicalUserId, 'post_created', {
      postId: post.id,
      contentLength: content.trim().length,
      hasUsername: Boolean(canonicalUser.username),
    }).catch((trackError) => {
      logger.warn('Failed to track post creation with PostHog', { error: trackError });
    });

    return successResponse({
      success: true,
      post: {
        id: post.id,
        content: post.content,
        authorId: post.authorId,
        authorName: authorName,
          authorUsername: canonicalUser.username,
          authorDisplayName: canonicalUser.displayName,
          authorProfileImageUrl: canonicalUser.profileImageUrl,
        timestamp: post.timestamp.toISOString(),
        createdAt: post.createdAt.toISOString(),
      },
    });
  } catch (error) {
    logger.error('Error creating post:', error, 'POST /api/posts');
    
    if (isAuthenticationError(error)) {
      const message =
        (error instanceof Error && error.message) || 'Authentication required';
      return errorResponse(message, 401);
    }
    
    return errorResponse('Failed to create post', 500);
  }
}
