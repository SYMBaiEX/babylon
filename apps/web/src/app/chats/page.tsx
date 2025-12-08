'use client';

import { cn } from '@babylon/shared';
import { Loader2, MessageCircle } from 'lucide-react';
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

  // Not ready state
  if (!ready && !authenticated) {
    return (
      <PageContainer noPadding className="flex flex-col">
        <div className="flex flex-1 items-center justify-center">
          <div className="mx-auto max-w-md p-8 text-center">
            <MessageCircle className="mx-auto mb-4 h-16 w-16 text-muted-foreground" />
            <h2 className="mb-2 font-bold text-foreground text-xl">
              No Chats Yet
            </h2>
            <p className="mb-4 text-muted-foreground">
              Game is auto-generating in the background...
            </p>
            <div className="space-y-2 text-muted-foreground text-sm">
              <p>This happens automatically on first run.</p>
              <p>Check the terminal logs for progress.</p>
              <p className="rounded bg-muted p-2 font-mono text-xs">
                First generation takes 3-5 minutes
              </p>
            </div>
          </div>
        </div>
      </PageContainer>
    );
  }

  const handleTagClick = (tag: string) => setSearchQuery(tag);

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
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
        `,
        }}
      />
      <PageContainer noPadding className="flex flex-col">
        {/* Desktop: Two Column Layout */}
        <div className="hidden flex-1 flex-col overflow-hidden xl:flex">
          <div className="flex-1 overflow-hidden">
            <div className="flex h-full">
              {/* Left Column: Chat List with Filters */}
              <div className="flex w-96 flex-col bg-background">
                <ChatHeader
                  isConnected={globalSSEConnected}
                  activeFilter={activeFilter}
                  onFilterChange={setActiveFilter}
                  onCreateGroup={() => setIsCreateGroupModalOpen(true)}
                />

                <ChatSearchBar
                  value={searchQuery}
                  onChange={setSearchQuery}
                />

                <ChatList
                  chats={filteredChats}
                  selectedChatId={selectedChatId}
                  loading={loading}
                  searchQuery={searchQuery}
                  activeFilter={activeFilter}
                  onSelectChat={setSelectedChatId}
                />
              </div>

              {/* Vertical Separator */}
              <Separator orientation="vertical" className="shrink-0" />

              {/* Right Column: Chat View */}
              <div className="flex h-screen min-h-screen flex-1 flex-col bg-background">
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
        <div className="flex flex-1 flex-col overflow-hidden xl:hidden">
          <div className="flex-1 overflow-hidden">
            <div className="flex h-full">
              {/* Chat List (full screen on mobile, side panel on tablet when chat selected) */}
              <div
                className={cn(
                  'w-full flex-col bg-background',
                  selectedChatId ? 'hidden lg:flex lg:w-96' : 'flex'
                )}
              >
                <ChatHeader
                  isConnected={globalSSEConnected}
                  activeFilter={activeFilter}
                  onFilterChange={setActiveFilter}
                  onCreateGroup={() => setIsCreateGroupModalOpen(true)}
                />

                <ChatSearchBar
                  value={searchQuery}
                  onChange={setSearchQuery}
                />

                <ChatList
                  chats={filteredChats}
                  selectedChatId={selectedChatId}
                  loading={loading}
                  searchQuery={searchQuery}
                  activeFilter={activeFilter}
                  onSelectChat={setSelectedChatId}
                />
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
                    'h-screen min-h-screen flex-1 flex-col bg-background',
                    !selectedChatId ? 'hidden lg:flex' : 'flex'
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
      </PageContainer>

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
