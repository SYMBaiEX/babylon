'use client';

import { MessageCircle, Radio } from 'lucide-react';
import React from 'react';
import { Separator } from '@/components/shared/Separator';
import { FeedbackMessages } from './FeedbackMessages';
import type { MentionableAgent } from './MentionAutocomplete';
import { MessageList } from './MessageList';
import { TeamChatMessageInput } from './TeamChatMessageInput';
import type { ChatDetails } from './types';

interface TeamChatViewProps {
  chatDetails: ChatDetails | null;
  currentUserId: string | undefined;
  authenticated: boolean;
  sseConnected: boolean;
  loading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  pullDistance: number;
  messageInput: string;
  sending: boolean;
  sendError: string | null;
  sendSuccess: boolean;
  containerRef: (node: HTMLDivElement | null) => void;
  topSentinelRef: React.RefObject<HTMLDivElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  onMessageChange: (value: string) => void;
  onSendMessage: () => void;
  /** Agents available for @mention */
  agents: MentionableAgent[];
  /** Callback when mentioned agents change */
  onMentionsChange?: (mentionedAgentIds: string[]) => void;
}

/**
 * Chat view component for Team Chat (Command Center)
 *
 * Similar to ChatView but uses TeamChatMessageInput with @mention support
 */
export function TeamChatView({
  chatDetails,
  currentUserId,
  authenticated,
  sseConnected,
  loading,
  isLoadingMore,
  hasMore,
  pullDistance,
  messageInput,
  sending,
  sendError,
  sendSuccess,
  containerRef,
  topSentinelRef,
  messagesEndRef,
  onMessageChange,
  onSendMessage,
  agents,
  onMentionsChange,
}: TeamChatViewProps) {
  // Empty state when no chat selected
  if (!chatDetails) {
    return (
      <div className="flex h-full flex-1 items-center justify-center">
        <div className="max-w-md p-8 text-center text-muted-foreground">
          <MessageCircle className="mx-auto mb-4 h-16 w-16 opacity-50" />
          <h3 className="mb-2 font-bold text-foreground text-xl">
            Command Center
          </h3>
          <p className="text-sm">Loading your team chat...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Chat Header - Fixed */}
      <div className="shrink-0">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <h2 className="font-semibold text-foreground text-lg">
              Command Center
            </h2>
            <p className="text-muted-foreground text-sm">
              {chatDetails.participants.length} member
              {chatDetails.participants.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Radio
              className={
                sseConnected
                  ? 'h-4 w-4 text-green-500'
                  : 'h-4 w-4 text-muted-foreground'
              }
            />
            <span className="text-muted-foreground text-sm">
              {sseConnected ? 'Live' : 'Connecting...'}
            </span>
          </div>
        </div>

        {/* Header Separator */}
        <div className="px-4">
          <Separator />
        </div>
      </div>

      {/* Messages - Scrollable */}
      <div
        ref={containerRef}
        className="relative min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3"
      >
        <MessageList
          messages={chatDetails.messages || []}
          participants={chatDetails.participants || []}
          currentUserId={currentUserId}
          loading={loading}
          isLoadingMore={isLoadingMore}
          hasMore={hasMore}
          pullDistance={pullDistance}
          authenticated={authenticated}
          topSentinelRef={topSentinelRef}
          messagesEndRef={messagesEndRef}
        />
      </div>

      {/* Footer - Fixed */}
      <div className="shrink-0">
        {/* Feedback Messages */}
        {authenticated && (
          <FeedbackMessages
            error={sendError}
            warning={null}
            success={sendSuccess}
          />
        )}

        {/* Input Separator */}
        <div className="px-4">
          <Separator />
        </div>

        {/* Message Input with @mention support */}
        <TeamChatMessageInput
          value={messageInput}
          onChange={onMessageChange}
          onSend={onSendMessage}
          sending={sending}
          authenticated={authenticated}
          agents={agents}
          onMentionsChange={onMentionsChange}
        />
      </div>
    </div>
  );
}
