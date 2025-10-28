/**
 * API Route: /api/posts/[id]/like
 * Methods: POST (like), DELETE (unlike)
 */

import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import {
  authenticate,
  authErrorResponse,
  successResponse,
  errorResponse,
} from '@/lib/api/auth-middleware';

const prisma = new PrismaClient();

/**
 * POST /api/posts/[id]/like
 * Like a post
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

    // Check if already liked
    const existingReaction = await prisma.reaction.findUnique({
      where: {
        postId_userId_type: {
          postId,
          userId: user.userId,
          type: 'like',
        },
      },
    });

    if (existingReaction) {
      return errorResponse('Post already liked', 400);
    }

    // Create like reaction
    const reaction = await prisma.reaction.create({
      data: {
        postId,
        userId: user.userId,
        type: 'like',
      },
    });

    // Get updated like count
    const likeCount = await prisma.reaction.count({
      where: {
        postId,
        type: 'like',
      },
    });

    return successResponse(
      {
        id: reaction.id,
        postId,
        likeCount,
        isLiked: true,
        createdAt: reaction.createdAt,
      },
      201
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication failed') {
      return authErrorResponse('Unauthorized');
    }
    console.error('Error liking post:', error);
    return errorResponse('Failed to like post');
  }
}

/**
 * DELETE /api/posts/[id]/like
 * Unlike a post
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

    // Find existing like
    const reaction = await prisma.reaction.findUnique({
      where: {
        postId_userId_type: {
          postId,
          userId: user.userId,
          type: 'like',
        },
      },
    });

    if (!reaction) {
      return errorResponse('Like not found', 404);
    }

    // Delete like
    await prisma.reaction.delete({
      where: {
        id: reaction.id,
      },
    });

    // Get updated like count
    const likeCount = await prisma.reaction.count({
      where: {
        postId,
        type: 'like',
      },
    });

    return successResponse({
      postId,
      likeCount,
      isLiked: false,
      message: 'Post unliked successfully',
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication failed') {
      return authErrorResponse('Unauthorized');
    }
    console.error('Error unliking post:', error);
    return errorResponse('Failed to unlike post');
  }
}
