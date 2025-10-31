'use client'

import React, { useState, useEffect, useRef, useMemo } from 'react'
import { MessageCircle, Send, Search, X, ArrowLeft, Users, AlertCircle, Check, Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/stores/authStore'
import { usePrivy } from '@privy-io/react-auth'
import { useGameStore } from '@/stores/gameStore'
import { useChatMessages } from '@/hooks/useWebSocket'
import { LoginButton } from '@/components/auth/LoginButton'
import { PageContainer } from '@/components/shared/PageContainer'
import { Avatar, GroupAvatar } from '@/components/shared/Avatar'
import { Separator } from '@/components/shared/Separator'
import type { ChatMessage } from '@/shared/types'
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
  const { allGames, startTime, currentTimeMs } = useGameStore()
  const { getAccessToken } = usePrivy()
  
  // State
  const [activeTab, setActiveTab] = useState<'game' | 'user'>('game')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null)
  const [groupChats, setGroupChats] = useState<Chat[]>([])
  const [directChats, setDirectChats] = useState<Chat[]>([])
  const [chatDetails, setChatDetails] = useState<ChatDetails | null>(null)
  const [messageInput, setMessageInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingChat, setLoadingChat] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [sendSuccess, setSendSuccess] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // WebSocket messages for real-time updates
  const { messages: wsMessages, addMessage: addWsMessage } = useChatMessages(selectedChatId)

  // Calculate current date from timeline
  const currentDate = startTime ? new Date(startTime + currentTimeMs) : null

  // WebSocket is initialized lazily by the client; no-op here to avoid extra requests

  // Get all unique groups from all games (for Game Chats tab)
  const allGroups = useMemo(() => {
    const groupsMap = new Map<string, { id: string; name: string; messageCount: number }>()

    // First, build a map of groupId -> name from setup
    const groupNameMap = new Map<string, string>()
    allGames.forEach(g => {
      g.setup?.groupChats?.forEach(groupChat => {
        groupNameMap.set(groupChat.id, groupChat.name)
      })
    })

    // Then count messages per group
    allGames.forEach(g => {
      g.timeline?.forEach(day => {
        Object.keys(day.groupChats || {}).forEach(groupId => {
          const messages = day.groupChats?.[groupId]
          const messageCount = Array.isArray(messages) ? messages.length : 0

          if (groupsMap.has(groupId)) {
            const existing = groupsMap.get(groupId)!
            existing.messageCount += messageCount
          } else {
            // Use stored name from setup, fallback to formatted ID
            const name = groupNameMap.get(groupId) ||
              groupId.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
            groupsMap.set(groupId, {
              id: groupId,
              name,
              messageCount
            })
          }
        })
      })
    })

    const allGroupsList = Array.from(groupsMap.values()).sort((a, b) => b.messageCount - a.messageCount)

    // Apply search filter
    if (searchQuery) {
      return allGroupsList.filter(g =>
        g.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

    return allGroupsList
  }, [allGames, searchQuery])

  // Get messages for selected group (time-filtered) for Game Chats
  const selectedGroupMessages = useMemo(() => {
    if (!selectedChatId || !startTime || !currentDate || activeTab !== 'game') return []

    const messages: Array<{
      from: string
      message: string
      timestamp: string
      timestampMs: number
      day: number
      gameId: string
    }> = []

    // Add timeline messages from games
    allGames.forEach(g => {
      g.timeline?.forEach(day => {
        const groupMsgs = day.groupChats?.[selectedChatId]
        if (groupMsgs && Array.isArray(groupMsgs)) {
          groupMsgs.forEach((msg: ChatMessage) => {
            const msgTime = msg.timestamp || `${day.summary.split(':')[0]}T12:00:00Z`
            const timestampMs = new Date(msgTime).getTime()

            messages.push({
              from: msg.from,
              message: msg.message,
              timestamp: msgTime,
              timestampMs,
              day: day.day,
              gameId: g.id
            })
          })
        }
      })
    })

    // Add WebSocket messages (real-time messages)
    wsMessages.forEach(wsMsg => {
      if (wsMsg.chatId === selectedChatId) {
        const timestampMs = new Date(wsMsg.createdAt).getTime()
        const dayNumber = Math.floor((timestampMs - startTime) / (1000 * 60 * 60 * 24))
        
        messages.push({
          from: wsMsg.senderId,
          message: wsMsg.content,
          timestamp: wsMsg.createdAt,
          timestampMs,
          day: dayNumber,
          gameId: 'websocket'
        })
      }
    })

    // Filter by current time and sort chronologically
    const currentTimeAbsolute = startTime + currentTimeMs
    let filtered = messages
      .filter(m => m.timestampMs <= currentTimeAbsolute)
      .sort((a, b) => a.timestampMs - b.timestampMs)

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(m =>
        m.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.from.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

    return filtered
  }, [selectedChatId, allGames, startTime, currentDate, currentTimeMs, searchQuery, activeTab, wsMessages])

  // Get actor name from ID
  const getActorName = (actorId: string) => {
    for (const game of allGames) {
      const allActors = [
        ...(game.setup?.mainActors || []),
        ...(game.setup?.supportingActors || []),
        ...(game.setup?.extras || [])
      ]
      const actor = allActors.find(a => a.id === actorId)
      if (actor) return actor.name
    }
    return actorId
  }

  // Get group members for GroupAvatar
  const getGroupMembers = (groupId: string) => {
    for (const game of allGames) {
      const groupChat = game.setup?.groupChats?.find(g => g.id === groupId)
      if (groupChat?.members) {
        return groupChat.members.map(memberId => ({
          id: memberId,
          name: getActorName(memberId),
          type: 'actor' as const
        }))
      }
    }
    return []
  }

  // Load user's chats from database
  useEffect(() => {
    if (authenticated && activeTab === 'user') {
      loadChats()
    }
  }, [authenticated, activeTab])

  // Load selected chat details from database
  useEffect(() => {
    if (selectedChatId && activeTab === 'user') {
      loadChatDetails(selectedChatId)
    }
  }, [selectedChatId, activeTab])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatDetails?.messages, selectedGroupMessages])

  const loadChats = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/chats')
      const data = await response.json()
      
      if (response.ok) {
        setGroupChats(data.groupChats || [])
        setDirectChats(data.directChats || [])
      }
    } catch (error) {
      console.error('Error loading chats:', error)
    } finally {
      setLoading(false)
      // Log loading state for debugging
      console.log('Chats loaded, loading state:', false)
    }
  }

  // Log loading state changes for debugging
  useEffect(() => {
    if (loading) {
      console.log('Loading chats...')
    }
  }, [loading])

  // Log chat loading state changes for debugging
  useEffect(() => {
    if (loadingChat) {
      console.log('Loading chat details...')
    }
  }, [loadingChat])

  const loadChatDetails = async (chatId: string) => {
    try {
      setLoadingChat(true)
      const response = await fetch(`/api/chats/${chatId}`)
      const data = await response.json()
      
      if (response.ok) {
        setChatDetails(data)
      }
    } catch (error) {
      console.error('Error loading chat details:', error)
    } finally {
      setLoadingChat(false)
    }
  }

  const sendMessage = async () => {
    if (!selectedChatId || !messageInput.trim() || sending) return

    setSending(true)
    setSendError(null)
    setSendSuccess(false)

    try {
      const token = await getAccessToken()
      if (!token) {
        throw new Error('Authentication required')
      }

      if (activeTab === 'game') {
        // For game chats, use the group chat message endpoint
        const response = await fetch(`/api/chats/${selectedChatId}/message`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ content: messageInput.trim() }),
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Failed to send message')
        }

        // Show quality feedback
        if (data.warnings && data.warnings.length > 0) {
          setSendError(data.warnings.join('. '))
          setTimeout(() => setSendError(null), 5000)
        } else {
          setSendSuccess(true)
          setTimeout(() => setSendSuccess(false), 2000)
        }

        // Add message to WebSocket state for immediate display
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
        // For user chats
        const response = await fetch(`/api/chats/${selectedChatId}/message`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ content: messageInput.trim() }),
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Failed to send message')
        }

        // Add message to local state
        if (chatDetails && data.message) {
          setChatDetails({
            ...chatDetails,
            messages: [...chatDetails.messages, data.message],
          })
        }

        // Show quality feedback
        if (data.warnings && data.warnings.length > 0) {
          setSendError(data.warnings.join('. '))
          setTimeout(() => setSendError(null), 5000)
        } else {
          setSendSuccess(true)
          setTimeout(() => setSendSuccess(false), 2000)
        }

        setMessageInput('')
        
        // Reload chat list to update last message
        loadChats()
      }
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Failed to send message')
      setTimeout(() => setSendError(null), 5000)
    } finally {
      setSending(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const allUserChats = [...groupChats, ...directChats].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )

  const filteredUserChats = searchQuery
    ? allUserChats.filter((chat) =>
        chat.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allUserChats

  // Log filtered chats count for debugging
  useEffect(() => {
    console.log(`Filtered chats: ${filteredUserChats.length} of ${allUserChats.length}`)
  }, [filteredUserChats.length, allUserChats.length])

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (days === 0) {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    } else if (days === 1) {
      return 'Yesterday'
    } else if (days < 7) {
      return date.toLocaleDateString('en-US', { weekday: 'short' })
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }
  }

  // Log most recent chat time for debugging
  useEffect(() => {
    if (allUserChats.length > 0 && allUserChats[0]) {
      const mostRecent = allUserChats[0]
      console.log(`Most recent chat updated: ${formatTime(mostRecent.updatedAt)}`)
    }
  }, [allUserChats])

  // No games loaded state
  if (allGames.length === 0 && activeTab === 'game') {
    return (
      <PageContainer noPadding className="flex flex-col">
        <div className="sticky top-0 z-10 bg-background">
          <div className="p-4">
            <h1 className="text-2xl font-bold text-foreground">Chats</h1>
          </div>
          <Separator />
        </div>
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
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background">
          <div className="p-4">
            <div className="flex items-center gap-3 mb-4">
              <MessageCircle className="w-6 h-6" style={{ color: '#b82323' }} />
              <h1 className="text-2xl font-bold text-foreground">Chats</h1>
            </div>

            {/* Tabs */}
            <div className={cn(
              'flex gap-2 p-1 rounded-lg',
              'bg-sidebar-accent/30 chat-card'
            )}>
              <button
                onClick={() => {
                  setActiveTab('game')
                  setSelectedChatId(null)
                }}
                className={cn(
                  'flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-300',
                  activeTab === 'game' ? 'chat-tab-active' : 'chat-tab'
                )}
                style={{ color: activeTab === 'game' ? '#1c9cf0' : 'inherit' }}
              >
                Game Chats
              </button>
              <button
                onClick={() => {
                  setActiveTab('user')
                  setSelectedChatId(null)
                }}
                className={cn(
                  'flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-300',
                  activeTab === 'user' ? 'chat-tab-active' : 'chat-tab'
                )}
                style={{ color: activeTab === 'user' ? '#1c9cf0' : 'inherit' }}
              >
                My Chats
              </button>
            </div>
          </div>
          <Separator />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'game' ? (
            /* GAME CHATS - Original Implementation */
            <div className="flex h-full">
              {/* Left Column - Groups List */}
              <div className={cn(
                'w-full md:w-96 flex-col bg-background',
                selectedChatId ? 'hidden md:flex' : 'flex'
              )}>
                {/* Header with Search */}
                <div className="p-4">
                  <h2 className="text-xl font-bold mb-3 text-foreground">Group Chats</h2>

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

                  <div className="text-sm text-muted-foreground">
                    {searchQuery ? (
                      <>{allGroups.length} group{allGroups.length !== 1 ? 's' : ''} found</>
                    ) : (
                      <>{allGroups.length} groups</>
                    )}
                  </div>
                </div>
                <Separator />

                {/* Groups List */}
                <div className="flex-1 overflow-y-auto">
                  {allGroups.map((group, idx) => {
                    const members = getGroupMembers(group.id)
                    return (
                      <React.Fragment key={group.id}>
                        <div
                          onClick={() => setSelectedChatId(group.id)}
                          className={cn(
                            'p-4 cursor-pointer transition-all duration-300',
                            selectedChatId === group.id
                              ? 'bg-sidebar-accent/50 border-l-4'
                              : 'hover:bg-sidebar-accent/30'
                          )}
                          style={{
                            borderLeftColor: selectedChatId === group.id ? '#b82323' : 'transparent'
                          }}
                        >
                          <div className="flex items-center gap-3">
                            {members.length > 0 ? (
                              <GroupAvatar members={members} size="md" />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-sidebar-accent/50 flex items-center justify-center flex-shrink-0 chat-button">
                                <MessageCircle className="w-5 h-5" style={{ color: '#b82323' }} />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-sm truncate text-foreground">
                                {group.name}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {group.messageCount} messages
                              </div>
                            </div>
                          </div>
                        </div>
                        {idx < allGroups.length - 1 && <Separator />}
                      </React.Fragment>
                    )
                  })}

                  {allGroups.length === 0 && (
                    <div className="text-center text-muted-foreground py-12">
                      <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>No group chats yet</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column - Selected Group Messages */}
              <div className={cn(
                'flex-1 flex-col bg-background',
                !selectedChatId ? 'hidden md:flex' : 'flex'
              )}>
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
                            'hover:bg-sidebar-accent/50 transition-colors text-foreground'
                          )}
                        >
                          <ArrowLeft className="w-4 h-4" />
                          Back
                        </button>
                        <h3 className="text-lg font-bold text-foreground">
                          {allGroups.find(g => g.id === selectedChatId)?.name || 'Group'}
                        </h3>
                      </div>
                      
                      {/* Desktop header - chat name only */}
                      <h3 className="hidden md:block text-lg font-bold text-foreground mb-2">
                        {allGroups.find(g => g.id === selectedChatId)?.name || 'Group'}
                      </h3>
                      
                      {searchQuery && (
                        <div className="text-sm text-muted-foreground mt-1">
                          {selectedGroupMessages.length} message{selectedGroupMessages.length !== 1 ? 's' : ''} matching "{searchQuery}"
                        </div>
                      )}
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                      {selectedGroupMessages.map((msg, i) => {
                        const msgDate = new Date(msg.timestamp)
                        const actorName = getActorName(msg.from)
                        const isCurrentUser = user?.id && msg.from === user.id

                        return (
                          <div
                            key={i}
                            className={cn(
                              'flex gap-3',
                              isCurrentUser ? 'justify-end' : 'items-start'
                            )}
                          >
                            {!isCurrentUser && (
                              <Avatar
                                id={msg.from}
                                name={actorName}
                                type="actor"
                                size="md"
                              />
                            )}
                            <div className={cn('max-w-[70%] flex flex-col', isCurrentUser ? 'items-end' : 'items-start')}>
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                {!isCurrentUser && (
                                  <span className="font-bold text-sm text-foreground">
                                    {actorName}
                                  </span>
                                )}
                                {!isCurrentUser && <span className="text-muted-foreground">·</span>}
                                <span className="text-xs text-muted-foreground">
                                  {msgDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at {msgDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              <div
                                className={cn(
                                  'px-4 py-2 rounded-2xl message-bubble text-sm whitespace-pre-wrap break-words',
                                  isCurrentUser ? 'rounded-tr-sm' : 'rounded-tl-sm'
                                )}
                                style={{
                                  backgroundColor: isCurrentUser ? '#1c9cf020' : 'rgba(var(--sidebar-accent), 0.5)'
                                }}
                              >
                                <span className="text-foreground">{msg.message}</span>
                              </div>
                            </div>
                          </div>
                        )
                      })}

                      {selectedGroupMessages.length === 0 && (
                        <div className="flex items-center justify-center h-full">
                          <div className="text-center text-muted-foreground max-w-md p-8">
                            {searchQuery ? (
                              <>
                                <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                <p>No messages matching "{searchQuery}"</p>
                              </>
                            ) : (
                              <>
                                <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                <p className="mb-2 text-foreground">No messages in this group yet</p>
                                <p className="text-xs">
                                  This group hasn't posted messages in the current time period
                                </p>
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
                      <h3 className="text-xl font-bold mb-2 text-foreground">Select a group chat</h3>
                      <p className="text-sm">Choose a group from the list to view messages</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* MY CHATS - User Database Chats */
            ready && !authenticated ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center max-w-md p-8">
                  <MessageCircle className="w-16 h-16 mx-auto mb-4 opacity-50" style={{ color: '#b82323' }} />
                  <h3 className="text-xl font-bold mb-2 text-foreground">Connect to Chat</h3>
                  <p className="text-muted-foreground mb-6">Connect your wallet to start chatting</p>
                  <LoginButton />
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center max-w-md p-8 text-muted-foreground">
                  <Users className="w-16 h-16 mx-auto mb-4 opacity-50" style={{ color: '#1c9cf0' }} />
                  <h3 className="text-xl font-bold mb-2 text-foreground">Direct Chats Coming Soon</h3>
                  <p className="text-sm">Chat directly with other players and NPCs</p>
                </div>
              </div>
            )
          )}
        </div>
      </PageContainer>
    </>
  )
}
