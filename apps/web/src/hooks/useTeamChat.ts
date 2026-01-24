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

// Constants for scroll behavior
const SCROLL_NEAR_BOTTOM_THRESHOLD = 150;
const SCROLL_STABLE_FRAMES_REQUIRED = 5;
// Maximum retries for scroll height stabilization (~2 seconds max)
const MAX_SCROLL_STABLE_RETRIES = 20;

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

  // Refs
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  topSentinelRef: React.RefObject<HTMLDivElement | null>;
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;

  // Agent selection (for parallel task execution)
  selectedAgentIds: Set<string>;
  processingAgentIds: Set<string>;
  toggleAgentSelection: (agentId: string) => void;
  selectAllAgents: () => void;
  deselectAllAgents: () => void;

  // Actions
  sendMessage: () => Promise<void>;
  refresh: () => Promise<void>;
  handleScroll: (container: HTMLDivElement) => void;
  scrollToBottom: (behavior?: 'instant' | 'smooth') => void;
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

  // Typing indicator state
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef = useRef(false);

  // Thinking indicator state (for complex queries)
  const [thinkingAgents, setThinkingAgents] = useState<ThinkingAgent[]>([]);

  // Agent selection state (for parallel task execution)
  const [selectedAgentIds, setSelectedAgentIds] = useState<Set<string>>(
    new Set()
  );
  const [processingAgentIds, setProcessingAgentIds] = useState<Set<string>>(
    new Set()
  );

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
    removeMessage,
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
    let retryCount = 0;
    let frameId: number;

    const pollUntilStable = () => {
      // Safety: abort after max retries to prevent infinite loops
      if (++retryCount > MAX_SCROLL_STABLE_RETRIES) {
        container.scrollTop = container.scrollHeight;
        return;
      }

      const currentHeight = container.scrollHeight;
      if (currentHeight === lastHeight && currentHeight > 0) {
        if (++stableFrames >= SCROLL_STABLE_FRAMES_REQUIRED) {
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: Intentionally reset refs when chatId changes
  useEffect(() => {
    hasInitialScrolledRef.current = false;
    prevMessageCountRef.current = 0;
    wasNearBottomRef.current = true;
  }, [teamChat?.chatId]);

  // Auto-scroll when NEW messages arrive (count increases), if user was near bottom
  useEffect(() => {
    const messageCount = realtimeMessages.length;
    const prevCount = prevMessageCountRef.current;
    prevMessageCountRef.current = messageCount;

    // Skip initial load (handled by separate effect)
    if (prevCount === 0) return;

    // Only scroll if count INCREASED (not replacements) and user was near bottom
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (messageCount > prevCount && wasNearBottomRef.current) {
      // Small delay to let DOM update
      timeoutId = setTimeout(() => scrollToBottom('instant'), 20);
    }
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
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
    wasNearBottomRef.current =
      distanceFromBottom < SCROLL_NEAR_BOTTOM_THRESHOLD;
  }, []);

  // Handle typing and thinking indicator SSE events
  const handleIndicatorEvent = useCallback(
    (data: Record<string, unknown>) => {
      // Handle typing indicator (user or agent is typing)
      if (data.type === 'typing_indicator') {
        // Validate required fields before processing
        if (
          typeof data.userId !== 'string' ||
          typeof data.displayName !== 'string' ||
          typeof data.isTyping !== 'boolean'
        ) {
          return;
        }
        const userId = data.userId;
        const displayName = data.displayName;
        const isTyping = data.isTyping;

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
        // Validate required fields before processing
        if (
          typeof data.agentId !== 'string' ||
          typeof data.agentName !== 'string' ||
          typeof data.isThinking !== 'boolean'
        ) {
          return;
        }
        const agentId = data.agentId;
        const agentName = data.agentName;
        const isThinking = data.isThinking;
        const thinkingLabel =
          typeof data.thinkingLabel === 'string' ? data.thinkingLabel : null;

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

  // Agent selection methods
  const toggleAgentSelection = useCallback(
    (agentId: string) => {
      // Can't toggle if agent is processing
      if (processingAgentIds.has(agentId)) return;

      setSelectedAgentIds((prev) => {
        const next = new Set(prev);
        if (next.has(agentId)) {
          next.delete(agentId);
        } else {
          next.add(agentId);
        }
        return next;
      });
    },
    [processingAgentIds]
  );

  const selectAllAgents = useCallback(() => {
    if (!teamChat?.agents) return;
    const allIds = teamChat.agents
      .filter((a) => !processingAgentIds.has(a.id))
      .map((a) => a.id);
    setSelectedAgentIds(new Set(allIds));
  }, [teamChat?.agents, processingAgentIds]);

  const deselectAllAgents = useCallback(() => {
    setSelectedAgentIds(new Set());
  }, []);

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

  // Send message with optimistic update and parallel agent execution
  const sendMessage = useCallback(async () => {
    // Guard: require valid user, teamChat, content, and not already sending
    if (!teamChat || !messageInput.trim() || sending || !user?.id) return;

    // Stop typing indicator
    if (isTypingRef.current) {
      isTypingRef.current = false;
      sendTypingIndicator(false);
    }

    const content = messageInput.trim();

    // Auto-select all agents if none selected
    let agentsToCall = Array.from(selectedAgentIds);
    if (agentsToCall.length === 0 && teamChat?.agents) {
      agentsToCall = teamChat.agents
        .filter((a) => !processingAgentIds.has(a.id))
        .map((a) => a.id);
    }

    // Create optimistic message (stableKey prevents flash on confirmation)
    // Use crypto.randomUUID() to avoid ID collisions on rapid sends
    const optimisticId = `pending-${crypto.randomUUID()}`;
    addMessage({
      id: optimisticId,
      chatId: teamChat.chatId,
      content,
      senderId: user.id,
      type: 'user',
      createdAt: new Date().toISOString(),
      stableKey: optimisticId,
    });

    // Scroll to bottom after DOM updates with new message
    // Small delay to ensure React has rendered the new message
    setTimeout(() => scrollToBottom('instant'), 50);

    setMessageInput('');
    setSending(true);
    setSendError(null);

    try {
      const token = await getAccessToken();
      if (!token) {
        // Rollback optimistic message on auth failure
        removeMessage(optimisticId);
        setSendError('Not authenticated');
        return;
      }

      // First, save user message to team chat (happens once for all agents)
      const response = await fetch('/api/agents/team-chat/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) {
        // Rollback optimistic message on server error
        removeMessage(optimisticId);
        const data = await response.json();
        setSendError(data.message || data.error || 'Failed to send message');
        return;
      }

      // If agents are selected, call them in parallel
      if (agentsToCall.length > 0) {
        // Mark selected agents as processing
        setProcessingAgentIds((prev) => {
          const next = new Set(prev);
          for (const id of agentsToCall) {
            next.add(id);
          }
          return next;
        });

        // Clear selection (agents are now being processed)
        setSelectedAgentIds(new Set());

        // Get user info for team chat context
        const ownerName = user.displayName || user.username || 'User';
        const ownerUsername = user.username || '';

        // Call each selected agent in parallel
        const agentCalls = agentsToCall.map(async (agentId) => {
          try {
            const agentResponse = await fetch(`/api/agents/${agentId}/chat`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                message: content,
                usePro: false, // Use free tier by default
                teamChatId: teamChat.chatId,
                teamChatOwnerName: ownerName,
                teamChatOwnerUsername: ownerUsername,
              }),
            });

            if (!agentResponse.ok) {
              console.error(`Agent ${agentId} failed to respond`);
            }
          } catch (err) {
            console.error(`Error calling agent ${agentId}:`, err);
          } finally {
            // Remove from processing when done
            setProcessingAgentIds((prev) => {
              const next = new Set(prev);
              next.delete(agentId);
              return next;
            });
          }
        });

        // Don't await - let agents process in background
        // Responses will come through SSE/broadcast
        Promise.all(agentCalls).catch((err) => {
          console.error('Error in parallel agent calls:', err);
        });
      }
    } catch (err) {
      // Rollback optimistic message on network error
      removeMessage(optimisticId);
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
    user,
    selectedAgentIds,
    processingAgentIds,
    getAccessToken,
    addMessage,
    removeMessage,
    sendTypingIndicator,
    scrollToBottom,
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
    messagesEndRef,
    topSentinelRef,
    messagesContainerRef,
    // Agent selection
    selectedAgentIds,
    processingAgentIds,
    toggleAgentSelection,
    selectAllAgents,
    deselectAllAgents,
    // Actions
    sendMessage,
    refresh: fetchTeamChat,
    handleScroll,
    scrollToBottom,
  };
}
