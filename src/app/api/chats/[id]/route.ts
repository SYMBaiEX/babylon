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
    const user = await authenticate(request);
    const { id: chatId } = await params;

    if (!chatId) {
      return errorResponse('Chat ID is required', 400);
    }

    // Check if user has access to this chat
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

    // Get chat with messages
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 100, // Limit to last 100 messages
        },
        participants: true,
      },
    });

    if (!chat) {
      return errorResponse('Chat not found', 404);
    }

    // Get user details for participants
    const participantUserIds = chat.participants.map((p) => p.userId);
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

    const usersMap = new Map(users.map((u) => [u.id, u]));

    return successResponse({
      chat: {
        id: chat.id,
        name: chat.name,
        isGroup: chat.isGroup,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
      },
      messages: chat.messages.map((msg) => ({
        id: msg.id,
        content: msg.content,
        senderId: msg.senderId,
        createdAt: msg.createdAt,
      })),
      participants: chat.participants.map((p) => {
        const user = usersMap.get(p.userId);
        return {
          id: p.userId,
          displayName: user?.displayName || 'Unknown',
          username: user?.username,
          profileImageUrl: user?.profileImageUrl,
        };
      }),
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

