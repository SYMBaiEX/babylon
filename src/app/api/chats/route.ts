/**
 * API Route: /api/chats
 * Methods: GET (list user's chats), POST (create new chat)
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
 * GET /api/chats
 * Get all chats for the authenticated user
 * Query params: ?all=true - Get all game chats (not just user's chats)
 */
export async function GET(request: NextRequest) {
  try {
    // Check if requesting all game chats
    const { searchParams } = new URL(request.url);
    const getAllChats = searchParams.get('all') === 'true';
    
    if (getAllChats) {
      // Return all game chats (no auth required for read-only game data)
      const gameChats = await prisma.chat.findMany({
        where: {
          isGroup: true,
          gameId: 'continuous',
        },
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          _count: {
            select: {
              messages: true,
            },
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      return successResponse({
        chats: gameChats.map(chat => ({
          id: chat.id,
          name: chat.name,
          isGroup: chat.isGroup,
          messageCount: chat._count.messages,
          lastMessage: chat.messages[0] || null,
        })),
      });
    }
    
    const user = await authenticate(request);

    // Get user's group chat memberships
    const memberships = await prisma.groupChatMembership.findMany({
      where: {
        userId: user.userId,
        isActive: true,
      },
      orderBy: {
        lastMessageAt: 'desc',
      },
    });

    // Get chat details for group chats
    const groupChatIds = memberships.map((m) => m.chatId);
    const groupChatDetails = await prisma.chat.findMany({
      where: {
        id: { in: groupChatIds },
      },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const chatDetailsMap = new Map(groupChatDetails.map((c) => [c.id, c]));

    // Get DM chats the user participates in
    const dmParticipants = await prisma.chatParticipant.findMany({
      where: {
        userId: user.userId,
      },
    });

    const dmChatIds = dmParticipants.map((p) => p.chatId);
    const dmChatsDetails = await prisma.chat.findMany({
      where: {
        id: { in: dmChatIds },
        isGroup: false,
      },
      include: {
        participants: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    // Format group chats
    const groupChats = memberships
      .map((membership) => {
        const chat = chatDetailsMap.get(membership.chatId);
        if (!chat) return null;
        return {
          id: membership.chatId,
          name: chat.name || 'Unnamed Group',
          isGroup: true,
          lastMessage: chat.messages[0] || null,
          messageCount: membership.messageCount,
          qualityScore: membership.qualityScore,
          lastMessageAt: membership.lastMessageAt,
          updatedAt: chat.updatedAt,
        };
      })
      .filter((c) => c !== null);

    // Format DM chats - get the other participant's name
    const directChats = await Promise.all(
      dmChatsDetails.map(async (chat) => {
        // Find the other participant (not the current user)
        const otherParticipant = chat.participants.find((p) => p.userId !== user.userId);
        let chatName = chat.name || 'Direct Message';
        
        if (otherParticipant) {
          // Try to get user details
          const otherUser = await prisma.user.findUnique({
            where: { id: otherParticipant.userId },
            select: { displayName: true, username: true },
          });
          
          if (otherUser) {
            chatName = otherUser.displayName || otherUser.username || 'Unknown';
          } else {
            // Check if it's an actor
            const actor = await prisma.actor.findUnique({
              where: { id: otherParticipant.userId },
              select: { name: true },
            });
            if (actor) {
              chatName = actor.name;
            }
          }
        }
        
        return {
          id: chat.id,
          name: chatName,
          isGroup: false,
          lastMessage: chat.messages[0] || null,
          participants: chat.participants.length,
          updatedAt: chat.updatedAt,
        };
      })
    );

    return successResponse({
      groupChats,
      directChats,
      total: groupChats.length + directChats.length,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication failed') {
      return authErrorResponse('Unauthorized');
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Error fetching chats:', { error: errorMessage }, 'GET /api/chats');
    return errorResponse('Failed to fetch chats');
  }
}

/**
 * POST /api/chats
 * Create a new chat
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticate(request);
    const body = await request.json();
    const { name, isGroup, participantIds } = body;

    if (isGroup && !name) {
      return errorResponse('Group name is required', 400);
    }

    // Create the chat
    const chat = await prisma.chat.create({
      data: {
        name: name || null,
        isGroup: isGroup || false,
      },
    });

    // Add creator as participant
    await prisma.chatParticipant.create({
      data: {
        chatId: chat.id,
        userId: user.userId,
      },
    });

    // Add other participants if provided
    if (participantIds && Array.isArray(participantIds)) {
      await Promise.all(
        participantIds.map((participantId: string) =>
          prisma.chatParticipant.create({
            data: {
              chatId: chat.id,
              userId: participantId,
            },
          })
        )
      );
    }

    return successResponse({ chat }, 201);
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication failed') {
      return authErrorResponse('Unauthorized');
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Error creating chat:', { error: errorMessage }, 'POST /api/chats');
    return errorResponse('Failed to create chat');
  }
}

