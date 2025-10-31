/**
 * API Route: /api/posts/[id]/share
 * Methods: POST (share/repost), DELETE (unshare)
 */

import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import {
  authenticate,
  authErrorResponse,
  successResponse,
  errorResponse,
} from '@/lib/api/auth-middleware';
import { notifyShare } from '@/lib/services/notification-service';

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

    // Auto-create post if it doesn't exist
    // PostId format: gameId-gameTimestamp-authorId-timestamp
    // Example: babylon-1761441310151-kash-patrol-2025-10-01T02:12:00Z
    
    // Extract ISO timestamp from the end (matches YYYY-MM-DDTHH:mm:ssZ pattern)
    const isoTimestampMatch = postId.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)$/);

    if (!isoTimestampMatch || !isoTimestampMatch[1]) {
      return errorResponse('Invalid post ID format - no valid timestamp', 400);
    }

    const timestampStr = isoTimestampMatch[1];
    
    // Extract gameId (first part before first hyphen)
    const firstHyphenIndex = postId.indexOf('-');
    if (firstHyphenIndex === -1) {
      return errorResponse('Invalid post ID format', 400);
    }
    const gameId = postId.substring(0, firstHyphenIndex);
    
    // Extract authorId (everything between second hyphen and the ISO timestamp)
    const parts = postId.split('-');
    if (parts.length < 3) {
      return errorResponse('Invalid post ID format', 400);
    }
    
    // AuthorId is everything between gameId+gameTimestamp and the ISO timestamp
    // Remove gameId, remove timestamp at end, extract what's left
    const withoutGameId = postId.substring(firstHyphenIndex + 1);
    const secondHyphenIndex = withoutGameId.indexOf('-');
    if (secondHyphenIndex === -1) {
      return errorResponse('Invalid post ID format', 400);
    }
    const afterGameTimestamp = withoutGameId.substring(secondHyphenIndex + 1);
    const authorId = afterGameTimestamp.substring(0, afterGameTimestamp.lastIndexOf('-' + timestampStr));

    if (!gameId || !authorId) {
      return errorResponse('Invalid post ID format', 400);
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

    // Ensure post exists (upsert pattern)
    await prisma.post.upsert({
      where: { id: postId },
      update: {},  // Don't update if exists
      create: {
        id: postId,
        content: '[Game-generated post]',  // Placeholder content
        authorId,
        gameId,
        timestamp: new Date(timestampStr),
      },
    });

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

    // Create share
    const share = await prisma.share.create({
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

    // Create notification for post author (if not self-share)
    if (authorId !== user.userId) {
      await notifyShare(
        authorId,
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
        id: share.id,
        postId,
        shareCount,
        isShared: true,
        createdAt: share.createdAt,
        user: share.user,
        post: share.post,
      },
      201
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication failed') {
      return authErrorResponse('Unauthorized');
    }
    console.error('Error sharing post:', error);
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
      postId,
      shareCount,
      isShared: false,
      message: 'Post unshared successfully',
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication failed') {
      return authErrorResponse('Unauthorized');
    }
    console.error('Error unsharing post:', error);
    return errorResponse('Failed to unshare post');
  }
}
