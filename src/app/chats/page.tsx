'use client'

import React, { useState, useEffect, useRef } from 'react'
import { MessageCircle, Send, Search, X, ArrowLeft, Users, AlertCircle, Check, Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/stores/authStore'
import { usePrivy } from '@privy-io/react-auth'
import { useChatMessages } from '@/hooks/useChatMessages'
import { LoginButton } from '@/components/auth/LoginButton'
import { PageContainer } from '@/components/shared/PageContainer'
import { Avatar } from '@/components/shared/Avatar'
import { Separator } from '@/components/shared/Separator'
import { TaggedText } from '@/components/shared/TaggedText'
import { cn } from '@/lib/utils'

interface Chat {
  id: string
  name: string
  isGroup: boolean
  lastMessage?: {
    id: string
    content: string
    createdAt: string
  } | null
  messageCount?: number
  qualityScore?: number
  participants?: number
  updatedAt: string
}

interface Message {
  id: string
  content: string
  senderId: string
  createdAt: string
}

interface ChatDetails {
  chat: {
    id: string
    name: string | null
    isGroup: boolean
    createdAt: string
    updatedAt: string
  }
  messages: Message[]
  participants: Array<{
    id: string
    displayName: string
    username?: string
    profileImageUrl?: string
  }>
}

export default function ChatsPage() {
  const { ready, authenticated } = useAuth()
  const { user } = useAuthStore()
  const { getAccessToken } = usePrivy()
  
  // Debug mode: enabled in localhost
  const isDebugMode = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  
  // State
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null)
  
  // Check for chat ID in URL query params
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const chatParam = params.get('chat')
      if (chatParam && chatParam !== selectedChatId) {
        setSelectedChatId(chatParam)
        // Clean up URL
        window.history.replaceState({}, '', '/chats')
      }
    }
  }, [selectedChatId])
  const [groupChats, setGroupChats] = useState<Chat[]>([])
  const [chatDetails, setChatDetails] = useState<ChatDetails | null>(null)
  const [messageInput, setMessageInput] = useState('')
  const [_loading, setLoading] = useState(true)
  const [loadingChat, setLoadingChat] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [sendSuccess, setSendSuccess] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // WebSocket messages for real-time updates
  const { addMessage: addWsMessage } = useChatMessages(selectedChatId)

  // WebSocket is initialized lazily by the client; no-op here to avoid extra requests

  // Load user's chats from database
  useEffect(() => {
    if (authenticated || isDebugMode) {
      loadGroupChats()
    }
  }, [authenticated, isDebugMode])

  // Load selected chat details from database
  useEffect(() => {
    if (selectedChatId) {
      loadChatDetails(selectedChatId)
    }
  }, [selectedChatId])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatDetails?.messages])

  const loadGroupChats = async () => {
    setLoading(true)
    
    if (isDebugMode) {
      const response = await fetch('/api/chats?all=true')
      const data = await response.json()
      setGroupChats(data.chats || [])
      setLoading(false)
      return
    }

    const token = await getAccessToken()
    const response = await fetch('/api/chats', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    const data = await response.json()

    const allChats = [
      ...(data.groupChats || []),
      ...(data.directChats || [])
    ]
    setGroupChats(allChats)
    setLoading(false)
  }

  const loadChatDetails = async (chatId: string) => {
    setLoadingChat(true)
    
    if (isDebugMode) {
      const response = await fetch(`/api/chats/${chatId}?debug=true`)
      const data = await response.json()
      // Ensure all required properties exist
      setChatDetails({
        ...data,
        chat: data.chat || null,
        messages: data.messages || [],
        participants: data.participants || [],
      })
      setLoadingChat(false)
      return
    }

    const token = await getAccessToken()
    const response = await fetch(`/api/chats/${chatId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    const data = await response.json()
    // Ensure all required properties exist
    setChatDetails({
      ...data,
      chat: data.chat || null,
      messages: data.messages || [],
      participants: data.participants || [],
    })
    setLoadingChat(false)
  }

  const sendMessage = async () => {
    if (!selectedChatId || !messageInput.trim() || sending) return

    setSending(true)
    setSendError(null)
    setSendSuccess(false)

    const token = await getAccessToken()

    if (selectedChatId.includes('game-')) {
      const response = await fetch(`/api/chats/${selectedChatId}/message`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ content: messageInput.trim() }),
      })

      const data = await response.json()

      if (data.warnings && data.warnings.length > 0) {
        setSendError(data.warnings.join('. '))
        setTimeout(() => setSendError(null), 5000)
      } else {
        setSendSuccess(true)
        setTimeout(() => setSendSuccess(false), 2000)
      }

      if (data.message && selectedChatId) {
        addWsMessage({
          id: data.message.id,
          content: data.message.content,
          chatId: data.message.chatId,
          senderId: data.message.senderId,
          createdAt: data.message.createdAt,
          isGameChat: true
        })
      }

      setMessageInput('')
    } else {
      const response = await fetch(`/api/chats/${selectedChatId}/message`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ content: messageInput.trim() }),
      })

      const data = await response.json()

      if (chatDetails && data.message) {
        setChatDetails({
          ...chatDetails,
          messages: [...(chatDetails.messages || []), data.message],
        })
      }

      if (data.warnings && data.warnings.length > 0) {
        setSendError(data.warnings.join('. '))
        setTimeout(() => setSendError(null), 5000)
      } else {
        setSendSuccess(true)
        setTimeout(() => setSendSuccess(false), 2000)
      }

      setMessageInput('')
      void loadGroupChats()
    }
    
    setSending(false)
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const filteredUserChats = searchQuery
    ? groupChats.filter((chat) =>
        chat.name.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : groupChats

  // No games loaded state
  if (!ready && !authenticated) {
    return (
      <PageContainer noPadding className="flex flex-col">
        <div className="flex-1 flex items-center justify-center">
          <div className="max-w-md mx-auto p-8 text-center">
            <MessageCircle className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-bold mb-2 text-foreground">No Chats Yet</h2>
            <p className="text-muted-foreground mb-4">
              Game is auto-generating in the background...
            </p>
            <div className="text-sm text-muted-foreground space-y-2">
              <p>This happens automatically on first run.</p>
              <p>Check the terminal logs for progress.</p>
              <p className="font-mono text-xs bg-muted p-2 rounded">
                First generation takes 3-5 minutes
              </p>
            </div>
          </div>
        </div>
      </PageContainer>
    )
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
          .chat-card {
            box-shadow: inset 5px 5px 5px rgba(0, 0, 0, 0.1), inset -5px -5px 5px rgba(255, 255, 255, 0.05);
          }

          .chat-button {
            box-shadow: inset 3px 3px 3px rgba(0, 0, 0, 0.1), inset -3px -3px 3px rgba(255, 255, 255, 0.05);
            transition: all 0.3s ease;
          }

          .chat-button:hover:not(:disabled) {
            box-shadow: none;
          }

          .message-input {
            box-shadow: inset 3px 3px 5px rgba(0, 0, 0, 0.15), inset -3px -3px 5px rgba(255, 255, 255, 0.05);
            transition: all 0.3s ease;
          }

          .message-input:focus {
            box-shadow: inset 3px 3px 5px rgba(28, 156, 240, 0.2), inset -3px -3px 5px rgba(28, 156, 240, 0.1);
          }

          .message-bubble {
            box-shadow: 3px 3px 8px rgba(0, 0, 0, 0.15), -3px -3px 8px rgba(255, 255, 255, 0.05);
          }

          .chat-tab {
            box-shadow: inset 3px 3px 5px rgba(0, 0, 0, 0.1), inset -3px -3px 5px rgba(255, 255, 255, 0.05);
            transition: all 0.3s ease;
          }

          .chat-tab-active {
            box-shadow: inset 3px 3px 5px rgba(28, 156, 240, 0.3), inset -3px -3px 5px rgba(28, 156, 240, 0.1);
          }
        `
      }} />
      <PageContainer noPadding className="flex flex-col">
        {/* Desktop: Full width content */}
        <div className="hidden xl:flex flex-1 flex-col overflow-hidden">
            {/* Header */}

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {/* GAME CHATS - Original Implementation */}
          <div className="flex h-full">
            {/* Left Column - Groups List */}
            <div
              className={cn(
                'w-full md:w-96 flex-col bg-background',
                selectedChatId ? 'hidden md:flex' : 'flex',
              )}
            >
              {/* Header with Search */}
              <div className="p-4">
                <h2 className="text-xl font-bold mb-3 text-foreground">
                  Group Chats
                </h2>

                {/* Search Bar */}
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search groups and messages..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={cn(
                      'w-full pl-9 pr-9 py-2 rounded-lg text-sm',
                      'bg-sidebar-accent/50 message-input',
                      'text-foreground placeholder:text-muted-foreground',
                      'outline-none'
                    )}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className={cn(
                        'absolute right-2 top-1/2 -translate-y-1/2',
                        'h-6 w-6 rounded-md flex items-center justify-center',
                        'hover:bg-muted-foreground/20 transition-colors'
                      )}
                    >
                      <X className="w-4 h-4 text-foreground" />
                    </button>
                  )}
                </div>

                <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
                  <span>
                    {searchQuery ? (
                      <>
                        {filteredUserChats.length} group
                        {filteredUserChats.length !== 1 ? 's' : ''} found
                      </>
                    ) : (
                      <>{filteredUserChats.length} groups</>
                    )}
                  </span>
                  {isDebugMode && (
                    <>
                      <span className="px-2 py-0.5 rounded text-xs bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 font-mono">
                        DEBUG MODE
                      </span>
                      <span className="px-2 py-0.5 rounded text-xs bg-blue-500/20 text-blue-600 dark:text-blue-400 font-mono">
                        ALL CHATS
                      </span>
                    </>
                  )}
                </div>
              </div>
              <Separator />

              {/* Groups List */}
              <div className="flex-1 overflow-y-auto">
                {filteredUserChats.map((group, idx) => {
                  return (
                    <React.Fragment key={group.id}>
                      <div
                        onClick={() => setSelectedChatId(group.id)}
                        className={cn(
                          'p-4 cursor-pointer transition-all duration-300',
                          selectedChatId === group.id
                            ? 'bg-sidebar-accent/50 border-l-4'
                            : 'hover:bg-sidebar-accent/30',
                        )}
                        style={{
                          borderLeftColor:
                            selectedChatId === group.id
                              ? '#b82323'
                              : 'transparent',
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-sidebar-accent/50 flex items-center justify-center flex-shrink-0 chat-button">
                            <Users
                              className="w-5 h-5"
                              style={{ color: '#b82323' }}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm truncate text-foreground flex items-center gap-2">
                              {group.name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              <span className="italic">
                                {group.lastMessage?.content ||
                                  'No messages yet'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                      {idx < filteredUserChats.length - 1 && <Separator />}
                    </React.Fragment>
                  )
                })}

                {filteredUserChats.length === 0 && (
                  <div className="text-center text-muted-foreground py-12">
                    <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No group chats yet</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column - Selected Group Messages */}
            {groupChats.length > 0 && (
              <div
                className={cn(
                  'flex-1 flex-col bg-background',
                  !selectedChatId ? 'hidden md:flex' : 'flex',
                )}
              >
                {selectedChatId ? (
                  <>
                    {/* Group Header */}
                    <div className="p-4 bg-background">
                      {/* Mobile header with back button and chat name */}
                      <div className="flex items-center gap-3 mb-2 md:hidden">
                        <button
                          onClick={() => setSelectedChatId(null)}
                          className={cn(
                            'flex items-center gap-2',
                            'px-3 py-1.5 rounded-md text-sm font-medium',
                            'hover:bg-sidebar-accent/50 transition-colors text-foreground',
                          )}
                        >
                          <ArrowLeft className="w-4 h-4" />
                          Back
                        </button>
                        <h3 className="text-lg font-bold text-foreground">
                          {
                            groupChats.find((g) => g.id === selectedChatId)
                              ?.name || 'Group'
                          }
                        </h3>
                      </div>

                      {/* Desktop header - chat name only */}
                      <h3 className="hidden md:block text-lg font-bold text-foreground mb-2">
                        {
                          groupChats.find((g) => g.id === selectedChatId)
                            ?.name || 'Group'
                        }
                      </h3>

                      {searchQuery && (
                        <div className="text-sm text-muted-foreground mt-1">
                          {(chatDetails?.messages || []).length} message
                          {(chatDetails?.messages || []).length !== 1 ? 's' : ''} matching "
                          {searchQuery}"
                        </div>
                      )}
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                      {loadingChat ? (
                        <div className="flex items-center justify-center h-full">
                          <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        </div>
                      ) : (
                        (chatDetails?.messages || []).map((msg, i) => {
                          const msgDate = new Date(msg.createdAt)
                          const sender = chatDetails?.participants?.find(
                            (p) => p.id === msg.senderId,
                          )
                          const senderName = sender?.displayName || 'Unknown'
                          const isCurrentUser = user?.id && msg.senderId === user.id

                          return (
                            <div
                              key={i}
                              className={cn(
                                'flex gap-3',
                                isCurrentUser ? 'justify-end' : 'items-start',
                              )}
                            >
                              {!isCurrentUser && (
                                <Avatar
                                  id={msg.senderId}
                                  name={senderName}
                                  type="actor"
                                  size="md"
                                />
                              )}
                              <div
                                className={cn(
                                  'max-w-[70%] flex flex-col',
                                  isCurrentUser ? 'items-end' : 'items-start',
                                )}
                              >
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  {!isCurrentUser && (
                                    <span className="font-bold text-sm text-foreground">
                                      {senderName}
                                    </span>
                                  )}
                                  {!isCurrentUser && (
                                    <span className="text-muted-foreground">
                                      ·
                                    </span>
                                  )}
                                  <span className="text-xs text-muted-foreground">
                                    {msgDate.toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                    })}{' '}
                                    at{' '}
                                    {msgDate.toLocaleTimeString('en-US', {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                </div>
                                <div
                                  className={cn(
                                    'px-4 py-2 rounded-2xl message-bubble text-sm whitespace-pre-wrap break-words',
                                    isCurrentUser
                                      ? 'rounded-tr-sm'
                                      : 'rounded-tl-sm',
                                  )}
                                  style={{
                                    backgroundColor: isCurrentUser
                                      ? '#1c9cf020'
                                      : 'rgba(var(--sidebar-accent), 0.5)',
                                  }}
                                >
                                  <TaggedText
                                    text={msg.content}
                                    onTagClick={(tag) => setSearchQuery(tag)}
                                    className="text-foreground"
                                  />
                                </div>
                              </div>
                            </div>
                          )
                        })
                      )}

                      {(chatDetails?.messages || []).length === 0 && (
                        <div className="flex items-center justify-center h-full">
                          <div className="text-center text-muted-foreground max-w-md p-8">
                            {searchQuery ? (
                              <>
                                <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                <p>
                                  No messages matching "{searchQuery}"
                                </p>
                              </>
                            ) : (
                              <>
                                <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                <p className="mb-2 text-foreground">
                                  No messages in this group yet
                                </p>
                                {authenticated && (
                                  <p className="text-xs text-muted-foreground">
                                    Be the first to post! Type a message below.
                                  </p>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      )}
                      <div ref={messagesEndRef} />
                    </div>

                    {/* Feedback Messages */}
                    {authenticated && (sendError || sendSuccess) && (
                      <div className="px-4">
                        {sendError && (
                          <div className="flex items-center gap-2 p-2 rounded-lg bg-sidebar-accent/30 mb-2 border-2" style={{ borderColor: '#f59e0b' }}>
                            <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#f59e0b' }} />
                            <span className="text-xs" style={{ color: '#f59e0b' }}>{sendError}</span>
                          </div>
                        )}
                        {sendSuccess && (
                          <div className="flex items-center gap-2 p-2 rounded-lg bg-sidebar-accent/30 mb-2 border-2" style={{ borderColor: '#10b981' }}>
                            <Check className="w-4 h-4 flex-shrink-0" style={{ color: '#10b981' }} />
                            <span className="text-xs" style={{ color: '#10b981' }}>Message sent!</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Message Input */}
                    {authenticated ? (
                      <div className="p-4 bg-background">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={messageInput}
                            onChange={(e) => setMessageInput(e.target.value)}
                            onKeyPress={handleKeyPress}
                            placeholder="Type a message..."
                            disabled={sending}
                            className={cn(
                              'flex-1 px-4 py-3 rounded-lg text-sm',
                              'bg-sidebar-accent/50 message-input',
                              'text-foreground placeholder:text-muted-foreground',
                              'outline-none',
                              'disabled:opacity-50 disabled:cursor-not-allowed'
                            )}
                          />
                          <button
                            onClick={sendMessage}
                            disabled={!messageInput.trim() || sending}
                            className={cn(
                              'px-4 py-3 rounded-lg font-semibold flex items-center gap-2',
                              'bg-sidebar-accent/50 chat-button',
                              'transition-all duration-300',
                              'disabled:opacity-50 disabled:cursor-not-allowed'
                            )}
                            style={{ color: '#1c9cf0' }}
                          >
                            {sending ? (
                              <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                              <Send className="w-5 h-5" />
                            )}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 bg-background">
                        <div className="text-center">
                          <p className="text-sm text-muted-foreground mb-3">Connect your wallet to send messages</p>
                          <LoginButton />
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center text-muted-foreground max-w-md p-8">
                      <MessageCircle className="w-16 h-16 mx-auto mb-4 opacity-50" />
                      <h3 className="text-xl font-bold mb-2 text-foreground">
                        Select a group chat
                      </h3>
                      <p className="text-sm">
                        Choose a group from the list to view messages
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile/Tablet: Full width content */}
        <div className="flex xl:hidden flex-col flex-1 overflow-hidden">

          {/* Content */}
          <div className="flex-1 overflow-hidden">
            {/* GAME CHATS - Original Implementation */}
            <div className="flex h-full">
              {/* Left Column - Groups List */}
              <div
                className={cn(
                  'w-full md:w-96 flex-col bg-background',
                  selectedChatId ? 'hidden md:flex' : 'flex',
                )}
              >
                {/* Header with Search */}
                <div className="p-4">
                  <h2 className="text-xl font-bold mb-3 text-foreground">
                    Group Chats
                  </h2>

                  {/* Search Bar */}
                  <div className="relative mb-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search groups and messages..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className={cn(
                        'w-full pl-9 pr-9 py-2 rounded-lg text-sm',
                        'bg-sidebar-accent/50 message-input',
                        'text-foreground placeholder:text-muted-foreground',
                        'outline-none'
                      )}
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
                    <span>
                      {searchQuery ? (
                        <>
                          {filteredUserChats.length} group
                          {filteredUserChats.length !== 1 ? 's' : ''} found
                        </>
                      ) : (
                        <>{filteredUserChats.length} groups</>
                      )}
                    </span>
                    {isDebugMode && (
                      <>
                        <span className="px-2 py-0.5 rounded text-xs bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 font-mono">
                          DEBUG MODE
                        </span>
                        <span className="px-2 py-0.5 rounded text-xs bg-blue-500/20 text-blue-600 dark:text-blue-400 font-mono">
                          ALL CHATS
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <Separator />

                {/* Groups List */}
                <div className="flex-1 overflow-y-auto">
                  {_loading ? (
                    <div className="p-4 text-center text-muted-foreground">
                      Loading chats...
                    </div>
                  ) : filteredUserChats.length === 0 ? (
                    <div className="text-center text-muted-foreground py-12">
                      <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>No group chats yet</p>
                    </div>
                  ) : (
                    <>
                      {filteredUserChats.map((group, idx) => {
                        return (
                          <React.Fragment key={group.id}>
                            <div
                              onClick={() => setSelectedChatId(group.id)}
                              className={cn(
                                'p-4 cursor-pointer transition-all duration-300',
                                selectedChatId === group.id
                                  ? 'bg-sidebar-accent/50 border-l-4'
                                  : 'hover:bg-sidebar-accent/30',
                              )}
                              style={{
                                borderLeftColor:
                                  selectedChatId === group.id
                                    ? '#b82323'
                                    : 'transparent',
                              }}
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-sidebar-accent/50 flex items-center justify-center flex-shrink-0 chat-button">
                                  <Users
                                    className="w-5 h-5"
                                    style={{ color: '#b82323' }}
                                  />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-semibold text-sm truncate text-foreground flex items-center gap-2">
                                    {group.name}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    <span className="italic">
                                      {group.lastMessage?.content ||
                                        'No messages yet'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                            {idx < filteredUserChats.length - 1 && <Separator />}
                          </React.Fragment>
                        )
                      })}
                    </>
                  )}
                </div>
              </div>

              {/* Right Column - Selected Group Messages */}
              {groupChats.length > 0 && (
                <div
                  className={cn(
                    'flex-1 flex-col bg-background',
                    !selectedChatId ? 'hidden md:flex' : 'flex',
                  )}
                >
                  {selectedChatId ? (
                    <>
                      {/* Group Header */}
                      <div className="p-4 bg-background">
                        {/* Mobile header with back button and chat name */}
                        <div className="flex items-center gap-3 mb-2 md:hidden">
                          <button
                            onClick={() => setSelectedChatId(null)}
                            className={cn(
                              'flex items-center gap-2',
                              'px-3 py-1.5 rounded-md text-sm font-medium',
                              'hover:bg-sidebar-accent/50 transition-colors text-foreground',
                            )}
                          >
                            <ArrowLeft className="w-4 h-4" />
                            Back
                          </button>
                          <h3 className="text-lg font-bold text-foreground">
                            {chatDetails?.chat?.name || 'Chat'}
                          </h3>
                        </div>

                        {/* Desktop header - chat name only */}
                        <h3 className="hidden md:block text-lg font-bold text-foreground mb-2">
                          {chatDetails?.chat?.name || 'Chat'}
                        </h3>

                        {searchQuery && (
                          <div className="text-sm text-muted-foreground mt-1">
                            {(chatDetails?.messages || []).length} message
                            {(chatDetails?.messages || []).length !== 1 ? 's' : ''} matching "
                            {searchQuery}"
                          </div>
                        )}
                      </div>

                      {/* Messages */}
                      <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {loadingChat ? (
                          <div className="flex items-center justify-center h-full">
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                          </div>
                        ) : (
                          (chatDetails?.messages || []).map((msg, i) => {
                            const msgDate = new Date(msg.createdAt)
                            const sender = chatDetails?.participants?.find(
                              (p) => p.id === msg.senderId,
                            )
                            const senderName = sender?.displayName || 'Unknown'
                            const isCurrentUser = user?.id && msg.senderId === user.id

                            return (
                              <div
                                key={i}
                                className={cn(
                                  'flex gap-3',
                                  isCurrentUser ? 'justify-end' : 'items-start',
                                )}
                              >
                                {!isCurrentUser && (
                                  <Avatar
                                    id={msg.senderId}
                                    name={senderName}
                                    type="actor"
                                    size="md"
                                  />
                                )}
                                <div
                                  className={cn(
                                    'max-w-[70%] flex flex-col',
                                    isCurrentUser ? 'items-end' : 'items-start',
                                  )}
                                >
                                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    {!isCurrentUser && (
                                      <span className="font-bold text-sm text-foreground">
                                        {senderName}
                                      </span>
                                    )}
                                    {!isCurrentUser && (
                                      <span className="text-muted-foreground">
                                        ·
                                      </span>
                                    )}
                                    <span className="text-xs text-muted-foreground">
                                      {msgDate.toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                      })}{' '}
                                      at{' '}
                                      {msgDate.toLocaleTimeString('en-US', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })}
                                    </span>
                                  </div>
                                  <div
                                    className={cn(
                                      'px-4 py-2 rounded-2xl message-bubble text-sm whitespace-pre-wrap break-words',
                                      isCurrentUser
                                        ? 'rounded-tr-sm'
                                        : 'rounded-tl-sm',
                                    )}
                                    style={{
                                      backgroundColor: isCurrentUser
                                        ? '#1c9cf020'
                                        : 'rgba(var(--sidebar-accent), 0.5)',
                                    }}
                                  >
                                    <TaggedText
                                      text={msg.content}
                                      onTagClick={(tag) => setSearchQuery(tag)}
                                      className="text-foreground"
                                    />
                                  </div>
                                </div>
                              </div>
                            )
                          })
                        )}

                        {(chatDetails?.messages || []).length === 0 && (
                          <div className="flex items-center justify-center h-full">
                            <div className="text-center text-muted-foreground max-w-md p-8">
                              {searchQuery ? (
                                <>
                                  <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                  <p>
                                    No messages matching "{searchQuery}"
                                  </p>
                                </>
                              ) : (
                                <>
                                  <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                  <p className="mb-2 text-foreground">
                                    No messages in this group yet
                                  </p>
                                  {authenticated && (
                                    <p className="text-xs text-muted-foreground">
                                      Be the first to post! Type a message below.
                                    </p>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        )}
                        <div ref={messagesEndRef} />
                      </div>

                      {/* Feedback Messages */}
                      {authenticated && (sendError || sendSuccess) && (
                        <div className="px-4">
                          {sendError && (
                            <div className="flex items-center gap-2 p-2 rounded-lg bg-sidebar-accent/30 mb-2 border-2" style={{ borderColor: '#f59e0b' }}>
                              <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#f59e0b' }} />
                              <span className="text-xs" style={{ color: '#f59e0b' }}>{sendError}</span>
                            </div>
                          )}
                          {sendSuccess && (
                            <div className="flex items-center gap-2 p-2 rounded-lg bg-sidebar-accent/30 mb-2 border-2" style={{ borderColor: '#10b981' }}>
                              <Check className="w-4 h-4 flex-shrink-0" style={{ color: '#10b981' }} />
                              <span className="text-xs" style={{ color: '#10b981' }}>Message sent!</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Message Input */}
                      {authenticated ? (
                        <div className="p-4 bg-background">
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={messageInput}
                              onChange={(e) => setMessageInput(e.target.value)}
                              onKeyPress={handleKeyPress}
                              placeholder="Type a message..."
                              disabled={sending}
                              className={cn(
                                'flex-1 px-4 py-3 rounded-lg text-sm',
                                'bg-sidebar-accent/50 message-input',
                                'text-foreground placeholder:text-muted-foreground',
                                'outline-none',
                                'disabled:opacity-50 disabled:cursor-not-allowed'
                              )}
                            />
                            <button
                              onClick={sendMessage}
                              disabled={!messageInput.trim() || sending}
                              className={cn(
                                'px-4 py-3 rounded-lg font-semibold flex items-center gap-2',
                                'bg-sidebar-accent/50 chat-button',
                                'transition-all duration-300',
                                'disabled:opacity-50 disabled:cursor-not-allowed'
                              )}
                              style={{ color: '#1c9cf0' }}
                            >
                              {sending ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                              ) : (
                                <Send className="w-5 h-5" />
                              )}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 bg-background">
                          <div className="text-center">
                            <p className="text-sm text-muted-foreground mb-3">Connect your wallet to send messages</p>
                            <LoginButton />
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-center">
                      <div className="text-center text-muted-foreground max-w-md p-8">
                        <MessageCircle className="w-16 h-16 mx-auto mb-4 opacity-50" />
                        <h3 className="text-xl font-bold mb-2 text-foreground">
                          Select a group chat
                        </h3>
                        <p className="text-sm">
                          Choose a group from the list to view messages
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </PageContainer>
    </>
  )
}



