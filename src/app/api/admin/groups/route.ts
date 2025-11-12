/**
 * Admin Groups API
 * 
 * View all group chats in the system for verification and debugging
 */

import { authenticate } from '@/lib/api/auth-middleware';
import { withErrorHandling } from '@/lib/errors/error-handler';
import { prisma } from '@/lib/prisma';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

/**
 * GET /api/admin/groups
 * Get all group chats with filtering and sorting
 * Admin only
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await authenticate(request);
  
  // Check admin permissions
  const dbUser = await prisma.user.findUnique({
    where: { id: user.userId },
    select: { isAdmin: true },
  });

  if (!dbUser?.isAdmin) {
    return NextResponse.json(
      { error: 'Admin access required' },
      { status: 403 }
    );
  }

  // Get query parameters
  const { searchParams } = new URL(request.url);
  const creatorFilter = searchParams.get('creator'); // Filter by creator name
  const sortBy = searchParams.get('sortBy') || 'createdAt'; // createdAt, memberCount, messageCount
  const sortOrder = searchParams.get('sortOrder') || 'desc';
  // const groupType = searchParams.get('type'); // 'npc' or 'user' - unused for now

  // Build where clause
  const whereClause: { isGroup: boolean } = {
    isGroup: true,
  };

  // Get all chats with full details
  const chats = await prisma.chat.findMany({
    where: whereClause,
    include: {
      ChatParticipant: {
        select: {
          userId: true,
          joinedAt: true,
        },
      },
      Message: {
        select: {
          id: true,
          senderId: true,
          content: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 10, // Last 10 messages for preview
      },
    },
    orderBy: {
      createdAt: sortOrder === 'asc' ? 'asc' : 'desc',
    },
  });

  // Enrich with creator and participant details
  const enrichedChats = await Promise.all(
    chats.map(async (chat) => {
      const participantIds = chat.ChatParticipant.map(p => p.userId);
      
      // Get all participants (users and actors)
      const [users, actors] = await Promise.all([
        prisma.user.findMany({
          where: {
            id: {
              in: participantIds,
            },
          },
          select: {
            id: true,
            username: true,
            displayName: true,
            isActor: true,
            profileImageUrl: true,
          },
        }),
        prisma.actor.findMany({
          where: {
            id: {
              in: participantIds,
            },
          },
          select: {
            id: true,
            name: true,
            profileImageUrl: true,
          },
        }),
      ]);

      // Determine group type and creator
      const actorParticipants = actors.map(a => a.id);
      const hasNPCs = actorParticipants.length > 0;
      const hasUsers = users.filter(u => !u.isActor).length > 0;
      
      let groupType = 'unknown';
      let creatorName = 'Unknown';
      let creatorId = null;
      
      if (hasNPCs && !hasUsers) {
        groupType = 'npc-only';
        // Find creator from chat name or first NPC
        const creator = actors.find(a => chat.name?.includes(a.name)) || actors[0];
        if (creator) {
          creatorName = creator.name;
          creatorId = creator.id;
        }
      } else if (hasNPCs && hasUsers) {
        groupType = 'npc-mixed';
        // Alpha group - NPC created
        const creator = actors.find(a => chat.name?.includes(a.name)) || actors[0];
        if (creator) {
          creatorName = creator.name;
          creatorId = creator.id;
        }
      } else {
        groupType = 'user';
        // Check UserGroup table
        const userGroup = await prisma.userGroup.findFirst({
          where: {
            name: chat.name || undefined,
          },
          select: {
            createdById: true,
          },
        });
        
        if (userGroup) {
          const creator = users.find(u => u.id === userGroup.createdById);
          if (creator) {
            creatorName = creator.displayName || creator.username || 'Unknown';
            creatorId = creator.id;
          }
        }
      }

      // Apply creator filter
      if (creatorFilter && !creatorName.toLowerCase().includes(creatorFilter.toLowerCase())) {
        return null;
      }

      // Apply group type filter
      if (groupType && groupType !== 'all' && !groupType.includes(groupType)) {
        return null;
      }

      // Combine user and actor info
      const participants = chat.ChatParticipant.map(p => {
        const user = users.find(u => u.id === p.userId);
        const actor = actors.find(a => a.id === p.userId);
        
        return {
          id: p.userId,
          name: user?.displayName || user?.username || actor?.name || 'Unknown',
          username: user?.username || null,
          isNPC: !!actor || user?.isActor,
          profileImageUrl: user?.profileImageUrl || actor?.profileImageUrl,
          joinedAt: p.joinedAt,
        };
      });

      // Get message senders info
      const messageSenderIds = chat.Message.map(m => m.senderId);
      const [messageUsers, messageActors] = await Promise.all([
        prisma.user.findMany({
          where: { id: { in: messageSenderIds } },
          select: {
            id: true,
            username: true,
            displayName: true,
            isActor: true,
          },
        }),
        prisma.actor.findMany({
          where: { id: { in: messageSenderIds } },
          select: {
            id: true,
            name: true,
          },
        }),
      ]);

      const messagesWithSenders = chat.Message.map(m => {
        const user = messageUsers.find(u => u.id === m.senderId);
        const actor = messageActors.find(a => a.id === m.senderId);
        
        return {
          id: m.id,
          content: m.content,
          createdAt: m.createdAt,
          sender: {
            id: m.senderId,
            name: user?.displayName || user?.username || actor?.name || 'Unknown',
            isNPC: !!actor || user?.isActor,
          },
        };
      });

      return {
        id: chat.id,
        name: chat.name,
        groupType,
        creatorId,
        creatorName,
        memberCount: participants.length,
        messageCount: chat.Message.length,
        participants,
        recentMessages: messagesWithSenders,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
      };
    })
  );

  // Filter out nulls (from filters)
  const filteredChats = enrichedChats.filter(c => c !== null);

  // Sort if needed
  if (sortBy === 'memberCount') {
    filteredChats.sort((a, b) => {
      const order = sortOrder === 'asc' ? 1 : -1;
      return order * (a!.memberCount - b!.memberCount);
    });
  } else if (sortBy === 'messageCount') {
    filteredChats.sort((a, b) => {
      const order = sortOrder === 'asc' ? 1 : -1;
      return order * (a!.messageCount - b!.messageCount);
    });
  }

  return NextResponse.json({
    success: true,
    data: {
      groups: filteredChats,
      total: filteredChats.length,
    },
  });
});

