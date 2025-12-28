'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useChatMessages } from '@/hooks/useChatMessages';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useAuthStore } from '@/stores/authStore';
import type { Chat, ChatDetails, ChatFilter } from '../types';

export function useChatPage() {
  const router = useRouter();
  const { ready, authenticated } = useAuth();
  const { user } = useAuthStore();
  const { getAccessToken } = usePrivy();

  // UI state
  const [activeFilter, setActiveFilter] = useState<ChatFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);

  // Data state
  const [allChats, setAllChats] = useState<Chat[]>([]);
  const [chatDetails, setChatDetails] = useState<ChatDetails | null>(null);

  // Loading/sending state
  const [loading, setLoading] = useState(true);
  const [loadingChat, setLoadingChat] = useState(false);
  const [sending, setSending] = useState(false);

  // Message input state
  const [messageInput, setMessageInput] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendWarning, setSendWarning] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState(false);

  // Leave chat state
  const [isLeaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [isLeavingChat, setIsLeavingChat] = useState(false);
  const [leaveChatError, setLeaveChatError] = useState<string | null>(null);

  // Group modals
  const [isCreateGroupModalOpen, setIsCreateGroupModalOpen] = useState(false);
  const [isGroupManagementModalOpen, setIsGroupManagementModalOpen] =
    useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  // New DM state
  const [pendingDM, setPendingDM] = useState<{
    chatId: string;
    targetUserId: string;
  } | null>(null);

  // Scroll state
  const [isAtBottom, setIsAtBottom] = useState(true);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const topSentinelRef = useRef<HTMLDivElement | null>(null);
  const pendingScrollAdjustRef = useRef<{
    previousHeight: number;
    previousTop: number;
  } | null>(null);
  const lastMessageIdRef = useRef<string | null>(null);

  // Debug mode
  const isDebugMode =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1');

  // SSE for real-time messages
  const {
    messages: realtimeMessages,
    isConnected: sseConnected,
    isLoadingMore,
    hasMore,
    loadMore,
    addMessage,
  } = useChatMessages(selectedChatId);

  // Load chats
  const loadChats = useCallback(async () => {
    setLoading(true);

    if (!isDebugMode) {
      if (!ready || !authenticated) {
        setLoading(false);
        return;
      }
    }

    const token = await getAccessToken();
    if (!token && !isDebugMode) {
      setLoading(false);
      return;
    }

    const [personalResponse, gameResponse] = await Promise.all([
      fetch('/api/chats', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      isDebugMode ? fetch('/api/chats?all=true') : Promise.resolve(null),
    ]);

    if (!personalResponse.ok) {
      setLoading(false);
      return;
    }

    const personalData = await personalResponse.json();

    let gameChats: Chat[] = [];
    if (gameResponse?.ok) {
      const gameData = await gameResponse.json();
      gameChats = gameData.chats || [];
    }

    const combined = [
      ...(personalData.groupChats || []),
      ...(personalData.directChats || []),
      ...gameChats,
    ].sort((a, b) => {
      const aTime = a.lastMessage?.createdAt || a.updatedAt;
      const bTime = b.lastMessage?.createdAt || b.updatedAt;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });

    setAllChats(combined);
    setLoading(false);
  }, [getAccessToken, isDebugMode, ready, authenticated]);

  // Load chat details
  const loadChatDetails = useCallback(
    async (chatId: string) => {
      setLoadingChat(true);

      if (isDebugMode) {
        const response = await fetch(`/api/chats/${chatId}?debug=true`);
        const data = await response.json();
        setChatDetails({
          ...data,
          chat: data.chat || null,
          messages: data.messages || [],
          participants: data.participants || [],
        });
        setLoadingChat(false);
        return;
      }

      const token = await getAccessToken();
      if (!token) {
        setLoadingChat(false);
        return;
      }

      const response = await fetch(`/api/chats/${chatId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 404) {
        setLoadingChat(false);
        return;
      }

      if (!response.ok) {
        setLoadingChat(false);
        return;
      }

      const data = await response.json();
      setChatDetails({
        ...data,
        chat: data.chat || null,
        messages: data.messages || [],
        participants: data.participants || [],
      });
      setLoadingChat(false);
    },
    [getAccessToken, isDebugMode]
  );

  // Send message
  const sendMessage = useCallback(async () => {
    if (!selectedChatId || !messageInput.trim() || sending) return;

    setSending(true);
    setSendError(null);
    setSendWarning(null);
    setSendSuccess(false);

    const token = await getAccessToken();
    if (!token) {
      setSendError('Authentication required. Please log in again.');
      setSending(false);
      return;
    }

    const response = await fetch(`/api/chats/${selectedChatId}/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ content: messageInput.trim() }),
    }).catch((error: Error) => {
      setSendError('Failed to send message. Please try again.');
      setSending(false);
      throw error;
    });

    const data = await response.json();

    if (!response.ok) {
      const message =
        (data && (data.error || data.message)) ||
        'Failed to send message. Please try again.';
      setSendError(message);
      setSending(false);
      return;
    }

    const warnings = Array.isArray(data?.warnings) ? data.warnings : [];
    if (warnings.length > 0) {
      setSendWarning(warnings.join('. '));
      setTimeout(() => setSendWarning(null), 5000);
    }

    setSendSuccess(true);
    setTimeout(() => setSendSuccess(false), 2000);

    if (data.message) {
      addMessage({
        id: data.message.id,
        content: data.message.content,
        chatId: data.message.chatId,
        senderId: data.message.senderId,
        createdAt:
          typeof data.message.createdAt === 'string'
            ? data.message.createdAt
            : new Date(data.message.createdAt).toISOString(),
      });
    }

    setMessageInput('');
    void loadChats();
    setSending(false);
  }, [
    selectedChatId,
    messageInput,
    sending,
    getAccessToken,
    addMessage,
    loadChats,
  ]);

  // Leave chat
  const handleLeaveChat = useCallback(async () => {
    if (!selectedChatId) return;
    setIsLeavingChat(true);
    setLeaveChatError(null);

    const accessToken = await getAccessToken();
    if (!accessToken) {
      setLeaveChatError('Authentication failed. Please try again.');
      setIsLeavingChat(false);
      return;
    }

    const response = await fetch(
      `/api/chats/${selectedChatId}/participants/me`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    ).catch((error: Error) => {
      setLeaveChatError(error.message);
      setIsLeavingChat(false);
      throw error;
    });

    if (!response.ok) {
      const errorData = await response.json();
      setLeaveChatError(errorData.message || 'Failed to leave chat');
      setIsLeavingChat(false);
      return;
    }

    setLeaveConfirmOpen(false);
    setSelectedChatId(null);
    await loadChats();
    setIsLeavingChat(false);
  }, [selectedChatId, getAccessToken, loadChats]);

  // Group handlers
  const handleGroupCreated = useCallback(
    async (groupId: string, chatId: string) => {
      await loadChats();
      await new Promise((resolve) => setTimeout(resolve, 500));
      setSelectedGroupId(groupId);
      setSelectedChatId(chatId);
      await loadChatDetails(chatId);
    },
    [loadChats, loadChatDetails]
  );

  const handleGroupUpdated = useCallback(async () => {
    await loadChats();
    if (selectedChatId) {
      await loadChatDetails(selectedChatId);
    }
  }, [loadChats, selectedChatId, loadChatDetails]);

  const handleManageGroup = useCallback(async () => {
    if (!chatDetails?.chat.id) return;

    const token = await getAccessToken();
    const response = await fetch(`/api/chats/${chatDetails.chat.id}/group`, {
      headers: { Authorization: `Bearer ${token}` },
    }).catch((error: Error) => {
      console.error('Error fetching group ID:', error);
      throw error;
    });

    if (response.ok) {
      const data = await response.json();
      setSelectedGroupId(data.groupId);
      setIsGroupManagementModalOpen(true);
    }
  }, [chatDetails?.chat.id, getAccessToken]);

  // Load new DM chat
  const loadNewDMChat = useCallback(
    async (chatId: string, targetUserId: string) => {
      setLoadingChat(true);

      const token = await getAccessToken();
      if (!token) {
        setLoadingChat(false);
        return;
      }

      const response = await fetch(`/api/users/${targetUserId}/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {
        setLoadingChat(false);
        throw new Error('Failed to load user info');
      });

      if (!response.ok) {
        setLoadingChat(false);
        return;
      }

      const userData = await response.json();
      const targetUser = userData.user;

      setChatDetails({
        chat: {
          id: chatId,
          name: null,
          isGroup: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        messages: [],
        participants: [
          {
            id: user!.id,
            displayName: user!.displayName || user!.username || 'You',
            username: user!.username,
            profileImageUrl: user!.profileImageUrl,
          },
          {
            id: targetUser.id,
            displayName:
              targetUser.displayName || targetUser.username || 'User',
            username: targetUser.username,
            profileImageUrl: targetUser.profileImageUrl,
          },
        ],
      });

      const newChat: Chat = {
        id: chatId,
        name: targetUser.displayName || targetUser.username || 'User',
        isGroup: false,
        lastMessage: null,
        updatedAt: new Date().toISOString(),
        otherUser: {
          id: targetUser.id,
          displayName: targetUser.displayName,
          username: targetUser.username,
          profileImageUrl: targetUser.profileImageUrl,
        },
      };

      setAllChats((prev) => {
        if (prev.some((c) => c.id === chatId)) {
          return prev;
        }
        return [newChat, ...prev];
      });

      setLoadingChat(false);
    },
    [getAccessToken, user]
  );

  // Scroll to bottom
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const container = chatContainerRef.current;
    if (container) {
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' });
    }
  }, []);

  // Pull-to-refresh
  const { pullDistance, containerRef: setPullToRefreshRef } = usePullToRefresh({
    onRefresh: async () => {
      if (!selectedChatId) return;
      await loadChatDetails(selectedChatId).catch((error: Error) => {
        console.error('Error refreshing chat details:', error);
      });
    },
  });

  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      chatContainerRef.current = node;
      setPullToRefreshRef(node);
    },
    [setPullToRefreshRef]
  );

  // Filter chats
  const filteredByType =
    activeFilter === 'all'
      ? allChats
      : activeFilter === 'dms'
        ? allChats.filter((c) => !c.isGroup)
        : allChats.filter((c) => c.isGroup);

  const filteredChats = searchQuery
    ? filteredByType.filter((chat) =>
        chat.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : filteredByType;

  // Load chats on mount
  useEffect(() => {
    if ((ready && authenticated) || isDebugMode) {
      loadChats();
    }
  }, [ready, authenticated, isDebugMode, loadChats]);

  // Load selected chat details
  useEffect(() => {
    lastMessageIdRef.current = null;
    setIsAtBottom(true);
    if (selectedChatId) {
      loadChatDetails(selectedChatId);
    }
  }, [selectedChatId, loadChatDetails]);

  // Update chatDetails with realtime messages
  useEffect(() => {
    if (realtimeMessages.length > 0) {
      setChatDetails((prev) => {
        if (!prev) return prev;
        return { ...prev, messages: realtimeMessages };
      });
    }
  }, [realtimeMessages]);

  // Scroll to bottom on new messages
  useEffect(() => {
    const msgs = chatDetails?.messages || [];
    const lastId = msgs.length > 0 ? msgs[msgs.length - 1]?.id : null;
    if (!lastId) return;

    const isNewMessage = lastId !== lastMessageIdRef.current;
    const shouldForce = lastMessageIdRef.current === null;
    lastMessageIdRef.current = lastId;

    if (shouldForce) {
      scrollToBottom('auto');
      setIsAtBottom(true);
      return;
    }

    if (isNewMessage && isAtBottom) {
      scrollToBottom('smooth');
      setIsAtBottom(true);
    }
  }, [chatDetails?.messages, isAtBottom, scrollToBottom]);

  // Intersection observer for infinite scroll
  useEffect(() => {
    const container = chatContainerRef.current;
    const sentinel = topSentinelRef.current;

    if (!container || !sentinel || !selectedChatId) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (
          entry.isIntersecting &&
          container.scrollTop < 200 &&
          hasMore &&
          !isLoadingMore
        ) {
          pendingScrollAdjustRef.current = {
            previousHeight: container.scrollHeight,
            previousTop: container.scrollTop,
          };
          loadMore();
        }
      },
      { root: container, rootMargin: '0px 0px 0px 0px', threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [selectedChatId, hasMore, isLoadingMore, loadMore]);

  // Maintain scroll position after loading older messages
  useEffect(() => {
    if (isLoadingMore || !pendingScrollAdjustRef.current) return;
    const container = chatContainerRef.current;
    if (!container) return;

    const { previousHeight, previousTop } = pendingScrollAdjustRef.current;
    const newHeight = container.scrollHeight;
    const delta = newHeight - previousHeight;
    container.scrollTop = previousTop + delta;
    pendingScrollAdjustRef.current = null;
  }, [isLoadingMore]);

  // Track scroll position
  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const threshold = 50;
      const atBottom =
        container.scrollTop + container.clientHeight >=
        container.scrollHeight - threshold;
      setIsAtBottom(atBottom);
    };

    container.addEventListener('scroll', handleScroll);
    handleScroll();
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // Check for chat ID in URL
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const chatParam = params.get('chat');
      const newDMParam = params.get('newDM');

      if (chatParam && chatParam !== selectedChatId) {
        setSelectedChatId(chatParam);

        // If this is a new DM, store it as pending until user is available
        if (newDMParam && chatParam.startsWith('dm-')) {
          setPendingDM({ chatId: chatParam, targetUserId: newDMParam });
        }

        // Clean up URL using Next.js router to keep router state in sync
        router.replace('/chats');
      }
    }
  }, [selectedChatId, router]);

  // Load pending DM once user is available
  useEffect(() => {
    if (pendingDM && user) {
      loadNewDMChat(pendingDM.chatId, pendingDM.targetUserId);
      setPendingDM(null);
    }
  }, [pendingDM, user, loadNewDMChat]);

  return {
    // Auth
    ready,
    authenticated,
    user,

    // UI state
    activeFilter,
    setActiveFilter,
    searchQuery,
    setSearchQuery,
    selectedChatId,
    setSelectedChatId,

    // Data
    filteredChats,
    chatDetails,

    // Loading state
    loading,
    loadingChat,
    sending,
    isLoadingMore,
    hasMore,

    // Message state
    messageInput,
    setMessageInput,
    sendError,
    sendWarning,
    sendSuccess,

    // Leave chat
    isLeaveConfirmOpen,
    setLeaveConfirmOpen,
    isLeavingChat,
    leaveChatError,
    setLeaveChatError,
    handleLeaveChat,

    // Group modals
    isCreateGroupModalOpen,
    setIsCreateGroupModalOpen,
    isGroupManagementModalOpen,
    setIsGroupManagementModalOpen,
    selectedGroupId,
    setSelectedGroupId,
    handleGroupCreated,
    handleGroupUpdated,
    handleManageGroup,

    // SSE
    sseConnected,

    // Refs
    messagesEndRef,
    topSentinelRef,
    setRefs,
    pullDistance,

    // Actions
    sendMessage,
    loadChats,
  };
}
