/**
 * API Route: /api/chats/[id]/message
 * Methods: POST (send message to group chat with quality and activity checks)
 */

import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/database-service'
import { authenticate } from '@/lib/api/auth-middleware'
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler'
import { BusinessLogicError, AuthorizationError } from '@/lib/errors'
import { MessageQualityChecker } from '@/lib/services/message-quality-checker'
import { GroupChatSweep, type SweepDecision } from '@/lib/services/group-chat-sweep'
import { GroupChatInvite } from '@/lib/services/group-chat-invite'
import { broadcastChatMessage } from '@/lib/sse/event-broadcaster'
import { logger } from '@/lib/logger'
import { ChatMessageCreateSchema } from '@/lib/validation/schemas'

/**
 * POST /api/chats/[id]/message
 * Send message to group chat
 */
export const POST = withErrorHandling(async (
  request: NextRequest,
  context?: { params: Promise<{ id: string }> }
) => {
  // 1. Authenticate user
  const user = await authenticate(request)
  const { id: chatId } = await (context?.params || Promise.reject(new BusinessLogicError('Missing route context', 'MISSING_CONTEXT')))

  if (!chatId) {
    throw new BusinessLogicError('Chat ID is required', 'CHAT_ID_REQUIRED')
  }

  // 2. Validate request body
  const body = await request.json()
  const { content } = ChatMessageCreateSchema.parse(body)

  // 3. Check if user is a member of this chat
  // For game chats (containing hyphens), skip membership check as they're virtual
  const isGameChat = chatId.includes('-')
  let isMember = true

  if (!isGameChat) {
    isMember = await GroupChatInvite.isInChat(user.userId, chatId)
    if (!isMember) {
      throw new AuthorizationError('You are not a member of this group chat', 'chat', 'write')
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
  }

  if (!isGameChat) {
    sweepDecision = await GroupChatSweep.checkForRemoval(user.userId, chatId)
    if (sweepDecision.shouldRemove) {
      await GroupChatSweep.removeFromChat(user.userId, chatId, sweepDecision.reason || 'Auto-removed')
      throw new AuthorizationError(
        `You have been removed from this chat: ${sweepDecision.reason}`,
        'chat',
        'write'
      )
    }
  }

  const qualityResult = await MessageQualityChecker.checkQuality(
    content,
    user.userId,
    'groupchat',
    isGameChat ? '' : chatId
  )

  if (!qualityResult.passed) {
    throw new BusinessLogicError(
      qualityResult.errors.join('; '),
      'QUALITY_CHECK_FAILED'
    )
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

    // 9. Broadcast message via SSE
    broadcastChatMessage(chatId, {
      id: message.id,
      content: message.content,
      chatId: message.chatId,
      senderId: message.senderId,
      createdAt: message.createdAt.toISOString(),
      isGameChat,
    });

  // 10. Return success with feedback
  logger.info('Message sent successfully', { chatId, userId: user.userId, isGameChat, qualityScore: qualityResult.score }, 'POST /api/chats/[id]/message')

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
  )
})


