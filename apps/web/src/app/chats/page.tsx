'use client';

import { cn } from '@babylon/shared';
import { Loader2, MessageCircle } from 'lucide-react';
import { useMemo } from 'react';
import { AgentChat } from '@/components/agents/AgentChat';
import { LoginButton } from '@/components/auth/LoginButton';
import {
  ChatHeader,
  ChatList,
  ChatSearchBar,
  ChatView,
  useChatPage,
} from '@/components/chats';
import { CreateGroupModal } from '@/components/groups/CreateGroupModal';
import { GroupManagementModal } from '@/components/groups/GroupManagementModal';
import { PageContainer } from '@/components/shared/PageContainer';
import { Separator } from '@/components/shared/Separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';
import { useA2A } from '@/hooks/useA2A';
import { useChatParam } from '@/hooks/useChatParam';
import { useOwnedAgents } from '@/hooks/useOwnedAgents';
import { useSSE } from '@/hooks/useSSE';

export default function ChatsPage() {
  useA2A();
  useChatParam();

  // Get global SSE connection status
  const { isConnected: globalSSEConnected } = useSSE({
    channels: ['feed'],
  });

  // Get owned agents for detecting if chatting with own agent
  const { getAgentData, updateAgentBalance } = useOwnedAgents();

  const {
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

    // Actions
    sendMessage,
    loadChats,
  } = useChatPage();

  // Detect if the current chat is with the user's own agent
  // If so, we'll render AgentChat instead of ChatView for AI capabilities
  const ownAgentData = useMemo(() => {
    if (!chatDetails?.chat.otherUser || chatDetails.chat.isGroup) return null;
    const other = chatDetails.chat.otherUser;
    // Check if the other user is an agent managed by the current user
    if (other.isAgent && other.managedBy === user?.id) {
      return getAgentData(other.id);
    }
    return null;
  }, [chatDetails, user?.id, getAgentData]);

  // Auth required state
  if (ready && !authenticated) {
    return (
      <PageContainer noPadding className="flex flex-col">
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="max-w-md text-center">
            <MessageCircle className="mx-auto mb-4 h-16 w-16 text-muted-foreground" />
            <h2 className="mb-2 font-bold text-foreground text-xl">log in</h2>
            <p className="mb-6 text-muted-foreground">
              Sign in to view and send messages
            </p>
            <LoginButton />
          </div>
        </div>
      </PageContainer>
    );
  }

  // Show back button only on mobile/tablet (not on xl+ where both columns visible)
  const showBackButton = !!selectedChatId;

  return (
    <>
      {/* Use fixed viewport heights to ensure proper scroll containment */}
      {/* Mobile: 100dvh - 56px (MobileHeader pt-14) - 56px (BottomNav pb-14) = 112px */}
      {/* Desktop: full viewport height (no header/nav padding) */}
      <div className="flex h-[calc(100dvh-112px)] flex-col overflow-hidden md:h-dvh">
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Left Column: Chat List */}
          {/* Mobile: full width when no chat selected, hidden when chat selected */}
          {/* Tablet (lg): w-96 sidebar when chat selected */}
          {/* Desktop (xl): always visible w-96 sidebar */}
          <div
            className={cn(
              'h-full min-h-0 flex-col bg-background',
              selectedChatId
                ? 'hidden w-96 lg:flex' // Hide on mobile, show as sidebar on lg+
                : 'flex w-full xl:w-96' // Full width on mobile, sidebar width on xl
            )}
          >
            <ChatHeader
              isConnected={globalSSEConnected}
              activeFilter={activeFilter}
              onFilterChange={setActiveFilter}
              onCreateGroup={() => setIsCreateGroupModalOpen(true)}
            />

            <ChatSearchBar value={searchQuery} onChange={setSearchQuery} />

            {/* Scrollable chat list */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ChatList
                chats={filteredChats}
                selectedChatId={selectedChatId}
                loading={loading}
                searchQuery={searchQuery}
                activeFilter={activeFilter}
                onSelectChat={setSelectedChatId}
              />
            </div>
          </div>

          {/* Vertical Separator - visible on lg+ when chat selected */}
          <Separator
            orientation="vertical"
            className={cn(
              'shrink-0',
              selectedChatId ? 'hidden lg:block' : 'hidden xl:block'
            )}
          />

          {/* Right Column: Chat View or Agent Chat */}
          {/* Mobile/Tablet: only shown when chat selected */}
          {/* Desktop (xl): always shown */}
          <div
            className={cn(
              'h-full min-h-0 min-w-0 flex-1 bg-background',
              selectedChatId ? 'block' : 'hidden xl:block'
            )}
          >
            {ownAgentData ? (
              <AgentChat
                agent={ownAgentData}
                onBalanceUpdate={(newBalance) =>
                  updateAgentBalance(ownAgentData.id, newBalance)
                }
                onMessageSent={loadChats}
                showBackButton={showBackButton}
                onBack={() => setSelectedChatId(null)}
              />
            ) : (
              <ChatView
                chatDetails={chatDetails}
                currentUserId={user?.id}
                authenticated={authenticated}
                sseConnected={sseConnected}
                loading={loadingChat}
                isLoadingMore={isLoadingMore}
                hasMore={hasMore}
                messageInput={messageInput}
                sending={sending}
                sendError={sendError}
                sendWarning={sendWarning}
                sendSuccess={sendSuccess}
                showBackButton={showBackButton}
                containerRef={setRefs}
                topSentinelRef={topSentinelRef}
                messagesEndRef={messagesEndRef}
                onBack={() => setSelectedChatId(null)}
                onManageGroup={handleManageGroup}
                onLeaveChat={() => setLeaveConfirmOpen(true)}
                onMessageChange={setMessageInput}
                onSendMessage={sendMessage}
              />
            )}
          </div>
        </div>
      </div>

      {/* Leave Chat Confirmation Dialog */}
      <AlertDialog open={isLeaveConfirmOpen} onOpenChange={setLeaveConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave Chat?</AlertDialogTitle>
            <AlertDialogDescription>
              <p className="text-muted-foreground text-sm">
                Are you sure you want to leave this chat?
              </p>
              {leaveChatError && (
                <p className="mt-2 text-red-500 text-sm">{leaveChatError}</p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setLeaveConfirmOpen(false);
                setLeaveChatError(null);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLeaveChat}
              className={buttonVariants()}
              disabled={isLeavingChat}
            >
              {isLeavingChat && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Group Modals */}
      <CreateGroupModal
        isOpen={isCreateGroupModalOpen}
        onClose={() => setIsCreateGroupModalOpen(false)}
        onGroupCreated={handleGroupCreated}
      />

      <GroupManagementModal
        isOpen={isGroupManagementModalOpen}
        onClose={() => {
          setIsGroupManagementModalOpen(false);
          setSelectedGroupId(null);
        }}
        groupId={selectedGroupId}
        onGroupUpdated={handleGroupUpdated}
      />
    </>
  );
}
