/**
 * API Route: /api/posts/[id]/reply
 * Methods: POST (reply to a post with rate limiting and quality checks)
 */

import type { NextRequest } from 'next/server';
import { authenticate } from '@/lib/api/auth-middleware';
import { asUser } from '@/lib/db/context';
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler';
import { BusinessLogicError } from '@/lib/errors';
import { IdParamSchema, ReplyToPostSchema } from '@/lib/validation/schemas';
import { ReplyRateLimiter } from '@/lib/services/reply-rate-limiter';
import { MessageQualityChecker } from '@/lib/services/message-quality-checker';
import { FollowingMechanics } from '@/lib/services/following-mechanics';
import { GroupChatInvite } from '@/lib/services/group-chat-invite';
import { logger } from '@/lib/logger';
import { parsePostId } from '@/lib/post-id-parser';

/**
 * POST /api/posts/[id]/reply
 * Reply to a post with comprehensive checks
 */
export const POST = withErrorHandling(async (
  request: NextRequest,
  context?: { params: Promise<{ id: string }> }
) => {
  // 1. Authenticate user
  const user = await authenticate(request);
  const params = await (context?.params || Promise.reject(new BusinessLogicError('Missing route context', 'MISSING_CONTEXT')));
  const { id: postId } = IdParamSchema.parse(params);

  // 2. Parse and validate request body
  const body = await request.json();
  const { content, marketId, sentiment } = ReplyToPostSchema.parse(body);

  // 3. Extract NPC/author ID from post ID
  const parseResult = parsePostId(postId);

  // Require valid format for replies (unlike likes, which can use defaults)
  if (!parseResult.success) {
    throw new BusinessLogicError('Invalid post ID format', 'INVALID_POST_ID_FORMAT');
  }

    const { gameId, authorId: npcId, timestamp } = parseResult.metadata;

    // 4. Check rate limiting
    const rateLimitResult = await ReplyRateLimiter.canReply(user.userId, npcId);

    if (!rateLimitResult.allowed) {
      throw new BusinessLogicError(rateLimitResult.reason || 'Rate limit exceeded', 'RATE_LIMIT_EXCEEDED');
    }

    // 5. Check message quality
    const qualityResult = await MessageQualityChecker.checkQuality(
      content,
      user.userId,
      'reply',
      postId
    );

    if (!qualityResult.passed) {
      throw new BusinessLogicError(qualityResult.errors.join('; '), 'QUALITY_CHECK_FAILED');
    }

    // 6-8. Create comment with RLS
    const comment = await asUser(user, async (db) => {
      // Ensure user exists in database
      await db.user.upsert({
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

      // Ensure post exists (upsert pattern)
      await db.post.upsert({
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

      // Create comment
      const newComment = await db.comment.create({
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

      return newComment;
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
  logger.info('Reply created successfully', {
    postId,
    userId: user.userId,
    commentId: comment.id,
    followed,
    invitedToChat,
    marketId, // Optional: for analytics/tracking
    sentiment // Optional: for analytics/tracking
  }, 'POST /api/posts/[id]/reply');

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
});


