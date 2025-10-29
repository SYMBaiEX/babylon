'use client'

import { useMemo, useState } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { Search, X, ArrowLeft, MessageCircle } from 'lucide-react'
import Link from 'next/link'
import type { ChatMessage } from '@/shared/types'
import { Avatar, GroupAvatar } from '@/components/shared/Avatar'
import { PageContainer } from '@/components/shared/PageContainer'
import { cn } from '@/lib/utils'

export default function ChatsPage() {
  const { allGames, startTime, currentTimeMs } = useGameStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)

  // Calculate current date from timeline
  const currentDate = startTime ? new Date(startTime + currentTimeMs) : null

  // Get all unique groups from all games
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

  // Get messages for selected group (time-filtered)
  const selectedGroupMessages = useMemo(() => {
    if (!selectedGroup || !startTime || !currentDate) return []

    const messages: Array<{
      from: string
      message: string
      timestamp: string
      timestampMs: number
      day: number
      gameId: string
    }> = []

    allGames.forEach(g => {
      g.timeline?.forEach(day => {
        const groupMsgs = day.groupChats?.[selectedGroup]
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
  }, [selectedGroup, allGames, startTime, currentDate, currentTimeMs, searchQuery])

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

  if (allGames.length === 0) {
    return (
      <div className="flex flex-col h-screen bg-background">
        <div className="sticky top-0 z-10 bg-background border-b border-border">
          <div className="p-4">
            <h1 className="text-2xl font-bold text-foreground">Chats</h1>
          </div>
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
      </div>
    )
  }

  return (
    <PageContainer noPadding className="flex flex-col md:flex-row">
      {/* Left Column - Groups List */}
      <div className={cn(
        'w-full md:w-96 flex-col bg-background',
        'border-r border-border',
        selectedGroup ? 'hidden md:flex' : 'flex'
      )}>
        {/* Header with Search */}
        <div className="p-4 border-b border-border sticky top-0 bg-background z-10">
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
                'bg-muted border border-border text-foreground',
                'outline-none focus:border-primary transition-colors',
                'placeholder:text-muted-foreground'
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

        {/* Groups List */}
        <div className="flex-1 overflow-y-auto">
          {allGroups.map(group => {
            const members = getGroupMembers(group.id)
            return (
              <div
                key={group.id}
                onClick={() => setSelectedGroup(group.id)}
                className={cn(
                  'p-4 border-b border-border cursor-pointer transition-colors',
                  selectedGroup === group.id
                    ? 'bg-muted border-l-4 border-l-primary'
                    : 'hover:bg-muted/50'
                )}
              >
                <div className="flex items-center gap-3">
                  {members.length > 0 ? (
                    <GroupAvatar members={members} size="md" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <MessageCircle className="w-5 h-5 text-primary" />
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
        !selectedGroup ? 'hidden md:flex' : 'flex'
      )}>
        {selectedGroup ? (
          <>
            {/* Group Header */}
            <div className="p-4 border-b border-border sticky top-0 bg-background z-10">
              <button
                onClick={() => setSelectedGroup(null)}
                className={cn(
                  'mb-2 -ml-2 md:hidden flex items-center gap-2',
                  'px-3 py-1.5 rounded-md text-sm font-medium',
                  'hover:bg-muted transition-colors text-foreground'
                )}
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
              <h3 className="text-lg font-bold text-foreground">
                {allGroups.find(g => g.id === selectedGroup)?.name || 'Group'}
              </h3>
              <div className="text-sm text-muted-foreground mt-1">
                {searchQuery ? (
                  <>{selectedGroupMessages.length} message{selectedGroupMessages.length !== 1 ? 's' : ''} matching "{searchQuery}"</>
                ) : (
                  <>{selectedGroupMessages.length} messages visible</>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto">
              {selectedGroupMessages.map((msg, i) => {
                const msgDate = new Date(msg.timestamp)
                const actorName = getActorName(msg.from)

                return (
                  <div
                    key={i}
                    className={cn(
                      'p-4 border-b border-border',
                      'hover:bg-muted/50 transition-colors'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {/* Avatar */}
                      <Avatar
                        id={msg.from}
                        name={actorName}
                        type="actor"
                        size="md"
                      />

                      {/* Message Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-bold text-sm text-foreground">
                            {actorName}
                          </span>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-xs text-muted-foreground">
                            {msgDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at {msgDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                          {msg.message}
                        </div>
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
            </div>
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
    </PageContainer>
  )
}
