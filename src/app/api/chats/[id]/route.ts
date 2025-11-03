/**
 * API Route: /api/chats/[id]
 * Methods: GET (get chat details and messages)
 */

import type { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import {
  authenticate,
  authErrorResponse,
  successResponse,
  errorResponse,
} from '@/lib/api/auth-middleware';
import { logger } from '@/lib/logger';

const prisma = new PrismaClient();

/**
 * GET /api/chats/[id]
 * Get chat details and messages
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: chatId } = await params;

    if (!chatId) {
      return errorResponse('Chat ID is required', 400);
    }

    // Check for debug mode (localhost access to game chats)
    const { searchParams } = new URL(request.url);
    const debugMode = searchParams.get('debug') === 'true';
    
    // Get chat first to check if it's a game chat
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
    });

    if (!chat) {
      return errorResponse('Chat not found', 404);
    }

    // Allow debug access to game chats without auth
    const isGameChat = chat.isGroup && chat.gameId === 'continuous';
    let userId: string | undefined;
    
    if (isGameChat && debugMode) {
      // Debug mode: skip authentication for game chats
      logger.info(`Debug mode access to game chat: ${chatId}`, undefined, 'GET /api/chats/[id]');
    } else {
      // Normal mode: require authentication and membership
      const user = await authenticate(request);
      userId = user.userId;
      
      const isMember = await prisma.chatParticipant.findUnique({
        where: {
          chatId_userId: {
            chatId,
            userId: user.userId,
          },
        },
      });

      if (!isMember) {
        return errorResponse('You do not have access to this chat', 403);
      }
    }

    // Get chat with messages
    const fullChat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 100, // Limit to last 100 messages
        },
        participants: true,
      },
    });

    if (!fullChat) {
      return errorResponse('Chat not found', 404);
    }

    // Get participant details - need to check both users and actors
    const participantUserIds = fullChat.participants.map((p) => p.userId);
    const users = await prisma.user.findMany({
      where: {
        id: { in: participantUserIds },
      },
      select: {
        id: true,
        displayName: true,
        username: true,
        profileImageUrl: true,
      },
    });

    // Get unique sender IDs from messages (for game chats, these are often actors)
    const senderIds = [...new Set(fullChat.messages.map(m => m.senderId))];
    const actors = await prisma.actor.findMany({
      where: {
        id: { in: senderIds },
      },
      select: {
        id: true,
        name: true,
        profileImageUrl: true,
      },
    });

    const usersMap = new Map(users.map((u) => [u.id, u]));
    const actorsMap = new Map(actors.map((a) => [a.id, a]));

    // Build participants list from ChatParticipants or message senders (for debug mode)
    const participantsInfo = fullChat.participants.length > 0
      ? fullChat.participants.map((p) => {
          const user = usersMap.get(p.userId);
          const actor = actorsMap.get(p.userId);
          return {
            id: p.userId,
            displayName: user?.displayName || actor?.name || 'Unknown',
            username: user?.username,
            profileImageUrl: user?.profileImageUrl || actor?.profileImageUrl,
          };
        })
      : // In debug mode with no participants, use actors from messages
        senderIds.map(senderId => {
          const actor = actorsMap.get(senderId);
          const user = usersMap.get(senderId);
          return {
            id: senderId,
            displayName: actor?.name || user?.displayName || 'Unknown',
            username: user?.username,
            profileImageUrl: actor?.profileImageUrl || user?.profileImageUrl,
          };
        });

    // For DMs, get the other participant's name
    let displayName = fullChat.name;
    if (!fullChat.isGroup && !fullChat.name && userId) {
      const otherParticipant = fullChat.participants.find((p) => p.userId !== userId);
      if (otherParticipant) {
        const otherUser = usersMap.get(otherParticipant.userId);
        if (otherUser) {
          displayName = otherUser.displayName || otherUser.username || 'Unknown';
        } else {
          const actor = actorsMap.get(otherParticipant.userId);
          if (actor) {
            displayName = actor.name;
          }
        }
      }
    }

    return successResponse({
      chat: {
        id: fullChat.id,
        name: displayName || fullChat.name,
        isGroup: fullChat.isGroup,
        createdAt: fullChat.createdAt,
        updatedAt: fullChat.updatedAt,
      },
      messages: fullChat.messages.map((msg) => ({
        id: msg.id,
        content: msg.content,
        senderId: msg.senderId,
        createdAt: msg.createdAt,
      })),
      participants: participantsInfo,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication failed') {
      return authErrorResponse('Unauthorized');
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Error fetching chat:', { error: errorMessage }, 'GET /api/chats/[id]');
    return errorResponse('Failed to fetch chat');
  }
}

