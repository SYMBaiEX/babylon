/**
 * API Route: /api/posts/[id]/share
 * Methods: POST (share/repost), DELETE (unshare)
 */

import type { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import {
  authenticate,
  authErrorResponse,
  successResponse,
  errorResponse,
} from '@/lib/api/auth-middleware';
import { notifyShare } from '@/lib/services/notification-service';
import { logger } from '@/lib/logger';

const prisma = new PrismaClient();

/**
 * POST /api/posts/[id]/share
 * Share/repost a post to user's feed
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate user
    const user = await authenticate(request);
    const { id: postId } = await params;

    // Validate post ID
    if (!postId) {
      return errorResponse('Post ID is required', 400);
    }

    // Ensure user exists in database (upsert pattern)
    await prisma.user.upsert({
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
    const post = await prisma.post.findUnique({
      where: { id: postId },
    });

    // If post doesn't exist, try to auto-create it based on format
    if (!post) {
      // Try multiple post ID formats
      // Format 1: gameId-gameTimestamp-authorId-isoTimestamp (e.g., babylon-1761441310151-kash-patrol-2025-10-01T02:12:00Z)
      // Format 2: post-{timestamp}-{random} (e.g., post-1762099655817-0.7781412938928327)
      // Format 3: post-{timestamp}-{actorId}-{random} (e.g., post-1762099655817-kash-patrol-abc123)

      let gameId = 'babylon'; // default game
      let authorId = 'system'; // default author for game-generated posts
      let timestamp = new Date();

      // Check Format 1: Has ISO timestamp at the end
      const isoTimestampMatch = postId.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)$/);

      if (isoTimestampMatch && isoTimestampMatch[1]) {
        // Format 1: gameId-gameTimestamp-authorId-isoTimestamp
        const timestampStr = isoTimestampMatch[1];
        timestamp = new Date(timestampStr);

        // Extract gameId (first part before first hyphen)
        const firstHyphenIndex = postId.indexOf('-');
        if (firstHyphenIndex !== -1) {
          gameId = postId.substring(0, firstHyphenIndex);

          // Extract authorId (everything between second hyphen and the ISO timestamp)
          const withoutGameId = postId.substring(firstHyphenIndex + 1);
          const secondHyphenIndex = withoutGameId.indexOf('-');
          if (secondHyphenIndex !== -1) {
            const afterGameTimestamp = withoutGameId.substring(secondHyphenIndex + 1);
            authorId = afterGameTimestamp.substring(0, afterGameTimestamp.lastIndexOf('-' + timestampStr));
          }
        }
      } else if (postId.startsWith('post-')) {
        // Format 2 or 3: GameEngine format
        const parts = postId.split('-');

        if (parts.length >= 3 && parts[1]) {
          // Try to extract timestamp from second part
          const timestampPart = parts[1];
          const timestampNum = parseInt(timestampPart, 10);

          if (!isNaN(timestampNum) && timestampNum > 1000000000000) {
            // Valid timestamp (milliseconds since epoch)
            timestamp = new Date(timestampNum);

            // Check if third part looks like an actor ID (not a decimal)
            if (parts.length >= 4 && parts[2] && !parts[2].includes('.')) {
              // Format 3: post-{timestamp}-{actorId}-{random}
              authorId = parts[2];
            }
            // Otherwise Format 2: post-{timestamp}-{random}
            // Keep default authorId = 'system'
          }
        }
      } else {
        // Unknown format, reject
        return errorResponse('Invalid post ID format', 400);
      }

      // Ensure post exists (upsert pattern)
      await prisma.post.upsert({
        where: { id: postId },
        update: {},  // Don't update if exists
        create: {
          id: postId,
          content: '[Game-generated post]',  // Placeholder content
          authorId,
          gameId,
          timestamp,
        },
      });
    }

    // Check if already shared
    const existingShare = await prisma.share.findUnique({
      where: {
        userId_postId: {
          userId: user.userId,
          postId,
        },
      },
    });

    if (existingShare) {
      return errorResponse('Post already shared', 400);
    }

    // Create share record
    await prisma.share.create({
      data: {
        userId: user.userId,
        postId,
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            username: true,
            profileImageUrl: true,
          },
        },
        post: {
          select: {
            id: true,
            content: true,
            authorId: true,
            createdAt: true,
          },
        },
      },
    });

    // Create a repost post (like a retweet) that shows on user's profile and feed
    // Format: repost-{originalPostId}-{userId}-{timestamp}
    const repostId = `repost-${postId}-${user.userId}-${Date.now()}`;
    
    // Get original post content for repost
    const originalPost = await prisma.post.findUnique({
      where: { id: postId },
      select: {
        content: true,
        authorId: true,
        timestamp: true,
      },
    });

    if (originalPost) {
      // Create repost post with reference to original
      // The content will be the original post content, displayed as a repost
      await prisma.post.create({
        data: {
          id: repostId,
          content: originalPost.content,
          authorId: user.userId, // Repost author is the user who shared
          timestamp: new Date(),
          // Store original post ID in gameId field as metadata (hacky but works)
          gameId: `original:${postId}`,
        },
      });
    }

    // Create notification for post author (if not self-share)
    // Check if author is a User (not an Actor) before notifying
    const postAuthor = await prisma.post.findUnique({
      where: { id: postId },
      select: {
        authorId: true,
        author: {
          select: { id: true },
        },
      },
    });

    if (
      postAuthor &&
      postAuthor.authorId &&
      postAuthor.authorId !== user.userId &&
      postAuthor.author // Only notify if author is a User (not an Actor)
    ) {
      await notifyShare(
        postAuthor.authorId,
        user.userId,
        postId
      );
    }

    // Get updated share count
    const shareCount = await prisma.share.count({
      where: {
        postId,
      },
    });

    return successResponse(
      {
        data: {
          shareCount,
          isShared: true,
        },
      },
      201
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication failed') {
      return authErrorResponse('Unauthorized');
    }
    logger.error('Error sharing post:', error, 'POST /api/posts/[id]/share');
    return errorResponse('Failed to share post');
  }
}

/**
 * DELETE /api/posts/[id]/share
 * Unshare/remove repost
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate user
    const user = await authenticate(request);
    const { id: postId } = await params;

    // Validate post ID
    if (!postId) {
      return errorResponse('Post ID is required', 400);
    }

    // Ensure user exists in database (upsert pattern)
    await prisma.user.upsert({
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
    const share = await prisma.share.findUnique({
      where: {
        userId_postId: {
          userId: user.userId,
          postId,
        },
      },
    });

    if (!share) {
      return errorResponse('Share not found', 404);
    }

    // Delete repost post if it exists
    // Repost posts have IDs like: repost-{originalPostId}-{userId}-{timestamp}
    const repostPosts = await prisma.post.findMany({
      where: {
        authorId: user.userId,
        gameId: {
          startsWith: `original:${postId}`,
        },
      },
    });

    // Delete all repost posts for this share
    if (repostPosts.length > 0) {
      await prisma.post.deleteMany({
        where: {
          id: {
            in: repostPosts.map((p) => p.id),
          },
        },
      });
    }

    // Delete share
    await prisma.share.delete({
      where: {
        id: share.id,
      },
    });

    // Get updated share count
    const shareCount = await prisma.share.count({
      where: {
        postId,
      },
    });

    return successResponse({
      data: {
        shareCount,
        isShared: false,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication failed') {
      return authErrorResponse('Unauthorized');
    }
    logger.error('Error unsharing post:', error, 'DELETE /api/posts/[id]/share');
    return errorResponse('Failed to unshare post');
  }
}
