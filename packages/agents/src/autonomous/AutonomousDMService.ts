/**
 * Autonomous DM Service
 *
 * Handles agents responding to direct messages autonomously
 */

import { and, db, desc, eq, gte, messages, ne, users } from '@babylon/db';
import type { IAgentRuntime } from '@elizaos/core';
import { logger } from '../shared/logger';
import { generateSnowflakeId } from '../shared/snowflake';
import { callGroqDirect } from '../llm/direct-groq';

export class AutonomousDMService {
  /**
   * Check for unread DMs and respond
   */
  async respondToDMs(
    agentUserId: string,
    _runtime: IAgentRuntime
  ): Promise<number> {
    const [agent] = await db
      .select()
      .from(users)
      .where(eq(users.id, agentUserId))
      .limit(1);
    if (!agent?.isAgent) {
      throw new Error('Agent not found');
    }

    // Get agent's DM chats (non-group chats)
    const dmChatsRaw = await db.query.chatParticipants.findMany({
      where: (chatParticipants, { eq }) =>
        eq(chatParticipants.userId, agentUserId),
      with: {
        chat: true,
      },
    });

    let responsesCreated = 0;

    for (const chatParticipant of dmChatsRaw) {
      const chat = chatParticipant.chat;
      if (!chat || chat.isGroup) continue; // Skip group chats

      // Get recent messages in this chat
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const unreadMessages = await db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.chatId, chat.id),
            ne(messages.senderId, agentUserId),
            gte(messages.createdAt, oneHourAgo)
          )
        )
        .orderBy(desc(messages.createdAt))
        .limit(5);

      if (unreadMessages.length === 0) continue;

      // Get conversation context
      const allMessages = await db.message.findMany({
        where: { chatId: chat.id },
        orderBy: { createdAt: 'asc' },
        take: 10,
      });

      const latestMessage = unreadMessages[0];
      if (!latestMessage) continue;

      // Generate response
      const prompt = `${agent.agentSystem}

You are ${agent.displayName} in a direct message conversation.

Recent conversation:
${allMessages
  .slice(-5)
  .map((m) => `${m.senderId === agentUserId ? 'You' : 'Them'}: ${m.content}`)
  .join('\n')}

Latest message from them:
"${latestMessage.content}"

Task: Generate a helpful, friendly response (1-2 sentences).
Be authentic to your personality.
Keep it under 200 characters.

Generate ONLY the response text, nothing else.`;

      // Use small model (llama-3.1-8b-instant) for fast DM responses
      const responseContent = await callGroqDirect({
        prompt,
        system: agent.agentSystem || undefined,
        modelSize: 'small', // Free tier: Frequent operation, use fast model
        runtime: _runtime, // Pass runtime to access W&B trained models AND trajectory context
        temperature: 0.8,
        maxTokens: 80,
        actionType: 'generate_dm_response',
        purpose: 'response', // RLAIF: This is a response generation call
      });

      const cleanContent = responseContent.trim().replace(/^["']|["']$/g, '');

      if (!cleanContent || cleanContent.length < 5) {
        continue;
      }

      // Create response message
      await db.message.create({
        data: {
          id: await generateSnowflakeId(),
          chatId: chat.id,
          senderId: agentUserId,
          content: cleanContent,
          createdAt: new Date(),
        },
      });

      responsesCreated++;
      logger.info(
        `Agent ${agent.displayName} responded to DM in chat ${chat.id}`,
        undefined,
        'AutonomousDM'
      );

      // Only respond to one DM per tick to avoid spam
      break;
    }

    return responsesCreated;
  }
}

export const autonomousDMService = new AutonomousDMService();
