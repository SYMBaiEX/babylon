/**
 * API Route: /api/posts/[id]/share
 * Methods: POST (share/repost), DELETE (unshare)
 */

import type { NextRequest } from 'next/server';
import { authenticate } from '@/lib/api/auth-middleware';
import { asUser } from '@/lib/db/context';
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler';
import { BusinessLogicError, NotFoundError } from '@/lib/errors';
import { IdParamSchema, SharePostSchema } from '@/lib/validation/schemas';
import { notifyShare } from '@/lib/services/notification-service';
import { logger } from '@/lib/logger';
import { parsePostId } from '@/lib/post-id-parser';

/**
 * POST /api/posts/[id]/share
 * Share/repost a post to user's feed
 */
export const POST = withErrorHandling(async (
  request: NextRequest,
  context?: { params: Promise<{ id: string }> }
) => {
  // Authenticate user
  const user = await authenticate(request);
  const params = await (context?.params || Promise.reject(new BusinessLogicError('Missing route context', 'MISSING_CONTEXT')));
  const { id: postId } = IdParamSchema.parse(params);
  
  // Parse and validate request body (optional comment)
  const body = await request.json().catch(() => ({}));
  if (Object.keys(body).length > 0) {
    SharePostSchema.parse(body);
  }

  // Share post with RLS
  const { shareCount } = await asUser(user, async (db) => {
    // Ensure user exists in database (upsert pattern)
    await db.user.upsert({
      where: { id: user.userId },
      update: {
        walletAddress: user.walletAddress,
      },
      create: {
        id: user.userId,
        walletAddress: user.walletAddress,
        displayName: user.walletAddress ? `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}` : 'Anonymous',
        isActor: false,
      },
    });

    // Check if post exists first
    let post = await db.post.findUnique({
      where: { id: postId },
    });

    // If post doesn't exist, try to auto-create it based on format
    if (!post) {
      // Parse post ID to extract metadata
      const parseResult = parsePostId(postId);

      // Require valid format for shares (unlike likes, which can use defaults)
      if (!parseResult.success) {
        throw new BusinessLogicError('Invalid post ID format', 'INVALID_POST_ID_FORMAT');
      }

      const { gameId, authorId, timestamp } = parseResult.metadata;

      // Ensure post exists (upsert pattern)
      post = await db.post.upsert({
        where: { id: postId },
        update: {},
        create: {
          id: postId,
          content: '[Game-generated post]',
          authorId,
          gameId,
          timestamp,
        },
      });
    }

    // Check if already shared
    const existingShare = await db.share.findUnique({
      where: {
        userId_postId: {
          userId: user.userId,
          postId,
        },
      },
    });

    if (existingShare) {
      throw new BusinessLogicError('Post already shared', 'ALREADY_SHARED');
    }

    // Create share record
    await db.share.create({
      data: {
        userId: user.userId,
        postId,
      },
    });

    // Create a repost post (like a retweet) that shows on user's profile and feed
    // Format: repost-{originalPostId}-{userId}-{timestamp}
    const repostId = `repost-${postId}-${user.userId}-${Date.now()}`;
    
    // Get original post content for repost
    const originalPost = await db.post.findUnique({
      where: { id: postId },
      select: {
        content: true,
        authorId: true,
        timestamp: true,
      },
    });

    if (originalPost) {
      // Create repost post with reference to original
      await db.post.create({
        data: {
          id: repostId,
          content: originalPost.content,
          authorId: user.userId,
          timestamp: new Date(),
        },
      });
    }

    // Create notification for post author (if not self-share)
    // Check if author is a User (not an Actor) before notifying
    const postAuthor = await db.post.findUnique({
      where: { id: postId },
      select: {
        authorId: true,
      },
    });

    if (
      postAuthor &&
      postAuthor.authorId &&
      postAuthor.authorId !== user.userId
    ) {
      // Check if the authorId references a User (not an Actor)
      const postAuthorUser = await db.user.findUnique({
        where: { id: postAuthor.authorId },
        select: { id: true },
      });
      
      if (postAuthorUser) {
        await notifyShare(
          postAuthor.authorId,
          user.userId,
          postId
        );
      }
    }

    // Get updated share count
    const count = await db.share.count({
      where: {
        postId,
      },
    });

    return { shareCount: count };
  });

  logger.info('Post shared successfully', { postId, userId: user.userId, shareCount }, 'POST /api/posts/[id]/share');

  return successResponse(
    {
      data: {
        shareCount,
        isShared: true,
      },
    },
    201
  );
});

/**
 * DELETE /api/posts/[id]/share
 * Unshare/remove repost
 */
export const DELETE = withErrorHandling(async (
  request: NextRequest,
  context?: { params: Promise<{ id: string }> }
) => {
  // Authenticate user
  const user = await authenticate(request);
  const params = await (context?.params || Promise.reject(new BusinessLogicError('Missing route context', 'MISSING_CONTEXT')));
  const { id: postId } = IdParamSchema.parse(params);

  // Unshare post with RLS
  const shareCount = await asUser(user, async (db) => {
    // Ensure user exists in database (upsert pattern)
    await db.user.upsert({
      where: { id: user.userId },
      update: {
        walletAddress: user.walletAddress,
      },
      create: {
        id: user.userId,
        walletAddress: user.walletAddress,
        displayName: user.walletAddress ? `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}` : 'Anonymous',
        isActor: false,
      },
    });

    // Find existing share
    const share = await db.share.findUnique({
      where: {
        userId_postId: {
          userId: user.userId,
          postId,
        },
      },
    });

    if (!share) {
      throw new NotFoundError('Share', `${postId}-${user.userId}`);
    }

    // Delete repost post if it exists
    // Repost posts have IDs like: repost-{originalPostId}-{userId}-{timestamp}
    const repostIdPattern = `repost-${postId}-${user.userId}-`;
    // Fetch all repost posts by this user and filter by pattern
    const allReposts = await db.post.findMany({
      where: {
        authorId: user.userId,
        id: { contains: repostIdPattern },
      },
    });
    const repostPosts = allReposts.filter(p => p.id.startsWith(repostIdPattern));

    // Delete all repost posts for this share
    if (repostPosts.length > 0) {
      await db.post.deleteMany({
        where: {
          id: {
            in: repostPosts.map((p) => p.id),
          },
        },
      });
    }

    // Delete share
    await db.share.delete({
      where: {
        id: share.id,
      },
    });

    // Get updated share count
    const count = await db.share.count({
      where: {
        postId,
      },
    });

    return count;
  });

  logger.info('Post unshared successfully', { postId, userId: user.userId, shareCount }, 'DELETE /api/posts/[id]/share');

  return successResponse({
    data: {
      shareCount,
      isShared: false,
    },
  });
});
