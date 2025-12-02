/**
 * Autonomous Group Chat Service
 *
 * Handles agents participating in group chats autonomously
 *
 * @packageDocumentation
 */

import { and, db, desc, eq, gte, messages, users } from '@babylon/db';
import type { IAgentRuntime } from '@elizaos/core';
import { logger } from '../shared/logger';
import { generateSnowflakeId } from '../shared/snowflake';
import { callGroqDirect } from '../llm/direct-groq';

/**
 * Service for autonomous group chat participation
 */
export class AutonomousGroupChatService {
  /**
   * Participates in group chats the agent is a member of
   *
   * @param agentUserId - Agent user ID
   * @param _runtime - Agent runtime (reserved for future use)
   * @returns Number of messages created
   * @throws Error if agent not found
   */
  async participateInGroupChats(
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

    // Get agent's group chats
    const groupChatsRaw = await db.query.chatParticipants.findMany({
      where: (chatParticipants, { eq }) =>
        eq(chatParticipants.userId, agentUserId),
      with: {
        chat: true,
      },
    });

    let messagesCreated = 0;

    for (const chatParticipant of groupChatsRaw) {
      const chat = chatParticipant.chat;
      if (!chat || !chat.isGroup) continue; // Skip DMs

      // Get recent messages in this group
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recentMessages = await db
        .select()
        .from(messages)
        .where(
          and(eq(messages.chatId, chat.id), gte(messages.createdAt, oneHourAgo))
        )
        .orderBy(desc(messages.createdAt))
        .limit(10);

      if (recentMessages.length === 0) continue;

      // Check if agent was mentioned or should respond
      const agentMentioned = recentMessages.some(
        (m: { content: string; senderId: string }) =>
          m.content
            .toLowerCase()
            .includes(agent.username?.toLowerCase() || 'agent') ||
          m.content
            .toLowerCase()
            .includes(agent.displayName?.toLowerCase() || 'agent')
      );

      // Don't spam - only respond if mentioned or if it's been a while
      const agentLastMessage = recentMessages.find(
        (m: { content: string; senderId: string }) => m.senderId === agentUserId
      );
      if (!agentMentioned && agentLastMessage) {
        continue;
      }

      // Generate contextual response
      const prompt = `${agent.agentSystem}

You are ${agent.displayName} in a group chat.

Recent conversation:
${recentMessages
  .reverse()
  .map(
    (m: { content: string; senderId: string }) =>
      `${m.senderId === agentUserId ? 'You' : 'User'}: ${m.content}`
  )
  .join('\n')}

Task: Generate a helpful, engaging message (1-2 sentences) that contributes to the conversation.
Be authentic to your personality and expertise.
Keep it under 200 characters.
Only respond if you have something valuable to add.

Generate ONLY the message text, or "SKIP" if you shouldn't respond.`;

      // Use large model (qwen3-32b) for quality group chat content
      const responseContent = await callGroqDirect({
        prompt,
        system: agent.agentSystem || undefined,
        modelSize: 'large', // Important social content
        runtime: _runtime, // Pass runtime to access W&B trained models AND trajectory context
        temperature: 0.8,
        maxTokens: 80,
        actionType: 'generate_group_chat_response',
        purpose: 'response', // RLAIF: This is a response generation call
      });

      const cleanContent = responseContent.trim().replace(/^["']|["']$/g, '');

      if (!cleanContent || cleanContent.length < 5 || cleanContent === 'SKIP') {
        continue;
      }

      // Create group message
      await db.insert(messages).values({
        id: await generateSnowflakeId(),
        chatId: chat.id,
        senderId: agentUserId,
        content: cleanContent,
        createdAt: new Date(),
      });

      messagesCreated++;
      logger.info(
        `Agent ${agent.displayName} participated in group chat ${chat.id}`,
        undefined,
        'AutonomousGroupChat'
      );

      // Only respond to one group per tick to avoid spam
      break;
    }

    return messagesCreated;
  }
}

export const autonomousGroupChatService = new AutonomousGroupChatService();
