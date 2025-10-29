/**
 * API Route: /api/chats/[id]/message
 * Methods: POST (send message to group chat with quality and activity checks)
 */

import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import {
  authenticate,
  authErrorResponse,
  successResponse,
  errorResponse,
} from '@/lib/api/auth-middleware';
import { MessageQualityChecker } from '@/services/MessageQualityChecker';
import { GroupChatSweep } from '@/services/GroupChatSweep';
import { GroupChatInvite } from '@/services/GroupChatInvite';

const prisma = new PrismaClient();

/**
 * POST /api/chats/[id]/message
 * Send message to group chat
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Authenticate user
    const user = await authenticate(request);
    const { id: chatId } = await params;

    if (!chatId) {
      return errorResponse('Chat ID is required', 400);
    }

    // 2. Parse request body
    const body = await request.json();
    const { content } = body;

    if (!content || typeof content !== 'string') {
      return errorResponse('Message content is required', 400);
    }

    if (content.trim().length === 0) {
      return errorResponse('Message cannot be empty', 400);
    }

    // 3. Check if user is a member of this chat
    const isMember = await GroupChatInvite.isInChat(user.userId, chatId);

    if (!isMember) {
      return errorResponse('You are not a member of this group chat', 403);
    }

    // 4. Check if user should be removed (pre-check)
    const sweepDecision = await GroupChatSweep.checkForRemoval(user.userId, chatId);

    if (sweepDecision.shouldRemove) {
      await GroupChatSweep.removeFromChat(user.userId, chatId, sweepDecision.reason || 'Auto-removed');
      return errorResponse(
        `You have been removed from this chat: ${sweepDecision.reason}`,
        403
      );
    }

    // 5. Check message quality
    const qualityResult = await MessageQualityChecker.checkQuality(
      content,
      user.userId,
      'groupchat',
      chatId
    );

    if (!qualityResult.passed) {
      return errorResponse(
        qualityResult.errors.join('; '),
        400
      );
    }

    // 6. Create message
    const message = await prisma.message.create({
      data: {
        content: content.trim(),
        chatId,
        senderId: user.userId,
      },
    });

    // 7. Update user's quality score in chat
    await GroupChatSweep.updateQualityScore(user.userId, chatId, qualityResult.score);

    // 8. Get updated membership stats
    const membership = await prisma.groupChatMembership.findUnique({
      where: {
        userId_chatId: {
          userId: user.userId,
          chatId,
        },
      },
    });

    // 9. Return success with feedback
    return successResponse(
      {
        message: {
          id: message.id,
          content: message.content,
          chatId: message.chatId,
          senderId: message.senderId,
          createdAt: message.createdAt,
        },
        quality: {
          score: qualityResult.score,
          warnings: qualityResult.warnings,
          factors: qualityResult.factors,
        },
        membership: {
          messageCount: membership?.messageCount || 0,
          qualityScore: membership?.qualityScore || 0,
          lastMessageAt: membership?.lastMessageAt,
          messagesLast24h: sweepDecision.stats.messagesLast24h,
          status: 'active',
        },
        warnings: qualityResult.warnings,
      },
      201
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication failed') {
      return authErrorResponse('Unauthorized');
    }
    console.error('Error sending group chat message:', error);
    return errorResponse('Failed to send message');
  }
}


