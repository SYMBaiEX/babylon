/**
 * API Route: /api/chats
 * Methods: GET (list user's chats), POST (create new chat)
 */

import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/database-service';
import { authenticate } from '@/lib/api/auth-middleware';
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler';
import { logger } from '@/lib/logger';
import { ChatQuerySchema, ChatCreateSchema } from '@/lib/validation/schemas';

/**
 * GET /api/chats
 * Get all chats for the authenticated user
 * Query params: ?all=true - Get all game chats (not just user's chats)
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  // Validate query parameters
  const { searchParams } = new URL(request.url);
  const query: Record<string, string> = {};
  
  const all = searchParams.get('all');
  const debug = searchParams.get('debug');
  
  if (all) query.all = all;
  if (debug) query.debug = debug;
  
  const validatedQuery = Object.keys(query).length > 0 
    ? ChatQuerySchema.parse(query) 
    : { all: undefined, debug: undefined };

  // Check if requesting all game chats
  const getAllChats = validatedQuery.all === 'true';

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

    logger.info('All game chats fetched', { count: gameChats.length }, 'GET /api/chats');

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

  logger.info('User chats fetched successfully', { userId: user.userId, groupChats: groupChats.length, directChats: directChats.length }, 'GET /api/chats');

  return successResponse({
    groupChats,
    directChats,
    total: groupChats.length + directChats.length,
  });
});

/**
 * POST /api/chats
 * Create a new chat
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const user = await authenticate(request);

  // Validate request body
  const body = await request.json();
  const { name, isGroup, participantIds } = ChatCreateSchema.parse(body);

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

  logger.info('Chat created successfully', { chatId: chat.id, userId: user.userId, isGroup, participantCount: (participantIds?.length || 0) + 1 }, 'POST /api/chats');

  return successResponse({ chat }, 201);
});

