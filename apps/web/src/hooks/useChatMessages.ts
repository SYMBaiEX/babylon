import type { MessageType } from '@babylon/db';
import { logger } from '@babylon/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageTypeEnum } from '@/components/chats/types';
import { CHAT_PAGE_SIZE } from '@/lib/constants';
import { useSSEChannel } from './useSSE';

/**
 * Represents a chat message in the system.
 */
export interface ChatMessage {
  /** Unique message identifier */
  id: string;
  /** Message content/text */
  content: string;
  /** ID of the chat this message belongs to */
  chatId: string;
  /** ID of the user who sent the message */
  senderId: string;
  /** Message type: 'user' for regular messages, 'system' for system notifications */
  type?: MessageType;
  /** ISO timestamp when the message was created */
  createdAt: string;
  /** Whether this is a game chat message */
  isGameChat?: boolean;
  /**
   * Stable key for React rendering. Used to prevent flash when optimistic
   * messages are replaced with real ones. If not set, falls back to id.
   */
  stableKey?: string;
}

/**
 * Hook for managing chat messages with real-time SSE updates.
 *
 * Provides comprehensive chat message management including:
 * - Initial message loading with pagination
 * - Real-time message updates via SSE
 * - Message history pagination (load more)
 * - Automatic deduplication
 * - Polling fallback for multi-instance serverless environments
 *
 * Replaces the previous WebSocket-based implementation with SSE for better
 * Vercel compatibility. Messages are automatically sorted by timestamp.
 *
 * @param chatId - The ID of the chat to load messages for, or null to clear messages.
 *
 * @returns An object containing:
 * - `messages`: Array of chat messages sorted by timestamp
 * - `isLoading`: Whether initial messages are being loaded
 * - `isLoadingMore`: Whether more messages are being loaded (pagination)
 * - `hasMore`: Whether there are more messages to load
 * - `loadMore`: Function to load older messages
 * - `addMessage`: Function to manually add a message to the list
 * - `clearMessages`: Function to clear all messages
 * - `reloadMessages`: Function to reload messages from the API
 * - `isConnected`: Whether SSE connection is active
 *
 * @example
 * ```tsx
 * const { messages, isLoading, loadMore, hasMore } = useChatMessages(chatId);
 *
 * return (
 *   <div>
 *     {messages.map(msg => <div key={msg.id}>{msg.content}</div>)}
 *     {hasMore && <button onClick={loadMore}>Load More</button>}
 *   </div>
 * );
 * ```
 */
