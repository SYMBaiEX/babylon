/**
 * Recent Messages Provider
 *
 * Provides conversation history from Babylon's agentMessages table.
 * This uses Babylon's DB schema instead of ElizaOS memories.
 */

import { db } from '@babylon/db';
import type {
  IAgentRuntime,
  Memory,
  Provider,
  ProviderResult,
  State,
} from '@elizaos/core';

/**
 * Format timestamp to relative time string
 */
function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

/**
 * Format time as HH:MM
 */
function formatTime(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Recent Messages Provider
 *
 * Fetches recent chat messages from Babylon's agentMessages table
 * and formats them for LLM context.
 */
export const recentMessagesProvider: Provider = {
  name: 'RECENT_MESSAGES',
  description: 'Recent conversation history with the user',

  get: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State
  ): Promise<ProviderResult> => {
    const agentUserId = runtime.agentId;

    try {
      // Fetch recent messages using Prisma-style syntax
      const messages = await db.agentMessage.findMany({
        where: { agentUserId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      if (messages.length === 0) {
        return {
          data: {
            recentMessages: [],
            messageCount: 0,
          },
          values: {
            recentMessages: 'No previous conversation history.',
            messageCount: 0,
            hasHistory: false,
          },
          text: 'No previous conversation history.',
        };
      }

      // Format messages (oldest first for conversation flow)
      const formattedMessages = messages
        .reverse()
        .map((msg) => {
          const speaker = msg.role === 'user' ? 'User' : 'Agent';
          const time = formatTime(msg.createdAt);
          const relativeTime = formatRelativeTime(msg.createdAt);
          return `${time} (${relativeTime}) ${speaker}: ${msg.content}`;
        })
        .join('\n');

      const conversationText = formattedMessages;

      return {
        data: {
          recentMessages: messages,
          messageCount: messages.length,
        },
        values: {
          recentMessages: conversationText,
          messageCount: messages.length,
          hasHistory: true,
        },
        text: conversationText,
      };
    } catch (error) {
      console.error('[RecentMessagesProvider] Error fetching messages:', error);
      return {
        data: {
          recentMessages: [],
          messageCount: 0,
        },
        values: {
          recentMessages: 'Error retrieving conversation history.',
          messageCount: 0,
          hasHistory: false,
        },
        text: 'Error retrieving conversation history.',
      };
    }
  },
};
