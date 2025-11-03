/**
 * API Route: /api/chats/dm
 * Methods: POST (create or get DM chat with a user)
 */

import type { NextRequest } from 'next/server';
import {
  authenticate,
  authErrorResponse,
  successResponse,
  errorResponse,
} from '@/lib/api/auth-middleware';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';


/**
 * POST /api/chats/dm
 * Create or get a DM chat with another user
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticate(request);
    const body = await request.json();
    const { userId: targetUserId } = body;

    if (!targetUserId) {
      return errorResponse('User ID is required', 400);
    }

    // Prevent DMing yourself
    if (user.userId === targetUserId) {
      return errorResponse('Cannot DM yourself', 400);
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
        return errorResponse('User or profile not found', 404);
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

    return successResponse({
      chat: {
        id: chat.id,
        name: chat.name,
        isGroup: chat.isGroup,
      },
    }, 201);
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication failed') {
      return authErrorResponse('Unauthorized');
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Error creating/getting DM chat:', { error: errorMessage }, 'POST /api/chats/dm');
    return errorResponse('Failed to create DM chat');
  }
}

