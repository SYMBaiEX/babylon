/**
 * useTeamChat Hook
 *
 * Manages the user's Command Center team chat - a unified group chat
 * containing all their agents.
 */

import { usePrivy } from '@privy-io/react-auth';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ChatDetails, ChatParticipant } from '@/components/chats/types';
import { useChatMessages } from '@/hooks/useChatMessages';
import { useSSEChannel } from '@/hooks/useSSE';
import { useAuthStore } from '@/stores/authStore';

/** Typing user info */
interface TypingUser {
  userId: string;
  displayName: string;
  expiresAt: number;
}

/** Thinking agent info - for complex queries that take longer */
interface ThinkingAgent {
  agentId: string;
  agentName: string;
  thinkingLabel: string | null;
  expiresAt: number;
}

/** Agent info in team chat */
interface TeamChatAgent {
  id: string;
  username: string | null;
  displayName: string | null;
  profileImageUrl: string | null;
  isAgent: boolean;
}

/** Team chat info from API */
interface TeamChatInfo {
  id: string;
  chatId: string;
  groupId: string;
  createdAt: string;
  updatedAt: string;
  agents: TeamChatAgent[];
  agentCount: number;
}

/** Hook return type */
interface UseTeamChatReturn {
  // State
  teamChat: TeamChatInfo | null;
  chatDetails: ChatDetails | null;
  loading: boolean;
  sending: boolean;
  error: string | null;

  // SSE connection
  sseConnected: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;

  // Message state
  messageInput: string;
  setMessageInput: (value: string) => void;
  handleInputChange: (value: string) => void;

  // Typing and thinking indicators
  typingUsers: TypingUser[];
  thinkingAgents: ThinkingAgent[];
  sendError: string | null;
  mentionedAgentIds: string[];
  setMentionedAgentIds: (ids: string[]) => void;

  // Refs
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  topSentinelRef: React.RefObject<HTMLDivElement | null>;
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;

  // Actions
  sendMessage: () => Promise<void>;
  refresh: () => Promise<void>;
  handleScroll: (container: HTMLDivElement) => void;
}

