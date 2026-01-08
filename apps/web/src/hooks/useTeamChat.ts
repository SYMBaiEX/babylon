/**
 * useTeamChat Hook
 *
 * Manages the user's Command Center team chat - a unified group chat
 * containing all their agents.
 */

import { usePrivy } from '@privy-io/react-auth';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatDetails, ChatParticipant } from '@/components/chats/types';
import { type ChatMessage, useChatMessages } from '@/hooks/useChatMessages';
import { useAuthStore } from '@/stores/authStore';

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
  sendError: string | null;
  sendSuccess: boolean;
  mentionedAgentIds: string[];
  setMentionedAgentIds: (ids: string[]) => void;

  // Scroll state
  pullDistance: number;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  topSentinelRef: React.RefObject<HTMLDivElement | null>;
  setRefs: (node: HTMLDivElement | null) => void;

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

  // Refs
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const topSentinelRef = useRef<HTMLDivElement | null>(null);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const pullDistance = 0; // Simplified - not using pull-to-refresh for team chat

  // SSE for real-time messages - connect once we have the chat ID
  const {
    messages: realtimeMessages,
    isConnected: sseConnected,
    isLoadingMore,
    hasMore,
    addMessage,
  } = useChatMessages(teamChat?.chatId ?? null);

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

    const response = await fetch(`/api/chats/${teamChat.chatId}/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        content: messageInput.trim(),
        // Include mentioned agent IDs for priority response handling
        mentionedAgentIds:
          mentionedAgentIds.length > 0 ? mentionedAgentIds : undefined,
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
  }, [
    teamChat,
    messageInput,
    sending,
    mentionedAgentIds,
    getAccessToken,
    addMessage,
  ]);

  // Scroll container ref callback
  const setRefs = useCallback((node: HTMLDivElement | null) => {
    chatContainerRef.current = node;
  }, []);

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
    sendError,
    sendSuccess,
    mentionedAgentIds,
    setMentionedAgentIds,

    pullDistance,
    messagesEndRef,
    topSentinelRef,
    setRefs,

    sendMessage,
    refresh: fetchTeamChat,
  };
}
