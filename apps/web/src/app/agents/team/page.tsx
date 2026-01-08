'use client';

import { cn } from '@babylon/shared';
import { Bot, Plus, Radio, Users, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { LoginButton } from '@/components/auth/LoginButton';
import { TeamChatView } from '@/components/chats';
import { Avatar } from '@/components/shared/Avatar';
import { PageContainer } from '@/components/shared/PageContainer';
import { Separator } from '@/components/shared/Separator';
import { Skeleton } from '@/components/shared/Skeleton';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useTeamChat } from '@/hooks/useTeamChat';

/**
 * Agent Team Chat Page (Command Center)
 *
 * A unified group chat containing all the user's agents.
 * Users can @mention specific agents to direct tasks.
 */
export default function TeamChatPage() {
  const { ready, authenticated, user } = useAuth();

  const {
    teamChat,
    chatDetails,
    loading,
    sending,
    error,
    sseConnected,
    isLoadingMore,
    hasMore,
    messageInput,
    handleInputChange,
    typingUsers,
    sendError,
    sendSuccess,
    setMentionedAgentIds,
    pullDistance,
    messagesEndRef,
    topSentinelRef,
    setRefs,
    sendMessage,
  } = useTeamChat();

  // Mobile member drawer state
  const [showMemberDrawer, setShowMemberDrawer] = useState(false);

  // Auth required state
  if (ready && !authenticated) {
    return (
      <PageContainer noPadding className="flex flex-col">
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="max-w-md text-center">
            <Users className="mx-auto mb-4 h-16 w-16 text-muted-foreground" />
            <h2 className="mb-2 font-bold text-foreground text-xl">
              Log in to access Command Center
            </h2>
            <p className="mb-6 text-muted-foreground">
              Sign in to coordinate your agents
            </p>
            <LoginButton />
          </div>
        </div>
      </PageContainer>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex h-[calc(100dvh-112px)] flex-col md:h-dvh">
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Member sidebar skeleton */}
          <div className="hidden w-64 flex-col border-r border-border p-4 lg:flex">
            <Skeleton className="mb-4 h-8 w-32" />
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
          </div>
          {/* Chat area skeleton */}
          <div className="flex flex-1 flex-col">
            <div className="p-4">
              <Skeleton className="h-8 w-48" />
            </div>
            <div className="flex-1" />
          </div>
        </div>
      </div>
    );
  }

  // No team chat (no agents yet)
  if (!teamChat) {
    return (
      <PageContainer noPadding className="flex flex-col">
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="max-w-md text-center">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20">
              <Bot className="h-10 w-10 text-blue-500" />
            </div>
            <h2 className="mb-2 font-bold text-foreground text-2xl">
              Your Command Center is ready
            </h2>
            <p className="mb-6 text-muted-foreground">
              Create your first agent to start coordinating. Your Command Center
              will automatically include all your agents in one unified chat.
            </p>
            <Link href="/agents/create">
              <Button size="lg" className="gap-2">
                <Plus className="h-5 w-5" />
                Create Your First Agent
              </Button>
            </Link>
          </div>
        </div>
      </PageContainer>
    );
  }

  // Error state
  if (error) {
    return (
      <PageContainer noPadding className="flex flex-col">
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="max-w-md text-center">
            <Users className="mx-auto mb-4 h-16 w-16 text-red-500" />
            <h2 className="mb-2 font-bold text-foreground text-xl">
              Failed to load Command Center
            </h2>
            <p className="mb-6 text-muted-foreground">{error}</p>
          </div>
        </div>
      </PageContainer>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-112px)] flex-col md:h-dvh">
      {/* Mobile Member Drawer */}
      {showMemberDrawer && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm lg:hidden"
            onClick={() => setShowMemberDrawer(false)}
          />

          {/* Drawer Panel - slides in from right */}
          <div className="slide-in-from-right fixed top-0 right-0 bottom-0 z-50 flex w-[280px] animate-in flex-col bg-sidebar duration-300 lg:hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4">
              <h3 className="font-semibold text-foreground">Team Members</h3>
              <button
                onClick={() => setShowMemberDrawer(false)}
                className="rounded-lg p-2 transition-colors hover:bg-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <Separator />

            {/* Member list */}
            <div className="flex-1 overflow-y-auto p-4">
              {/* You (the user) */}
              <div className="mb-4">
                <p className="mb-2 font-medium text-muted-foreground text-xs uppercase">
                  You
                </p>
                <div className="flex items-center gap-3">
                  <Avatar
                    src={user?.profileImageUrl}
                    name={user?.displayName || user?.username || 'You'}
                    size="sm"
                  />
                  <span className="font-medium text-foreground text-sm">
                    {user?.displayName || user?.username || 'You'}
                  </span>
                </div>
              </div>

              <Separator className="my-4" />

              {/* Agents */}
              <div>
                <p className="mb-2 font-medium text-muted-foreground text-xs uppercase">
                  Agents ({teamChat?.agentCount ?? 0})
                </p>
                {teamChat?.agents.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    No agents yet.{' '}
                    <Link
                      href="/agents/create"
                      className="text-blue-500 hover:underline"
                      onClick={() => setShowMemberDrawer(false)}
                    >
                      Create one
                    </Link>
                  </p>
                ) : (
                  <div className="space-y-3">
                    {teamChat?.agents.map((agent) => (
                      <Link
                        key={agent.id}
                        href={`/agents/${agent.id}`}
                        onClick={() => setShowMemberDrawer(false)}
                        className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted/50"
                      >
                        <Avatar
                          src={agent.profileImageUrl ?? undefined}
                          name={agent.displayName || agent.username || 'Agent'}
                          size="sm"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-foreground text-sm">
                            {agent.displayName || agent.username || 'Agent'}
                          </p>
                          {agent.username && (
                            <p className="truncate text-muted-foreground text-xs">
                              @{agent.username}
                            </p>
                          )}
                        </div>
                        <Bot className="h-4 w-4 flex-shrink-0 text-blue-500" />
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Add agent button */}
              <div className="mt-4">
                <Link href="/agents/create" onClick={() => setShowMemberDrawer(false)}>
                  <Button variant="outline" size="sm" className="w-full gap-2">
                    <Plus className="h-4 w-4" />
                    Add Agent
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Member Sidebar - visible on lg+ */}
        <div className="hidden w-64 flex-col border-r border-border lg:flex">
          {/* Header */}
          <div className="flex items-center justify-between p-4">
            <h3 className="font-semibold text-foreground">Team Members</h3>
            <div
              className={cn(
                'flex items-center gap-1.5 text-xs',
                sseConnected ? 'text-green-500' : 'text-muted-foreground'
              )}
            >
              <Radio className="h-3 w-3" />
              {sseConnected ? 'Live' : 'Offline'}
            </div>
          </div>

          <Separator />

          {/* Member list */}
          <div className="flex-1 overflow-y-auto p-4">
            {/* You (the user) */}
            <div className="mb-4">
              <p className="mb-2 font-medium text-muted-foreground text-xs uppercase">
                You
              </p>
              <div className="flex items-center gap-3">
                <Avatar
                  src={user?.profileImageUrl}
                  name={user?.displayName || user?.username || 'You'}
                  size="sm"
                />
                <span className="font-medium text-foreground text-sm">
                  {user?.displayName || user?.username || 'You'}
                </span>
              </div>
            </div>

            <Separator className="my-4" />

            {/* Agents */}
            <div>
              <p className="mb-2 font-medium text-muted-foreground text-xs uppercase">
                Agents ({teamChat.agentCount})
              </p>
              {teamChat.agents.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No agents yet.{' '}
                  <Link
                    href="/agents/create"
                    className="text-blue-500 hover:underline"
                  >
                    Create one
                  </Link>
                </p>
              ) : (
                <div className="space-y-3">
                  {teamChat.agents.map((agent) => (
                    <Link
                      key={agent.id}
                      href={`/agents/${agent.id}`}
                      className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted/50"
                    >
                      <Avatar
                        src={agent.profileImageUrl ?? undefined}
                        name={agent.displayName || agent.username || 'Agent'}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-foreground text-sm">
                          {agent.displayName || agent.username || 'Agent'}
                        </p>
                        {agent.username && (
                          <p className="truncate text-muted-foreground text-xs">
                            @{agent.username}
                          </p>
                        )}
                      </div>
                      <Bot className="h-4 w-4 flex-shrink-0 text-blue-500" />
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Add agent button */}
            <div className="mt-4">
              <Link href="/agents/create">
                <Button variant="outline" size="sm" className="w-full gap-2">
                  <Plus className="h-4 w-4" />
                  Add Agent
                </Button>
              </Link>
            </div>
          </div>
        </div>

        <Separator orientation="vertical" className="hidden lg:block" />

        {/* Chat Area */}
        <div className="flex min-h-0 flex-1 flex-col bg-background">
          <TeamChatView
            chatDetails={chatDetails}
            currentUserId={user?.id}
            authenticated={authenticated}
            sseConnected={sseConnected}
            loading={false}
            isLoadingMore={isLoadingMore}
            hasMore={hasMore}
            pullDistance={pullDistance}
            messageInput={messageInput}
            sending={sending}
            sendError={sendError}
            sendSuccess={sendSuccess}
            containerRef={setRefs}
            topSentinelRef={topSentinelRef}
            messagesEndRef={messagesEndRef}
            onMessageChange={handleInputChange}
            onSendMessage={sendMessage}
            agents={teamChat?.agents.map((agent) => ({
              id: agent.id,
              username: agent.username,
              displayName: agent.displayName,
              profileImageUrl: agent.profileImageUrl,
            })) || []}
            onMentionsChange={setMentionedAgentIds}
            typingUsers={typingUsers}
            onShowMembers={() => setShowMemberDrawer(true)}
          />
        </div>
      </div>
    </div>
  );
}

