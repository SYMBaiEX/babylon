'use client';

import { TeamChatView } from '@/components/chats';
import { useAuth } from '@/hooks/useAuth';
import { useTeamChat } from '@/hooks/useTeamChat';

export function TerminalAgentsChat() {
  const { authenticated, user, login } = useAuth();
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
    thinkingAgents,
    sendError,
    messagesEndRef,
    topSentinelRef,
    sendMessage,
    handleScroll,
    selectedAgentIds,
    processingAgentIds,
    toggleAgentSelection,
  } = useTeamChat();

  if (!authenticated) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div className="max-w-md text-muted-foreground text-sm">
          <div className="mb-3 font-semibold text-foreground">
            Log in to chat with your agents
          </div>
          <button
            type="button"
            onClick={login}
            className="mt-2 rounded bg-foreground px-4 py-2 font-semibold text-background text-sm transition-colors hover:opacity-90"
          >
            Log In
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-muted-foreground text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TeamChatView
        chatDetails={chatDetails}
        currentUserId={user?.id}
        authenticated={authenticated}
        sseConnected={sseConnected}
        hideHeader
        loading={loading}
        isLoadingMore={isLoadingMore}
        hasMore={hasMore}
        messageInput={messageInput}
        sending={sending}
        sendError={sendError}
        topSentinelRef={topSentinelRef}
        messagesEndRef={messagesEndRef}
        onMessageChange={handleInputChange}
        onSendMessage={sendMessage}
        agents={[
          ...(user
            ? [
                {
                  id: user.id,
                  username: user.username || null,
                  displayName: user.displayName || user.username || 'You',
                  profileImageUrl: user.profileImageUrl || null,
                },
              ]
            : []),
          ...(teamChat?.agents.map((agent) => ({
            id: agent.id,
            username: agent.username,
            displayName: agent.displayName,
            profileImageUrl: agent.profileImageUrl,
          })) || []),
        ]}
        typingUsers={typingUsers}
        thinkingAgents={thinkingAgents}
        onScroll={handleScroll}
        selectedAgents={
          teamChat?.agents
            .filter((a) => selectedAgentIds.has(a.id))
            .map((a) => ({
              id: a.id,
              displayName: a.displayName || a.username || 'Agent',
              profileImageUrl: a.profileImageUrl,
              isProcessing: processingAgentIds.has(a.id),
            })) || []
        }
        onRemoveSelectedAgent={toggleAgentSelection}
        hasProcessingSelected={
          selectedAgentIds.size > 0 &&
          Array.from(selectedAgentIds).some((id) => processingAgentIds.has(id))
        }
      />
    </div>
  );
}