export function useChatMessages(chatId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const previousChatIdRef = useRef<string | null>(null);
  const hasLoadedRef = useRef<Set<string>>(new Set());

  // Load existing messages from API (initial load)
  const loadMessages = useCallback(async (chatId: string) => {
    // Skip if already loaded
    if (hasLoadedRef.current.has(chatId)) {
      logger.debug(
        `Skipping reload for ${chatId} - already loaded`,
        { chatId },
        'useChatMessages'
      );
      setIsLoading(false);
      return;
    }

    logger.debug(
      `Loading initial messages for chat ${chatId}`,
      { chatId },
      'useChatMessages'
    );
    setIsLoading(true);
    const response = await fetch(
      `/api/chats/${chatId}?limit=${CHAT_PAGE_SIZE}`
    );
    logger.debug(
      `Response status: ${response.status}`,
      { chatId, status: response.status },
      'useChatMessages'
    );

    if (response.ok) {
      const data = await response.json();
      if (data.messages) {
        const formattedMessages: ChatMessage[] = data.messages.map(
          (msg: {
            id: string;
            content: string;
            senderId: string;
            type?: MessageType;
            createdAt: string | Date;
          }) => ({
            id: msg.id,
            content: msg.content,
            chatId: chatId,
            senderId: msg.senderId,
            type: msg.type,
            createdAt:
              typeof msg.createdAt === 'string'
                ? msg.createdAt
                : msg.createdAt.toISOString(),
          })
        );
        setMessages(formattedMessages);
        setHasMore(data.pagination?.hasMore || false);
        setNextCursor(data.pagination?.nextCursor || null);
        hasLoadedRef.current.add(chatId);
        logger.debug(
          `Loaded ${formattedMessages.length} messages for chat ${chatId}`,
          {
            chatId,
            count: formattedMessages.length,
            hasMore: data.pagination?.hasMore,
          },
          'useChatMessages'
        );
      }
    } else {
      const errorData = await response.json().catch(() => null);
      logger.error(
        'Failed to load messages',
        { chatId, errorData, status: response.status },
        'useChatMessages'
      );
    }
    setIsLoading(false);
  }, []);

  // Load more older messages (pagination)
  const loadMore = useCallback(async () => {
    if (!chatId || !nextCursor || isLoadingMore || !hasMore) {
      logger.debug(
        'Skip loadMore',
        { chatId, nextCursor, isLoadingMore, hasMore },
        'useChatMessages'
      );
      return;
    }

    logger.debug(
      `Loading more messages with cursor: ${nextCursor}`,
      { chatId, cursor: nextCursor },
      'useChatMessages'
    );
    setIsLoadingMore(true);

    const response = await fetch(
      `/api/chats/${chatId}?cursor=${nextCursor}&limit=${CHAT_PAGE_SIZE}`
    );

    if (response.ok) {
      const data = await response.json();

      if (data.messages && data.messages.length > 0) {
        const formattedMessages: ChatMessage[] = data.messages.map(
          (msg: {
            id: string;
            content: string;
            senderId: string;
            type?: MessageType;
            createdAt: string | Date;
          }) => ({
            id: msg.id,
            content: msg.content,
            chatId: chatId,
            senderId: msg.senderId,
            type: msg.type,
            createdAt:
              typeof msg.createdAt === 'string'
                ? msg.createdAt
                : msg.createdAt.toISOString(),
          })
        );

        // Prepend older messages to the beginning
        setMessages((prev) => [...formattedMessages, ...prev]);
        setHasMore(data.pagination?.hasMore || false);
        setNextCursor(data.pagination?.nextCursor || null);

        logger.debug(
          `Loaded ${formattedMessages.length} more messages`,
          {
            chatId,
            count: formattedMessages.length,
            hasMore: data.pagination?.hasMore,
          },
          'useChatMessages'
        );
      }
    } else {
      logger.error(
        'Failed to load more messages',
        { chatId, status: response.status, statusText: response.statusText },
        'useChatMessages'
      );
    }

    setIsLoadingMore(false);
  }, [chatId, nextCursor, isLoadingMore, hasMore]);

  // Handle SSE updates for this chat
  const handleChatUpdate = useCallback(
    (data: Record<string, unknown>) => {
      if (data.type === 'new_message' && data.message) {
        const messageData = data.message as Record<string, unknown>;

        // Type guard for ChatMessage
        if (
          typeof messageData.id === 'string' &&
          typeof messageData.content === 'string' &&
          typeof messageData.chatId === 'string' &&
          typeof messageData.senderId === 'string' &&
          typeof messageData.createdAt === 'string'
        ) {
          const newMessage: ChatMessage = {
            id: messageData.id,
            content: messageData.content,
            chatId: messageData.chatId,
            senderId: messageData.senderId,
            type:
              messageData.type === MessageTypeEnum.USER ||
              messageData.type === MessageTypeEnum.SYSTEM
                ? (messageData.type as MessageType)
                : undefined,
            createdAt: messageData.createdAt,
            isGameChat:
              typeof messageData.isGameChat === 'boolean'
                ? messageData.isGameChat
                : undefined,
          };

          // Only add message if it's for the current chat
          if (newMessage.chatId === chatId) {
            setIsLoading(false);
            setMessages((prev) => {
              // Avoid exact duplicates by ID
              if (prev.some((msg) => msg.id === newMessage.id)) {
                return prev;
              }

              // Check if this is a real message replacing a pending optimistic message
              // Match by sender + content + close timestamp (within 30 seconds)
              const pendingMatchIndex = prev.findIndex(
                (msg) =>
                  msg.id.startsWith('pending-') &&
                  msg.senderId === newMessage.senderId &&
                  msg.content === newMessage.content &&
                  Math.abs(
                    new Date(msg.createdAt).getTime() -
                      new Date(newMessage.createdAt).getTime()
                  ) < 30000 // Within 30 seconds
              );

              if (pendingMatchIndex !== -1) {
                // Replace the optimistic message with the real one
                // Preserve the stableKey to prevent React remount flash
                const optimisticMsg = prev[pendingMatchIndex];
                const newMessages = [...prev];
                newMessages[pendingMatchIndex] = {
                  ...newMessage,
                  stableKey: optimisticMsg.stableKey || optimisticMsg.id,
                };
                return newMessages.sort(
                  (a, b) =>
                    new Date(a.createdAt).getTime() -
                    new Date(b.createdAt).getTime()
                );
              }

              return [...prev, newMessage].sort(
                (a, b) =>
                  new Date(a.createdAt).getTime() -
                  new Date(b.createdAt).getTime()
              );
            });
          }
        }
      }
    },
    [chatId]
  );

  // Subscribe to chat channel
  const channel: `chat:${string}` | null = chatId ? `chat:${chatId}` : null;
  const { isConnected } = useSSEChannel(channel, handleChatUpdate);

  // Load messages when switching chats
  useEffect(() => {
    const previousChatId = previousChatIdRef.current;

    if (previousChatId !== chatId) {
      if (chatId) {
        setMessages([]);
        setHasMore(false);
        setNextCursor(null);
        loadMessages(chatId);
      } else {
        setIsLoading(false);
        setMessages([]);
        setHasMore(false);
        setNextCursor(null);
      }
      previousChatIdRef.current = chatId;
    }
  }, [chatId, loadMessages]);

  // Polling fallback - runs less frequently since SSE is the primary mechanism
  // This is a safety net for edge cases where SSE might miss messages
  const POLLING_INTERVAL_MS = 15000; // 15 seconds - less aggressive since SSE works
  useEffect(() => {
    if (!chatId) return;

    // Start polling after a short delay to let initial load complete
    const startPolling = setTimeout(() => {
      const interval = setInterval(async () => {
        logger.debug(
          `Polling for new messages in chat ${chatId}`,
          { chatId },
          'useChatMessages'
        );

        try {
          const response = await fetch(
            `/api/chats/${chatId}?limit=${CHAT_PAGE_SIZE}`
          );
          if (response.ok) {
            const data = await response.json();
            if (data.messages) {
              const formattedMessages: ChatMessage[] = data.messages.map(
                (msg: {
                  id: string;
                  content: string;
                  senderId: string;
                  createdAt: string | Date;
                }) => ({
                  id: msg.id,
                  content: msg.content,
                  chatId: chatId,
                  senderId: msg.senderId,
                  createdAt:
                    typeof msg.createdAt === 'string'
                      ? msg.createdAt
                      : msg.createdAt.toISOString(),
                })
              );
              // Merge with existing messages, handling duplicates and optimistic messages
              setMessages((prev) => {
                const existingIds = new Set(prev.map((m) => m.id));
                const updatedMessages = [...prev];
                let addedCount = 0;

                for (const msg of formattedMessages) {
                  // Skip exact ID matches
                  if (existingIds.has(msg.id)) {
                    continue;
                  }

                  // Check if this replaces an optimistic message
                  const pendingMatchIndex = updatedMessages.findIndex(
                    (m) =>
                      m.id.startsWith('pending-') &&
                      m.senderId === msg.senderId &&
                      m.content === msg.content &&
                      Math.abs(
                        new Date(m.createdAt).getTime() -
                          new Date(msg.createdAt).getTime()
                      ) < 30000
                  );

                  if (pendingMatchIndex !== -1) {
                    // Replace optimistic message with real one
                    // Preserve stableKey to prevent React remount flash
                    const optimisticMsg = updatedMessages[pendingMatchIndex];
                    updatedMessages[pendingMatchIndex] = {
                      ...msg,
                      stableKey: optimisticMsg.stableKey || optimisticMsg.id,
                    };
                  } else {
                    // Add as new message
                    updatedMessages.push(msg);
                    addedCount++;
                  }
                }

                if (addedCount > 0) {
                  logger.info(
                    `Polling found ${addedCount} new messages`,
                    { chatId, count: addedCount },
                    'useChatMessages'
                  );
                }

                if (addedCount > 0 || updatedMessages !== prev) {
                  return updatedMessages.sort(
                    (a, b) =>
                      new Date(a.createdAt).getTime() -
                      new Date(b.createdAt).getTime()
                  );
                }
                return prev;
              });
              // Mark as loaded so other logic can proceed
              hasLoadedRef.current.add(chatId);
            }
          }
        } catch (error) {
          logger.warn(
            'Polling failed',
            { chatId, error: String(error) },
            'useChatMessages'
          );
        }
      }, POLLING_INTERVAL_MS); // Fallback polling - SSE is primary

      // Store interval ID for cleanup
      (
        window as unknown as {
          __chatPollInterval?: ReturnType<typeof setInterval>;
        }
      ).__chatPollInterval = interval;
    }, 1000); // Wait 1 second before starting polling

    return () => {
      clearTimeout(startPolling);
      const interval = (
        window as unknown as {
          __chatPollInterval?: ReturnType<typeof setInterval>;
        }
      ).__chatPollInterval;
      if (interval) clearInterval(interval);
    };
  }, [chatId]);

  // Mark as loaded when connected
  useEffect(() => {
    if (isConnected && chatId) {
      // Initial loading done - we're ready to receive messages
      setIsLoading(false);
    }
  }, [isConnected, chatId]);

  const addMessage = useCallback((message: ChatMessage) => {
    setMessages((prev) => {
      // Check for exact ID match (normal dedup)
      if (prev.some((msg) => msg.id === message.id)) {
        return prev;
      }

      // Check if this is a real message replacing a pending optimistic message
      // Match by sender + content + close timestamp (within 30 seconds)
      const pendingMatch = prev.find(
        (msg) =>
          msg.id.startsWith('pending-') &&
          msg.senderId === message.senderId &&
          msg.content === message.content &&
          Math.abs(
            new Date(msg.createdAt).getTime() -
              new Date(message.createdAt).getTime()
          ) < 30000
      );

      if (pendingMatch) {
        // Replace pending message with real message
        // Preserve stableKey to prevent React remount flash
        const replacementMsg = {
          ...message,
          stableKey: pendingMatch.stableKey || pendingMatch.id,
        };
        return prev
          .map((msg) => (msg.id === pendingMatch.id ? replacementMsg : msg))
          .sort(
            (a, b) =>
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
      }

      return [...prev, message].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    });
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    hasLoadedRef.current.clear();
  }, []);

  const reloadMessages = useCallback(() => {
    if (chatId) {
      hasLoadedRef.current.delete(chatId);
      loadMessages(chatId);
    }
  }, [chatId, loadMessages]);

  return {
    messages,
    isLoading,
    isLoadingMore,
    hasMore,
    loadMore,
    addMessage,
    clearMessages,
    reloadMessages,
    isConnected,
  };
}
