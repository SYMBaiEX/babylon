/**
 * API Route: /api/chats/[id]/message
 * Methods: POST (send message to group chat with quality and activity checks)
 */

import type { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import {
  authenticate,
  authErrorResponse,
  successResponse,
  errorResponse,
} from '@/lib/api/auth-middleware';
import { MessageQualityChecker } from '@/services/MessageQualityChecker';
import { GroupChatSweep, type SweepDecision } from '@/services/GroupChatSweep';
import { GroupChatInvite } from '@/services/GroupChatInvite';
import { broadcastMessage } from '@/app/api/ws/chat/route';
import { logger } from '@/lib/logger';

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
    // For game chats (containing hyphens), skip membership check as they're virtual
    const isGameChat = chatId.includes('-');
    let isMember = true;
    
    if (!isGameChat) {
      isMember = await GroupChatInvite.isInChat(user.userId, chatId);
      if (!isMember) {
        return errorResponse('You are not a member of this group chat', 403);
      }
    }

    // 4. Check if user should be removed (pre-check) - only for database chats
    let sweepDecision: SweepDecision = {
      shouldRemove: false,
      reason: undefined,
      stats: {
        hoursSinceLastMessage: 0,
        messagesLast24h: 0,
        averageQuality: 0,
        totalMessages: 0
      }
    };
    
    if (!isGameChat) {
      sweepDecision = await GroupChatSweep.checkForRemoval(user.userId, chatId);
      if (sweepDecision.shouldRemove) {
        await GroupChatSweep.removeFromChat(user.userId, chatId, sweepDecision.reason || 'Auto-removed');
        return errorResponse(
          `You have been removed from this chat: ${sweepDecision.reason}`,
          403
        );
      }
    }

    // 5. Check message quality (skip uniqueness check for game chats)
    let qualityResult;
    try {
      qualityResult = await MessageQualityChecker.checkQuality(
        content,
        user.userId,
        'groupchat',
        isGameChat ? '' : chatId // Pass empty string for game chats to skip DB queries
      );
    } catch (qualityError) {
      const qualityErrorMessage = qualityError instanceof Error ? qualityError.message : String(qualityError);
      logger.error('Quality check error:', { error: qualityErrorMessage }, 'POST /api/chats/[id]/message');
      // For game chats, allow messages even if quality check fails
      if (isGameChat) {
        qualityResult = {
          score: 0.8,
          passed: true,
          warnings: [],
          errors: [],
          factors: { length: 1.0, uniqueness: 1.0, contentQuality: 0.8 },
        };
      } else {
        throw qualityError;
      }
    }

    if (!qualityResult.passed) {
      return errorResponse(
        qualityResult.errors.join('; '),
        400
      );
    }

    // 6. Create message (only for database chats)
    let message = null;
    let membership = null;
    
    if (!isGameChat) {
      message = await prisma.message.create({
        data: {
          content: content.trim(),
          chatId,
          senderId: user.userId,
        },
      });

      // 7. Update user's quality score in chat
      await GroupChatSweep.updateQualityScore(user.userId, chatId, qualityResult.score);

      // 8. Get updated membership stats
      membership = await prisma.groupChatMembership.findUnique({
        where: {
          userId_chatId: {
            userId: user.userId,
            chatId,
          },
        },
      });
    } else {
      // For game chats, create a mock message object
      message = {
        id: `game-${Date.now()}`,
        content: content.trim(),
        chatId,
        senderId: user.userId,
        createdAt: new Date(),
      };
    }

    // 9. Broadcast message via WebSocket
    broadcastMessage(chatId, {
      id: message.id,
      content: message.content,
      chatId: message.chatId,
      senderId: message.senderId,
      createdAt: message.createdAt.toISOString(),
      isGameChat,
    });

    // 10. Return success with feedback
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
        isGameChat,
      },
      201
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication failed') {
      return authErrorResponse('Unauthorized');
    }
    const errorMessage = error instanceof Error ? error.message : 'Failed to send message';
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error('Error sending group chat message:', { error: errorMessage, errorStack }, 'POST /api/chats/[id]/message');
    return errorResponse(errorMessage, 500);
  }
}


