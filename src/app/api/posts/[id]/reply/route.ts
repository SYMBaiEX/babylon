/**
 * API Route: /api/posts/[id]/reply
 * Methods: POST (reply to a post with rate limiting and quality checks)
 */

import type { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import {
  authenticate,
  authErrorResponse,
  successResponse,
  errorResponse,
} from '@/lib/api/auth-middleware';
import { ReplyRateLimiter } from '@/services/ReplyRateLimiter';
import { MessageQualityChecker } from '@/services/MessageQualityChecker';
import { FollowingMechanics } from '@/services/FollowingMechanics';
import { GroupChatInvite } from '@/services/GroupChatInvite';
import { logger } from '@/lib/logger';
import { parsePostId } from '@/lib/post-id-parser';

const prisma = new PrismaClient();

/**
 * POST /api/posts/[id]/reply
 * Reply to a post with comprehensive checks
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Authenticate user
    const user = await authenticate(request);
    const { id: postId } = await params;

    if (!postId) {
      return errorResponse('Post ID is required', 400);
    }

    // 2. Parse request body
    const body = await request.json();
    const { content } = body;

    if (!content || typeof content !== 'string') {
      return errorResponse('Reply content is required', 400);
    }

    if (content.trim().length === 0) {
      return errorResponse('Reply cannot be empty', 400);
    }

    // 3. Extract NPC/author ID from post ID
    const parseResult = parsePostId(postId);
    
    // Require valid format for replies (unlike likes, which can use defaults)
    if (!parseResult.success) {
      return errorResponse('Invalid post ID format', 400);
    }

    const { gameId, authorId: npcId, timestamp } = parseResult.metadata;

    // 4. Check rate limiting
    const rateLimitResult = await ReplyRateLimiter.canReply(user.userId, npcId);

    if (!rateLimitResult.allowed) {
      return errorResponse(rateLimitResult.reason || 'Rate limit exceeded', 429);
    }

    // 5. Check message quality
    const qualityResult = await MessageQualityChecker.checkQuality(
      content,
      user.userId,
      'reply',
      postId
    );

    if (!qualityResult.passed) {
      return errorResponse(
        qualityResult.errors.join('; '),
        400
      );
    }

    // 6. Ensure user exists in database
    await prisma.user.upsert({
      where: { id: user.userId },
      update: {
        walletAddress: user.walletAddress,
      },
      create: {
        id: user.userId,
        walletAddress: user.walletAddress,
        displayName: user.walletAddress
          ? `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}`
          : 'Anonymous',
        isActor: false,
      },
    });

    // 7. Ensure post exists (upsert pattern)
    await prisma.post.upsert({
      where: { id: postId },
      update: {},
      create: {
        id: postId,
        content: '[Game-generated post]',
        authorId: npcId,
        gameId,
        timestamp,
      },
    });

    // 8. Create comment
    const comment = await prisma.comment.create({
      data: {
        content: content.trim(),
        postId,
        authorId: user.userId,
      },
      include: {
        author: {
          select: {
            id: true,
            displayName: true,
            username: true,
            profileImageUrl: true,
          },
        },
      },
    });

    // 9. Record the interaction
    await ReplyRateLimiter.recordReply(
      user.userId,
      npcId,
      postId,
      comment.id,
      qualityResult.score
    );

    // 10. Check for following chance
    const followingChance = await FollowingMechanics.calculateFollowingChance(
      user.userId,
      npcId,
      rateLimitResult.replyStreak || 0,
      qualityResult.score
    );

    let followed = false;
    if (followingChance.willFollow) {
      await FollowingMechanics.recordFollow(
        user.userId,
        npcId,
        `Streak: ${rateLimitResult.replyStreak}, Quality: ${qualityResult.score.toFixed(2)}`
      );
      followed = true;
    }

    // 11. Check for group chat invite chance (only if followed)
    let invitedToChat = false;
    let chatInfo = null;

    if (followed || (await FollowingMechanics.isFollowing(user.userId, npcId))) {
      const inviteChance = await GroupChatInvite.calculateInviteChance(user.userId, npcId);

      if (inviteChance.willInvite && inviteChance.chatId && inviteChance.chatName) {
        await GroupChatInvite.recordInvite(
          user.userId,
          npcId,
          inviteChance.chatId,
          inviteChance.chatName
        );
        invitedToChat = true;
        chatInfo = {
          chatId: inviteChance.chatId,
          chatName: inviteChance.chatName,
          isOwned: inviteChance.isOwned,
        };
      }
    }

    // 12. Return success with all the feedback
    return successResponse(
      {
        comment: {
          id: comment.id,
          content: comment.content,
          postId: comment.postId,
          authorId: comment.authorId,
          createdAt: comment.createdAt,
          author: comment.author,
        },
        quality: {
          score: qualityResult.score,
          warnings: qualityResult.warnings,
          factors: qualityResult.factors,
        },
        streak: {
          current: rateLimitResult.replyStreak || 0,
          reason: rateLimitResult.reason,
        },
        following: {
          followed,
          probability: followingChance.probability,
          reasons: followingChance.reasons,
        },
        groupChat: {
          invited: invitedToChat,
          ...(chatInfo || {}),
        },
      },
      201
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication failed') {
      return authErrorResponse('Unauthorized');
    }
    logger.error('Error creating reply:', error, 'POST /api/posts/[id]/reply');
    return errorResponse('Failed to create reply');
  }
}


