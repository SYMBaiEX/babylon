/**
 * Recent Messages Provider
 *
 * Provides conversation history from Babylon's agentMessages table.
 * This uses Babylon's DB schema instead of ElizaOS memories.
 *
 * Also includes Team Chat Messages Provider for Command Center conversations.
 */

import { db, desc, eq, inArray, messages, users } from '@babylon/db';
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

/**
 * Format user name from display name and username
 * Returns: "displayName (@username)" or "@username" or "Unknown"
 */
function formatUserName(
  displayName: string | null,
  username: string | null
): string {
  if (displayName && username) return `${displayName} (@${username})`;
  if (displayName) return displayName;
  if (username) return `@${username}`;
  return 'Unknown';
}

/**
 * Team Chat Messages Provider
 *
 * Fetches recent messages from a team chat (Command Center) and formats
 * them with proper participant names for LLM context.
 *
 * Requires `teamChatId` to be set in state.values or runtime settings.
 */
export const teamChatMessagesProvider: Provider = {
  name: 'TEAM_CHAT_MESSAGES',
  description: 'Recent conversation history from team Command Center chat',

  get: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State
  ): Promise<ProviderResult> => {
    const agentUserId = runtime.agentId;

    // Get chatId from multiple sources (in priority order):
    // 1. message.roomId - The ElizaOS way (room = chat)
    // 2. state.values.teamChatId - If manually set before composeState
    // 3. runtime.getSetting('TEAM_CHAT_ID') - If configured in runtime
    const chatId =
      (message?.roomId as string) ||
      (state?.values?.teamChatId as string) ||
      (runtime.getSetting('TEAM_CHAT_ID') as string);

    if (!chatId) {
      return {
        data: {
          teamChatMessages: [],
          messageCount: 0,
        },
        values: {
          teamChatMessages: 'No team chat configured.',
          messageCount: 0,
          hasTeamChat: false,
        },
        text: 'No team chat configured.',
      };
    }

    try {
      // Fetch recent messages from the chat
      const chatMessages = await db
        .select({
          id: messages.id,
          content: messages.content,
          senderId: messages.senderId,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(eq(messages.chatId, chatId))
        .orderBy(desc(messages.createdAt))
        .limit(15);

      if (chatMessages.length === 0) {
        return {
          data: {
            teamChatMessages: [],
            messageCount: 0,
          },
          values: {
            teamChatMessages: 'No messages in team chat yet.',
            messageCount: 0,
            hasTeamChat: true,
          },
          text: 'No messages in team chat yet.',
        };
      }

      // Collect all unique sender IDs
      const senderIds = [...new Set(chatMessages.map((m) => m.senderId))];

      // Batch fetch all sender info
      const senderInfoMap = new Map<
        string,
        { displayName: string | null; username: string | null }
      >();

      if (senderIds.length > 0) {
        const senderUsers = await db
          .select({
            id: users.id,
            displayName: users.displayName,
            username: users.username,
          })
          .from(users)
          .where(inArray(users.id, senderIds));

        for (const user of senderUsers) {
          senderInfoMap.set(user.id, {
            displayName: user.displayName,
            username: user.username,
          });
        }
      }

      // Helper to get speaker name
      const getSpeakerName = (senderId: string): string => {
        if (senderId === agentUserId) {
          return 'You';
        }
        const sender = senderInfoMap.get(senderId);
        return formatUserName(
          sender?.displayName ?? null,
          sender?.username ?? null
        );
      };

      // Format messages (oldest first for conversation flow)
      const formattedMessages = chatMessages
        .reverse()
        .map((msg) => {
          const speaker = getSpeakerName(msg.senderId);
          const time = formatTime(msg.createdAt);
          const relativeTime = formatRelativeTime(msg.createdAt);
          return `${time} (${relativeTime}) ${speaker}: ${msg.content}`;
        })
        .join('\n');

      return {
        data: {
          teamChatMessages: chatMessages,
          messageCount: chatMessages.length,
          senderMap: Object.fromEntries(senderInfoMap),
        },
        values: {
          teamChatMessages: formattedMessages,
          messageCount: chatMessages.length,
          hasTeamChat: true,
        },
        text: formattedMessages,
      };
    } catch (error) {
      console.error(
        '[TeamChatMessagesProvider] Error fetching messages:',
        error
      );
      return {
        data: {
          teamChatMessages: [],
          messageCount: 0,
        },
        values: {
          teamChatMessages: 'Error retrieving team chat history.',
          messageCount: 0,
          hasTeamChat: false,
        },
        text: 'Error retrieving team chat history.',
      };
    }
  },
};
