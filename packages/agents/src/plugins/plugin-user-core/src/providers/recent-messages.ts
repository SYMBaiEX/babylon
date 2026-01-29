/**
 * Coordinator Recent Messages Provider
 *
 * Provides conversation history for the coordinator.
 * Queries messages from the user and coordinator.
 */

import {
  and,
  db,
  desc,
  eq,
  inArray,
  messages as messagesTable,
} from '@babylon/db';
import { COORDINATOR_SENDER_ID } from '@babylon/shared';
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
 * Coordinator Recent Messages Provider
 *
 * Fetches messages between the user and coordinator in team chat.
 * Uses 'coordinator' as the senderId for coordinator messages.
 */
export const coordinatorRecentMessagesProvider: Provider = {
  name: 'RECENT_MESSAGES',
  description: 'Recent conversation history with the user',

  get: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    state: State
  ): Promise<ProviderResult> => {
    const teamChatId = state?.values?.teamChatId as string | undefined;
    const ownerId = state?.values?.ownerId as string | undefined;

    if (!teamChatId || !ownerId) {
      return {
        data: { recentMessages: [], messageCount: 0 },
        values: {
          recentMessages: 'No team chat context available.',
          messageCount: 0,
          hasHistory: false,
        },
        text: 'No team chat context available.',
      };
    }

    try {
      // Query messages from user and coordinator
      const recentMsgs = await db
        .select()
        .from(messagesTable)
        .where(
          and(
            eq(messagesTable.chatId, teamChatId),
            inArray(messagesTable.senderId, [ownerId, COORDINATOR_SENDER_ID])
          )
        )
        .orderBy(desc(messagesTable.createdAt))
        .limit(15);

      if (recentMsgs.length === 0) {
        return {
          data: { recentMessages: [], messageCount: 0 },
          values: {
            recentMessages: 'No previous conversation history with this user.',
            messageCount: 0,
            hasHistory: false,
          },
          text: 'No previous conversation history with this user.',
        };
      }

      // Format messages (oldest first for conversation flow)
      const formattedMessages = recentMsgs
        .reverse()
        .map((msg) => {
          const speaker = msg.senderId === ownerId ? 'User' : 'You';
          const time = formatTime(msg.createdAt);
          const relativeTime = formatRelativeTime(msg.createdAt);
          return `${time} (${relativeTime}) ${speaker}: ${msg.content}`;
        })
        .join('\n');

      return {
        data: {
          recentMessages: recentMsgs,
          messageCount: recentMsgs.length,
        },
        values: {
          recentMessages: formattedMessages,
          messageCount: recentMsgs.length,
          hasHistory: true,
        },
        text: formattedMessages,
      };
    } catch (error) {
      console.error(
        '[CoordinatorRecentMessagesProvider] Error fetching messages:',
        error
      );
      return {
        data: { recentMessages: [], messageCount: 0 },
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
