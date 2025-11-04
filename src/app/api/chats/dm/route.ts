/**
 * API Route: /api/chats/dm
 * Methods: POST (create or get DM chat with a user)
 */

import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/database-service';
import { authenticate } from '@/lib/api/auth-middleware';
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler';
import { BusinessLogicError, NotFoundError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { DMChatCreateSchema } from '@/lib/validation/schemas';

/**
 * POST /api/chats/dm
 * Create or get a DM chat with another user
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const user = await authenticate(request);

  // Validate request body
  const body = await request.json();
  const { userId: targetUserId } = DMChatCreateSchema.parse(body);

  // Prevent DMing yourself (business rule validation)
  if (user.userId === targetUserId) {
    throw new BusinessLogicError('Cannot DM yourself', 'SELF_DM_NOT_ALLOWED');
  }

    // Check if target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, isActor: true },
    });

  // If not a user, check if it's an actor
  if (!targetUser) {
    const targetActor = await prisma.actor.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });

    if (!targetActor) {
      throw new NotFoundError('User or profile', targetUserId);
    }
  }

    // Create DM chat ID (consistent format - sort IDs for consistency)
    const sortedIds = [user.userId, targetUserId].sort();
    const chatId = `dm-${sortedIds.join('-')}`;

    // Try to find existing DM chat
    let chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        participants: {
          select: {
            userId: true,
          },
        },
      },
    });

    if (!chat) {
      // Create new DM chat
      chat = await prisma.chat.create({
        data: {
          id: chatId,
          name: null, // DMs don't have names
          isGroup: false,
        },
        include: {
          participants: {
            select: {
              userId: true,
            },
          },
        },
      });

      // Add both participants
      await Promise.all([
        prisma.chatParticipant.create({
          data: {
            chatId,
            userId: user.userId,
          },
        }),
        prisma.chatParticipant.create({
          data: {
            chatId,
            userId: targetUserId,
          },
        }),
      ]);
    } else {
      // Chat exists, ensure both participants are added
      const participantIds = chat.participants.map(p => p.userId);
      
      if (!participantIds.includes(user.userId)) {
        await prisma.chatParticipant.create({
          data: {
            chatId,
            userId: user.userId,
          },
        });
      }

      if (!participantIds.includes(targetUserId)) {
        await prisma.chatParticipant.create({
          data: {
            chatId,
            userId: targetUserId,
          },
        });
      }
    }

  logger.info('DM chat created or retrieved successfully', { chatId: chat.id, userId: user.userId, targetUserId }, 'POST /api/chats/dm');

  return successResponse({
    chat: {
      id: chat.id,
      name: chat.name,
      isGroup: chat.isGroup,
    },
  }, 201);
});