export function useTeamChat(): UseTeamChatReturn {
  const { user } = useAuthStore();
  const { getAccessToken } = usePrivy();

  // Team chat state
  const [teamChat, setTeamChat] = useState<TeamChatInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Message state
  const [messageInput, setMessageInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [mentionedAgentIds, setMentionedAgentIds] = useState<string[]>([]);

  // Typing indicator state
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef = useRef(false);

  // Thinking indicator state (for complex queries)
  const [thinkingAgents, setThinkingAgents] = useState<ThinkingAgent[]>([]);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const topSentinelRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const wasNearBottomRef = useRef(true);
  const prevMessageCountRef = useRef(0);

  // SSE for real-time messages
  const {
    messages: realtimeMessages,
    isLoading: isMessagesLoading,
    isConnected: sseConnected,
    isLoadingMore,
    hasMore,
    addMessage,
  } = useChatMessages(teamChat?.chatId ?? null);

  // Helper to find scroll container from messagesEndRef
  const getScrollContainer = useCallback((): HTMLElement | null => {
    return messagesEndRef.current?.closest(
      '[class*="overflow"]'
    ) as HTMLElement | null;
  }, []);

  // Scroll to bottom helper
  const scrollToBottom = useCallback(
    (behavior: 'instant' | 'smooth' = 'instant') => {
      const container = getScrollContainer();
      if (container) {
        if (behavior === 'instant') {
          container.scrollTop = container.scrollHeight;
        } else {
          container.scrollTo({
            top: container.scrollHeight,
            behavior: 'smooth',
          });
        }
      } else {
        messagesEndRef.current?.scrollIntoView({ behavior });
      }
    },
    [getScrollContainer]
  );

  // Initial scroll: Wait for scrollHeight to stabilize
  const hasInitialScrolledRef = useRef(false);
  useEffect(() => {
    if (
      realtimeMessages.length === 0 ||
      hasInitialScrolledRef.current ||
      isMessagesLoading
    ) {
      return;
    }

    hasInitialScrolledRef.current = true;
    const container = getScrollContainer();
    if (!container) {
      scrollToBottom('instant');
      return;
    }

    // Poll until scrollHeight stabilizes (content fully rendered)
    let lastHeight = 0;
    let stableFrames = 0;
    let frameId: number;

    const pollUntilStable = () => {
      const currentHeight = container.scrollHeight;
      if (currentHeight === lastHeight && currentHeight > 0) {
        if (++stableFrames >= 5) {
          container.scrollTop = currentHeight;
          return;
        }
      } else {
        stableFrames = 0;
        lastHeight = currentHeight;
      }
      frameId = requestAnimationFrame(pollUntilStable);
    };

    const timeoutId = setTimeout(pollUntilStable, 50);
    return () => {
      clearTimeout(timeoutId);
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [
    realtimeMessages.length,
    isMessagesLoading,
    scrollToBottom,
    getScrollContainer,
  ]);

  // Reset scroll tracking when chat changes
  const chatId = teamChat?.chatId;
  useEffect(() => {
    hasInitialScrolledRef.current = false;
    prevMessageCountRef.current = 0;
    wasNearBottomRef.current = true;
  }, [chatId]);

  // Auto-scroll when NEW messages arrive (count increases), if user was near bottom
  useEffect(() => {
    const messageCount = realtimeMessages.length;
    const prevCount = prevMessageCountRef.current;
    prevMessageCountRef.current = messageCount;

    // Skip initial load (handled by separate effect)
    if (prevCount === 0) return;

    // Only scroll if count INCREASED (not replacements) and user was near bottom
    if (messageCount > prevCount && wasNearBottomRef.current) {
      // Small delay to let DOM update
      setTimeout(() => scrollToBottom('instant'), 20);
    }
  }, [realtimeMessages.length, scrollToBottom]);

  // Maintain scroll position when messages are replaced (optimistic → confirmed)
  // Runs synchronously before paint to prevent visible jump
  const prevMessageIdsRef = useRef<string>('');
  useLayoutEffect(() => {
    if (!wasNearBottomRef.current || realtimeMessages.length === 0) return;

    const currentIds = realtimeMessages.map((m) => m.id).join(',');
    if (currentIds === prevMessageIdsRef.current) return;

    const prevIds = prevMessageIdsRef.current;
    prevMessageIdsRef.current = currentIds;
    if (prevIds === '') return;

    // If count unchanged but IDs changed → replacement happened
    if (prevIds.split(',').length === realtimeMessages.length) {
      const container = getScrollContainer();
      if (container) container.scrollTop = container.scrollHeight;
    }
  }, [realtimeMessages, getScrollContainer]);

  // Track scroll position to determine if user is near bottom
  // This is called from the scroll container in TeamChatView
  const handleScroll = useCallback((container: HTMLDivElement) => {
    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    // Consider "near bottom" if within 150px of the bottom
    wasNearBottomRef.current = distanceFromBottom < 150;
  }, []);

  // Handle typing and thinking indicator SSE events
  const handleIndicatorEvent = useCallback(
    (data: Record<string, unknown>) => {
      // Handle typing indicator (user or agent is typing)
      if (data.type === 'typing_indicator') {
        const userId = data.userId as string;
        const displayName = data.displayName as string;
        const isTyping = data.isTyping as boolean;

        // Don't show our own typing
        if (userId === user?.id) return;

        setTypingUsers((prev) => {
          if (isTyping) {
            // Add or update typing user (expires after 5 seconds)
            const expiresAt = Date.now() + 5000;
            const existing = prev.find((u) => u.userId === userId);
            if (existing) {
              return prev.map((u) =>
                u.userId === userId ? { ...u, expiresAt } : u
              );
            }
            return [...prev, { userId, displayName, expiresAt }];
          } else {
            // Remove typing user
            return prev.filter((u) => u.userId !== userId);
          }
        });
      }

      // Handle thinking indicator (agent is processing complex query)
      if (data.type === 'thinking_indicator') {
        const agentId = data.agentId as string;
        const agentName = data.agentName as string;
        const isThinking = data.isThinking as boolean;
        const thinkingLabel = (data.thinkingLabel as string) ?? null;

        setThinkingAgents((prev) => {
          if (isThinking) {
            // Add or update thinking agent (expires after 60 seconds - longer for complex queries)
            const expiresAt = Date.now() + 60000;
            const existing = prev.find((a) => a.agentId === agentId);
            if (existing) {
              return prev.map((a) =>
                a.agentId === agentId ? { ...a, thinkingLabel, expiresAt } : a
              );
            }
            return [...prev, { agentId, agentName, thinkingLabel, expiresAt }];
          } else {
            // Remove thinking agent
            return prev.filter((a) => a.agentId !== agentId);
          }
        });
      }
    },
    [user?.id]
  );

  // Subscribe to typing/thinking events on the chat channel.
  // Memoized to prevent re-subscription on every render - useSSEChannel uses
  // the channel identity to determine when to reconnect. Without memoization,
  // a new string would be created each render, causing unnecessary re-subscriptions.
  const indicatorChannel = useMemo(
    () => (teamChat?.chatId ? (`chat:${teamChat.chatId}` as const) : null),
    [teamChat?.chatId]
  );
  useSSEChannel(indicatorChannel, handleIndicatorEvent);

  // Clean up expired typing and thinking indicators.
  // 2s interval is sufficient since typing expiry is 5s - no need for 1s precision.
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setTypingUsers((prev) => prev.filter((u) => u.expiresAt > now));
      setThinkingAgents((prev) => prev.filter((a) => a.expiresAt > now));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Send typing indicator
  const sendTypingIndicator = useCallback(
    async (isTyping: boolean) => {
      if (!teamChat) return;

      const token = await getAccessToken();
      if (!token) return;

      // Fire and forget - don't block on typing indicators
      fetch('/api/agents/team-chat/typing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isTyping }),
      }).catch((err) => {
        // Log for debugging but don't block user experience
        console.debug('Typing indicator failed:', err);
      });
    },
    [teamChat, getAccessToken]
  );

  // Debounced typing handler
  const handleInputChange = useCallback(
    (value: string) => {
      setMessageInput(value);

      // Send "typing" on first keystroke
      if (value.length > 0 && !isTypingRef.current) {
        isTypingRef.current = true;
        sendTypingIndicator(true);
      }

      // Clear existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      // Stop typing after 2 seconds of inactivity
      typingTimeoutRef.current = setTimeout(() => {
        if (isTypingRef.current) {
          isTypingRef.current = false;
          sendTypingIndicator(false);
        }
      }, 2000);

      // Stop typing if input is cleared
      if (value.length === 0 && isTypingRef.current) {
        isTypingRef.current = false;
        sendTypingIndicator(false);
      }
    },
    [sendTypingIndicator]
  );

  // Cleanup typing state on unmount.
  // Wrapped in try-catch since sendTypingIndicator is async and may fail if
  // network/auth state is already torn down during unmount.
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (isTypingRef.current) {
        try {
          sendTypingIndicator(false);
        } catch {
          // Ignore errors during unmount - component is being destroyed anyway
        }
      }
    };
  }, [sendTypingIndicator]);

  // Fetch team chat info
  const fetchTeamChat = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const token = await getAccessToken();
      if (!token) {
        return;
      }

      // Use POST to ensure team chat exists and sync any pre-existing agents
      const response = await fetch('/api/agents/team-chat', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.status === 404) {
        // No team chat exists - user has no agents
        setTeamChat(null);
        return;
      }

      if (!response.ok) {
        const data = await response.json();
        setError(data.message || data.error || 'Failed to load Command Center');
        return;
      }

      const data = await response.json();
      setTeamChat(data.teamChat);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load Command Center'
      );
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  // Initial load
  useEffect(() => {
    if (user?.id) {
      fetchTeamChat();
    }
  }, [user?.id, fetchTeamChat]);

  // Build chat details from team chat info and realtime messages
  const chatDetails: ChatDetails | null = teamChat
    ? {
        chat: {
          id: teamChat.chatId,
          name: 'Command Center',
          isGroup: true,
          createdAt: teamChat.createdAt,
          updatedAt: teamChat.updatedAt,
        },
        messages: realtimeMessages,
        participants: [
          // Include the user
          ...(user
            ? [
                {
                  id: user.id,
                  displayName: user.displayName || user.username || 'You',
                  username: user.username,
                  profileImageUrl: user.profileImageUrl,
                } as ChatParticipant,
              ]
            : []),
          // Include all agents
          ...teamChat.agents.map(
            (agent) =>
              ({
                id: agent.id,
                displayName: agent.displayName || agent.username || 'Agent',
                username: agent.username,
                profileImageUrl: agent.profileImageUrl,
              }) as ChatParticipant
          ),
        ],
      }
    : null;

  // Send message with optimistic update (iMessage-style)
  const sendMessage = useCallback(async () => {
    if (!teamChat || !messageInput.trim() || sending) return;

    // Stop typing indicator
    if (isTypingRef.current) {
      isTypingRef.current = false;
      sendTypingIndicator(false);
    }

    const content = messageInput.trim();
    const mentionedIds = [...mentionedAgentIds];

    // Create optimistic message (stableKey prevents flash on confirmation)
    const optimisticId = `pending-${Date.now()}`;
    addMessage({
      id: optimisticId,
      chatId: teamChat.chatId,
      content,
      senderId: user?.id || '',
      type: 'user',
      createdAt: new Date().toISOString(),
      stableKey: optimisticId,
    });

    setMessageInput('');
    setMentionedAgentIds([]);
    setSending(true);
    setSendError(null);

    try {
      const token = await getAccessToken();
      if (!token) {
        setSendError('Not authenticated');
        return;
      }

      const response = await fetch('/api/agents/team-chat/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          content,
          mentionedAgentIds: mentionedIds.length > 0 ? mentionedIds : undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        setSendError(data.message || data.error || 'Failed to send message');
      }
    } catch (err) {
      setSendError(
        err instanceof Error ? err.message : 'Failed to send message'
      );
    } finally {
      setSending(false);
    }
  }, [
    teamChat,
    messageInput,
    sending,
    mentionedAgentIds,
    user?.id,
    getAccessToken,
    addMessage,
    sendTypingIndicator,
  ]);

  return {
    teamChat,
    chatDetails,
    loading,
    sending,
    error,
    sseConnected,
    isLoadingMore,
    hasMore,
    messageInput,
    setMessageInput,
    handleInputChange,
    typingUsers,
    thinkingAgents,
    sendError,
    mentionedAgentIds,
    setMentionedAgentIds,
    messagesEndRef,
    topSentinelRef,
    messagesContainerRef,
    sendMessage,
    refresh: fetchTeamChat,
    handleScroll,
  };
}
