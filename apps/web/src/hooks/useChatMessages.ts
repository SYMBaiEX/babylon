import { logger, type MessageMetadata } from '@babylon/shared';
import { usePrivy } from '@privy-io/react-auth';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type MessageReactionSummary,
  type MessageType,
  MessageTypeEnum,
  type ReplyToMessage,
} from '@/components/chats/types';
import { CHAT_PAGE_SIZE } from '@/lib/constants';
import { useAuthStore } from '@/stores/authStore';
import { useSSEChannel } from './useSSE';
import { applyReactionDelta } from './useToggleReaction';

/**
 * Represents a chat message in the system.
 */
export interface ChatMessage {
  id: string;
  content: string;
  chatId: string;
  senderId: string;
  type?: MessageType;
  createdAt: string;
  isGameChat?: boolean;
  /** Stable key for React rendering - prevents flash when optimistic messages are replaced */
  stableKey?: string;
  /** Whether this message is a "thinking" placeholder (shows spinner while waiting for response) */
  isThinking?: boolean;
  /** Metadata containing action tags for sidebar display */
  metadata?: MessageMetadata | null;
  /** Aggregated emoji reactions summary (counts + whether current user reacted). */
  reactions?: MessageReactionSummary[];
  /** ID of the message this is replying to */
  replyToMessageId?: string | null;
  /** Denormalized snippet of the replied-to message */
  replyToMessage?: ReplyToMessage | null;
}

/** Raw message from API (createdAt may be string or Date) */
interface RawApiMessage {
  id: string;
  content: string;
  senderId: string;
  type?: MessageType;
  createdAt: string | Date;
  metadata?: MessageMetadata | null;
  reactions?: MessageReactionSummary[];
  replyToMessageId?: string | null;
  replyToMessage?: ReplyToMessage | null;
}

/** Format raw API message to ChatMessage */
function formatMessage(msg: RawApiMessage, chatId: string): ChatMessage {
  return {
    id: msg.id,
    content: msg.content,
    chatId,
    senderId: msg.senderId,
    type: msg.type,
    createdAt:
      typeof msg.createdAt === 'string'
        ? msg.createdAt
        : msg.createdAt.toISOString(),
    metadata: msg.metadata,
    reactions: msg.reactions,
    replyToMessageId: msg.replyToMessageId,
    replyToMessage: msg.replyToMessage,
  };
}

/**
 * Prefix for optimistic message IDs. Used so SSE/replaceOptimisticMessage can
 * match and replace placeholders instead of appending duplicates.
 */
export enum OptimisticMessageIdPrefix {
  /** User message not yet confirmed by server */
  Pending = 'pending-',
  /** Agent/coordinator response in progress (thinking placeholder) */
  Thinking = 'thinking-',
}

/**
 * Time window (ms) for matching optimistic messages to confirmed messages.
 * If a confirmed message arrives within this window of an optimistic message
 * with matching content and sender, they are considered the same message.
 */
const OPTIMISTIC_MATCH_WINDOW_MS = 30000;

/** Check if a message is an optimistic placeholder matching the incoming confirmed message */
function isMatchingOptimistic(
  pending: ChatMessage,
  incoming: ChatMessage
): boolean {
  const inWindow =
    Math.abs(
      new Date(pending.createdAt).getTime() -
        new Date(incoming.createdAt).getTime()
    ) < OPTIMISTIC_MATCH_WINDOW_MS;
  if (pending.id.startsWith(OptimisticMessageIdPrefix.Pending)) {
    return (
      pending.senderId === incoming.senderId &&
      pending.content === incoming.content &&
      inWindow
    );
  }
  if (pending.id.startsWith(OptimisticMessageIdPrefix.Thinking)) {
    return pending.senderId === incoming.senderId && inWindow;
  }
  return false;
}

/**
 * Adds a confirmed message to the list, replacing any matching optimistic message.
 * Preserves the stableKey from the optimistic message to prevent React remount.
 * Merges metadata from SSE messages when a message with the same ID already exists.
 */
