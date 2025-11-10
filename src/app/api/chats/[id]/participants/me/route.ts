import type { NextRequest } from 'next/server'
import { authenticate } from '@/lib/api/auth-middleware'
import { withErrorHandling, successResponse, errorResponse } from '@/lib/errors/error-handler'
import { BusinessLogicError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { asUser } from '@/lib/db/context'

/**
 * DELETE /api/chats/[id]/participants/me
 * Allows the authenticated user to leave a chat
 */
export const DELETE = withErrorHandling(async (
  request: NextRequest,
  context?: { params: Promise<{ id: string }> }
) => {
  const { id: chatId } = await (context?.params || Promise.reject(new BusinessLogicError('Missing route context', 'MISSING_CONTEXT')))
  const user = await authenticate(request)

  await asUser(user, async (db) => {
    // First, check if the user is actually a participant
    const participant = await db.chatParticipant.findUnique({
      where: {
        chatId_userId: {
          chatId,
          userId: user.userId,
        },
      },
    });

    if (!participant) {
      throw errorResponse({
        message: 'You are not a member of this chat.',
        statusCode: 404,
      });
    }

    // For NPC-run chats, we mark the membership as inactive to preserve history
    const groupMembership = await db.groupChatMembership.findUnique({
        where: {
            userId_chatId: {
                userId: user.userId,
                chatId,
            }
        }
    });

    if (groupMembership) {
        await db.groupChatMembership.update({
            where: {
                id: groupMembership.id,
            },
            data: {
                isActive: false,
                removedAt: new Date(),
                sweepReason: 'User left',
            }
        });
    }

    // For all chats (NPC or user-created), we remove the participant record
    await db.chatParticipant.delete({
      where: {
        id: participant.id,
      },
    });
  });

  logger.info('User left chat successfully', { chatId, userId: user.userId }, 'DELETE /api/chats/[id]/participants/me');

  return successResponse({ message: 'You have left the chat.' }, 200);
});
