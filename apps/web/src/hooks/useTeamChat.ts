/**
 * useTeamChat Hook
 *
 * Manages the user's Command Center team chat - a unified group chat
 * containing all their agents.
 */

import { usePrivy } from '@privy-io/react-auth';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type ChatMessage, useChatMessages } from '@/hooks/useChatMessages';
import { useSSEChannel } from '@/hooks/useSSE';
import { useAuthStore } from '@/stores/authStore';
import type { ChatDetails, ChatParticipant } from '@/components/chats/types';

/** Typing user info */
interface TypingUser {
  userId: string;
  displayName: string;
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

  // Typing indicators
  typingUsers: TypingUser[];
  sendError: string | null;
  sendSuccess: boolean;
  mentionedAgentIds: string[];
  setMentionedAgentIds: (ids: string[]) => void;

  // Refs
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  topSentinelRef: React.RefObject<HTMLDivElement | null>;

  // Actions
  sendMessage: () => Promise<void>;
  refresh: () => Promise<void>;
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
  const [sendSuccess, setSendSuccess] = useState(false);
  const [mentionedAgentIds, setMentionedAgentIds] = useState<string[]>([]);

  // Typing indicator state
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef = useRef(false);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const topSentinelRef = useRef<HTMLDivElement | null>(null);

  // SSE for real-time messages - connect once we have the chat ID
  const {
    messages: realtimeMessages,
    isConnected: sseConnected,
    isLoadingMore,
    hasMore,
    addMessage,
  } = useChatMessages(teamChat?.chatId ?? null);

  // Handle typing indicator SSE events
  const handleTypingEvent = useCallback(
    (data: Record<string, unknown>) => {
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
    },
    [user?.id]
  );

  // Subscribe to typing events on the same chat channel
  const typingChannel = useMemo(
    () => (teamChat?.chatId ? (`chat:${teamChat.chatId}` as const) : null),
    [teamChat?.chatId]
  );
  useSSEChannel(typingChannel, handleTypingEvent);

  // Clean up expired typing indicators
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setTypingUsers((prev) => prev.filter((u) => u.expiresAt > now));
    }, 1000);
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
      }).catch(() => {
        // Ignore typing indicator errors
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

  // Cleanup typing state on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (isTypingRef.current) {
        sendTypingIndicator(false);
      }
    };
  }, [sendTypingIndicator]);

  // Fetch team chat info
  const fetchTeamChat = useCallback(async () => {
    setLoading(true);
    setError(null);

    const token = await getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }

    const response = await fetch('/api/agents/team-chat', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status === 404) {
      // No team chat exists - user has no agents
      setTeamChat(null);
      setLoading(false);
      return;
    }

    if (!response.ok) {
      const data = await response.json();
      setError(data.message || 'Failed to load Command Center');
      setLoading(false);
      return;
    }

    const data = await response.json();
    setTeamChat(data.teamChat);
    setLoading(false);
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

  // Send message
  const sendMessage = useCallback(async () => {
    if (!teamChat || !messageInput.trim() || sending) return;

    setSending(true);
    setSendError(null);
    setSendSuccess(false);

    const token = await getAccessToken();
    if (!token) {
      setSendError('Not authenticated');
      setSending(false);
      return;
    }

    // Use dedicated team chat message endpoint for @mention handling
    const response = await fetch('/api/agents/team-chat/message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        content: messageInput.trim(),
        // Include mentioned agent IDs for priority response handling
        mentionedAgentIds: mentionedAgentIds.length > 0 ? mentionedAgentIds : undefined,
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      setSendError(data.message || 'Failed to send message');
      setSending(false);
      return;
    }

    const data = await response.json();

    // Add message to realtime messages
    if (data.message) {
      const newMessage: ChatMessage = {
        id: data.message.id,
        chatId: teamChat.chatId,
        content: data.message.content,
        senderId: data.message.senderId,
        type: data.message.type,
        createdAt: data.message.createdAt,
      };
      addMessage(newMessage);
    }

    setMessageInput('');
    setMentionedAgentIds([]);
    setSendSuccess(true);
    setSending(false);

    // Scroll to bottom
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);

    // Clear success after 2 seconds
    setTimeout(() => setSendSuccess(false), 2000);
  }, [teamChat, messageInput, sending, mentionedAgentIds, getAccessToken, addMessage]);

  // Send message and stop typing indicator
  const sendMessageWithTypingStop = useCallback(async () => {
    if (isTypingRef.current) {
      isTypingRef.current = false;
      sendTypingIndicator(false);
    }
    await sendMessage();
  }, [sendMessage, sendTypingIndicator]);

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
    sendError,
    sendSuccess,
    mentionedAgentIds,
    setMentionedAgentIds,
    messagesEndRef,
    topSentinelRef,
    sendMessage: sendMessageWithTypingStop,
    refresh: fetchTeamChat,
  };
}