function replaceOptimisticMessage(
  messages: ChatMessage[],
  confirmed: ChatMessage
): ChatMessage[] {
  // Check if message with same ID already exists
  const existingIdx = messages.findIndex((msg) => msg.id === confirmed.id);
  if (existingIdx >= 0) {
    const existingMsg = messages[existingIdx];
    // Merge metadata from confirmed message (SSE) into existing message
    // This handles the case where updateMessage is called first (without metadata)
    // and then SSE arrives with metadata
    if (confirmed.metadata && existingMsg && !existingMsg.metadata) {
      return messages.map((msg, idx) =>
        idx === existingIdx ? { ...msg, metadata: confirmed.metadata } : msg
      );
    }
    return messages;
  }

  // Replace optimistic message if found
  const pending = messages.find((msg) => isMatchingOptimistic(msg, confirmed));
  if (pending) {
    // Preserve the optimistic message's createdAt to maintain visual order
    // The server timestamp might differ due to network latency, but we want
    // to keep the message in the same position the user saw it
    return messages.map((msg) =>
      msg.id === pending.id
        ? {
            ...confirmed,
            stableKey: pending.stableKey || pending.id,
            createdAt: pending.createdAt,
          }
        : msg
    );
  }

  // Don't sort - just append. This preserves visual order during real-time chat.
  // Messages are already sorted when loaded from API.
  return [...messages, confirmed];
}

function reactionsEqual(
  a: MessageReactionSummary[] | undefined,
  b: MessageReactionSummary[] | undefined
): boolean {
  if (!a?.length && !b?.length) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  const key = (r: MessageReactionSummary) =>
    `${r.emoji}:${r.count}:${r.reactedByMe ? 1 : 0}`;
  const as = [...a].map(key).sort().join('|');
  const bs = [...b].map(key).sort().join('|');
  return as === bs;
}

