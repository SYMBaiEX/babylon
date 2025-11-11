/**
 * Actor Social Actions Service
 * 
 * Handles actors randomly inviting users to group chats or sending DMs
 * based on interaction history and social relationships.
 */

import { GroupChatInvite } from './group-chat-invite';
import { logger } from '@/lib/logger';
        name: null, // DMs don't have names
        isGroup: false,
        updatedAt: new Date(),
      },
    });

    // Verify chat was created/retrieved
    if (!chat) {
      throw new Error(`Failed to create or retrieve DM chat: ${chatId}`);
    }

    // Add participants
    await db.prisma.chatParticipant.upsert({
      where: {
        chatId_userId: {
          chatId,
          userId: actorId,
        },
      },
      update: {},
      create: {
        id: generateSnowflakeId(),
        chatId,
        userId: actorId,
      },
    });

    await db.prisma.chatParticipant.upsert({
      where: {
        chatId_userId: {
          chatId,
          userId,
        },
      },
      update: {},
      create: {
        id: generateSnowflakeId(),
        chatId,
        userId,
      },
    });
    
    if(!messageContent) throw new Error('Message content is required');
    
    // Create initial message from actor
    await db.prisma.message.create({
      data: {
        id: generateSnowflakeId(),
        chatId,
        senderId: actorId,
        content: messageContent,
      },
    });

    return {
      id: chatId,
      messageContent,
    };
  }
}

