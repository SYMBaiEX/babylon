'use client';

import { cn } from '@babylon/shared';
import { Loader2, MessageCircle } from 'lucide-react';
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
import { useSSE } from '@/hooks/useSSE';

export default function ChatsPage() {
  useA2A();
  useChatParam();

  // Get global SSE connection status
  const { isConnected: globalSSEConnected } = useSSE({
    channels: ['feed'],
  });

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
    pullDistance,

    // Actions
    sendMessage,
  } = useChatPage();

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

  const handleTagClick = (tag: string) => setSearchQuery(tag);

  return (
    <>
      {/* Use fixed viewport heights to ensure proper scroll containment */}
      {/* Mobile: 100dvh - 56px header - 56px bottom nav = calc(100dvh - 112px) */}
      {/* Desktop: full viewport height */}
      <div className="flex h-[calc(100dvh-112px)] flex-col overflow-hidden md:h-dvh">
        {/* Desktop: Two Column Layout */}
        <div className="hidden min-h-0 flex-1 flex-col overflow-hidden xl:flex">
          <div className="min-h-0 flex-1 overflow-hidden">
            <div className="flex h-full min-h-0">
              {/* Left Column: Chat List with Filters */}
              <div className="flex h-full min-h-0 w-96 flex-col bg-background">
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

              {/* Vertical Separator */}
              <Separator orientation="vertical" className="shrink-0" />

              {/* Right Column: Chat View */}
              <div className="h-full min-h-0 flex-1 bg-background">
                <ChatView
                  chatDetails={chatDetails}
                  currentUserId={user?.id}
                  authenticated={authenticated}
                  sseConnected={sseConnected}
                  loading={loadingChat}
                  isLoadingMore={isLoadingMore}
                  hasMore={hasMore}
                  pullDistance={pullDistance}
                  messageInput={messageInput}
                  sending={sending}
                  sendError={sendError}
                  sendWarning={sendWarning}
                  sendSuccess={sendSuccess}
                  containerRef={setRefs}
                  topSentinelRef={topSentinelRef}
                  messagesEndRef={messagesEndRef}
                  onManageGroup={handleManageGroup}
                  onLeaveChat={() => setLeaveConfirmOpen(true)}
                  onMessageChange={setMessageInput}
                  onSendMessage={sendMessage}
                  onTagClick={handleTagClick}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Mobile/Tablet: Responsive Layout */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden xl:hidden">
          <div className="min-h-0 flex-1 overflow-hidden">
            <div className="flex h-full min-h-0">
              {/* Chat List (full screen on mobile, side panel on tablet when chat selected) */}
              <div
                className={cn(
                  'h-full min-h-0 w-full flex-col bg-background',
                  selectedChatId ? 'hidden lg:flex lg:w-96' : 'flex'
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

              {/* Vertical Separator for Tablet */}
              {selectedChatId && (
                <Separator
                  orientation="vertical"
                  className="hidden shrink-0 lg:block"
                />
              )}

              {/* Chat View (full screen on mobile, shared on tablet) */}
              {selectedChatId && chatDetails && (
                <div
                  className={cn(
                    'h-full min-h-0 flex-1 bg-background',
                    !selectedChatId ? 'hidden lg:block' : 'block'
                  )}
                >
                  <ChatView
                    chatDetails={chatDetails}
                    currentUserId={user?.id}
                    authenticated={authenticated}
                    sseConnected={sseConnected}
                    loading={loadingChat}
                    isLoadingMore={isLoadingMore}
                    hasMore={hasMore}
                    pullDistance={pullDistance}
                    messageInput={messageInput}
                    sending={sending}
                    sendError={sendError}
                    sendWarning={sendWarning}
                    sendSuccess={sendSuccess}
                    showBackButton
                    containerRef={setRefs}
                    topSentinelRef={topSentinelRef}
                    messagesEndRef={messagesEndRef}
                    onBack={() => setSelectedChatId(null)}
                    onManageGroup={handleManageGroup}
                    onLeaveChat={() => setLeaveConfirmOpen(true)}
                    onMessageChange={setMessageInput}
                    onSendMessage={sendMessage}
                    onTagClick={handleTagClick}
                  />
                </div>
              )}
            </div>
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