/** Polling interval - less aggressive since SSE is primary */
const POLLING_INTERVAL_MS = 15000;

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
  const { getAccessToken } = usePrivy();
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const previousChatIdRef = useRef<string | null>(null);
  const hasLoadedRef = useRef<Set<string>>(new Set());
  const pendingReactionDeltasRef = useRef<Set<string>>(new Set());

  const markPendingReactionDelta = useCallback(
    (delta: {
      messageId: string;
      emoji: string;
      action: 'added' | 'removed';
    }) => {
      const key = `${delta.messageId}:${delta.emoji}:${delta.action}`;
      pendingReactionDeltasRef.current.add(key);
      // Safety: auto-expire in case the SSE event never arrives.
      setTimeout(() => pendingReactionDeltasRef.current.delete(key), 5000);
    },
    []
  );

  // Load existing messages from API (initial load)
  const loadMessages = useCallback(
    async (chatId: string) => {
      if (hasLoadedRef.current.has(chatId)) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      // Get auth token for authenticated request
      const token = await getAccessToken();
      if (!token) {
        logger.error(
          'Failed to load messages - no auth token',
          { chatId },
          'useChatMessages'
        );
        setIsLoading(false);
        return;
      }

      const response = await fetch(
        `/api/chats/${chatId}?limit=${CHAT_PAGE_SIZE}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.messages) {
          const formatted = (data.messages as RawApiMessage[]).map((msg) =>
            formatMessage(msg, chatId)
          );
          setMessages(formatted);
          setHasMore(data.pagination?.hasMore ?? false);
          setNextCursor(data.pagination?.nextCursor ?? null);
          hasLoadedRef.current.add(chatId);
          logger.debug(
            `Loaded ${formatted.length} messages`,
            { chatId, count: formatted.length },
            'useChatMessages'
          );
        }
      } else {
        logger.error(
          'Failed to load messages',
          { chatId, status: response.status },
          'useChatMessages'
        );
      }
      setIsLoading(false);
    },
    [getAccessToken]
  );

  // Load more older messages (pagination)
  const loadMore = useCallback(async () => {
    if (!chatId || !nextCursor || isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);

    // Get auth token for authenticated request
    const token = await getAccessToken();
    if (!token) {
      logger.error(
        'Failed to load more messages - no auth token',
        { chatId },
        'useChatMessages'
      );
      setIsLoadingMore(false);
      return;
    }

    const response = await fetch(
      `/api/chats/${chatId}?cursor=${nextCursor}&limit=${CHAT_PAGE_SIZE}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (response.ok) {
      const data = await response.json();
      if (data.messages?.length > 0) {
        const formatted = (data.messages as RawApiMessage[]).map((msg) =>
          formatMessage(msg, chatId)
        );
        setMessages((prev) => [...formatted, ...prev]);
        setHasMore(data.pagination?.hasMore ?? false);
        setNextCursor(data.pagination?.nextCursor ?? null);
      }
    } else {
      logger.error(
        'Failed to load more messages',
        { chatId, status: response.status },
        'useChatMessages'
      );
    }
    setIsLoadingMore(false);
  }, [chatId, nextCursor, isLoadingMore, hasMore, getAccessToken]);

  // Handle SSE updates for this chat
  const handleChatUpdate = useCallback(
    (data: Record<string, unknown>) => {
      if (data.type === 'new_message' && data.message) {
        const m = data.message as Record<string, unknown>;
        // Type guard for required fields
        if (
          typeof m.id !== 'string' ||
          typeof m.content !== 'string' ||
          typeof m.chatId !== 'string' ||
          typeof m.senderId !== 'string' ||
          typeof m.createdAt !== 'string' ||
          m.chatId !== chatId
        ) {
          return;
        }

        const newMessage: ChatMessage = {
          id: m.id,
          content: m.content,
          chatId: m.chatId,
          senderId: m.senderId,
          type:
            m.type === MessageTypeEnum.USER ||
            m.type === MessageTypeEnum.SYSTEM ||
            m.type === MessageTypeEnum.COORDINATOR
              ? (m.type as MessageType)
              : undefined,
          createdAt: m.createdAt,
          isGameChat:
            typeof m.isGameChat === 'boolean' ? m.isGameChat : undefined,
          metadata: m.metadata as MessageMetadata | null | undefined,
          reactions: Array.isArray(m.reactions)
            ? (m.reactions as MessageReactionSummary[])
            : undefined,
          replyToMessageId:
            typeof m.replyToMessageId === 'string'
              ? m.replyToMessageId
              : undefined,
          replyToMessage: m.replyToMessage as ReplyToMessage | null | undefined,
        };

        setIsLoading(false);
        setMessages((prev) => replaceOptimisticMessage(prev, newMessage));
        return;
      }

      if (data.type === 'message_reaction' && data.reaction) {
        const r = data.reaction as Record<string, unknown>;
        if (
          typeof r.messageId !== 'string' ||
          typeof r.chatId !== 'string' ||
          typeof r.emoji !== 'string' ||
          typeof r.userId !== 'string' ||
          typeof r.action !== 'string' ||
          r.chatId !== chatId ||
          (r.action !== 'added' && r.action !== 'removed')
        ) {
          return;
        }

        const isMine = !!user?.id && r.userId === user.id;
        const emoji = r.emoji;
        const action = r.action as 'added' | 'removed';

        if (isMine) {
          const key = `${r.messageId}:${emoji}:${action}`;
          if (pendingReactionDeltasRef.current.has(key)) {
            pendingReactionDeltasRef.current.delete(key);
            return;
          }
        }

        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === r.messageId);
          if (idx < 0) return prev;
          const msg = prev[idx]!;
          const next = applyReactionDelta(msg.reactions, emoji, action, isMine);
          return prev.map((m, i) =>
            i === idx ? { ...m, reactions: next } : m
          );
        });
      }
    },
    [chatId, user?.id]
  );

  // Subscribe to chat channel
  const channel: `chat:${string}` | null = chatId ? `chat:${chatId}` : null;
  const { isConnected } = useSSEChannel(channel, handleChatUpdate);

  // Load messages when switching chats
  useEffect(() => {
    const previousChatId = previousChatIdRef.current;

    if (previousChatId !== chatId) {
      // Clear the "already loaded" flag so switching back to this chat will reload
      if (previousChatId) {
        hasLoadedRef.current.delete(previousChatId);
      }
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

  // Polling fallback for SSE edge cases
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!chatId) return;

    // Start polling after brief delay for initial load
    const startTimeout = setTimeout(() => {
      pollIntervalRef.current = setInterval(async () => {
        try {
          // Get auth token for authenticated request
          const token = await getAccessToken();
          if (!token) return;

          const response = await fetch(
            `/api/chats/${chatId}?limit=${CHAT_PAGE_SIZE}`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          );
          if (!response.ok) return;

          const data = await response.json();
          if (!data.messages) return;

          const formatted = (data.messages as RawApiMessage[]).map((msg) =>
            formatMessage(msg, chatId)
          );

          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const updated = [...prev];
            let changed = false;

            for (const msg of formatted) {
              if (existingIds.has(msg.id)) {
                const existingIdx = updated.findIndex((m) => m.id === msg.id);
                if (existingIdx < 0) continue;
                const existing = updated[existingIdx]!;

                // Merge in reactions/metadata updates from the API snapshot.
                if (!reactionsEqual(existing.reactions, msg.reactions)) {
                  updated[existingIdx] = {
                    ...existing,
                    reactions: msg.reactions,
                  };
                  changed = true;
                }
                if (msg.metadata && !existing.metadata) {
                  updated[existingIdx] = {
                    ...updated[existingIdx]!,
                    metadata: msg.metadata,
                  };
                  changed = true;
                }
                continue;
              }

              const pending = updated.find((m) => isMatchingOptimistic(m, msg));
              if (pending) {
                const idx = updated.indexOf(pending);
                // Preserve original timestamp to maintain visual order
                updated[idx] = {
                  ...msg,
                  stableKey: pending.stableKey || pending.id,
                  createdAt: pending.createdAt,
                };
                changed = true;
              } else {
                // Just append new messages, don't sort
                updated.push(msg);
                changed = true;
              }
            }

            return changed ? updated : prev;
          });

          hasLoadedRef.current.add(chatId);
        } catch (error) {
          logger.warn(
            'Polling failed',
            { chatId, error: String(error) },
            'useChatMessages'
          );
        }
      }, POLLING_INTERVAL_MS);
    }, 1000);

    return () => {
      clearTimeout(startTimeout);
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [chatId, getAccessToken]);

  // SSE connected means we're ready
  useEffect(() => {
    if (isConnected && chatId) setIsLoading(false);
  }, [isConnected, chatId]);

  const addMessage = useCallback((message: ChatMessage) => {
    // Optimistic/thinking messages should be appended directly without replacement logic
    // Only confirmed messages (from SSE) should go through replacement to match their optimistic
    const isOptimistic =
      message.id.startsWith(OptimisticMessageIdPrefix.Pending) ||
      message.id.startsWith(OptimisticMessageIdPrefix.Thinking);
    if (isOptimistic) {
      setMessages((prev) => [...prev, message]);
    } else {
      setMessages((prev) => replaceOptimisticMessage(prev, message));
    }
  }, []);

  const updateMessage = useCallback(
    (messageId: string, updates: Partial<ChatMessage>) => {
      setMessages((prev) =>
        prev.map((msg) => (msg.id === messageId ? { ...msg, ...updates } : msg))
      );
    },
    []
  );

  const removeMessage = useCallback((messageId: string) => {
    setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
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
    updateMessage,
    removeMessage,
    clearMessages,
    reloadMessages,
    isConnected,
    markPendingReactionDelta,
  };
}
