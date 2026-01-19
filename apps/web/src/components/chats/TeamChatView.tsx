'use client';

import { Brain, MessageCircle, Radio, Users } from 'lucide-react';
import React from 'react';
import { Separator } from '@/components/shared/Separator';
import { FeedbackMessages } from './FeedbackMessages';
import type { MentionableAgent } from './MentionAutocomplete';
import { MessageList } from './MessageList';
import { TeamChatMessageInput } from './TeamChatMessageInput';
import type { ChatDetails } from './types';

/** Typing user info */
interface TypingUserInfo {
  userId: string;
  displayName: string;
}

/** Thinking agent info - for complex queries */
interface ThinkingAgentInfo {
  agentId: string;
  agentName: string;
  thinkingLabel: string | null;
}

/** Typing indicator component - shows bouncing dots for users typing */
function TypingIndicator({ typingUsers }: { typingUsers: TypingUserInfo[] }) {
  const first = typingUsers[0];
  const second = typingUsers[1];

  if (!first) return null;

  const text =
    typingUsers.length === 1
      ? `${first.displayName} is typing...`
      : typingUsers.length === 2 && second
        ? `${first.displayName} and ${second.displayName} are typing...`
        : `${first.displayName} and ${typingUsers.length - 1} others are typing...`;

  return (
    <div className="flex items-center gap-2 px-4 py-2 text-muted-foreground text-sm">
      <span className="flex gap-1">
        <span className="animate-bounce" style={{ animationDelay: '0ms' }}>
          •
        </span>
        <span className="animate-bounce" style={{ animationDelay: '150ms' }}>
          •
        </span>
        <span className="animate-bounce" style={{ animationDelay: '300ms' }}>
          •
        </span>
      </span>
      <span>{text}</span>
    </div>
  );
}

/**
 * Thinking indicator component - shows pulsing brain icon for agents processing complex queries.
 * Distinct from typing indicator to show that more substantial work is happening.
 */
function ThinkingIndicator({
  thinkingAgents,
}: {
  thinkingAgents: ThinkingAgentInfo[];
}) {
  if (thinkingAgents.length === 0) return null;

  return (
    <div className="space-y-1 px-4 py-2">
      {thinkingAgents.map((agent) => (
        <div
          key={agent.agentId}
          className="flex items-center gap-2 text-blue-500 text-sm"
        >
          <Brain className="h-4 w-4 animate-pulse" />
          <span className="font-medium">{agent.agentName}</span>
          <span className="text-muted-foreground">
            {agent.thinkingLabel ?? 'Thinking...'}
          </span>
        </div>
      ))}
    </div>
  );
}

interface TeamChatViewProps {
  chatDetails: ChatDetails | null;
  currentUserId: string | undefined;
  authenticated: boolean;
  sseConnected: boolean;
  loading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  messageInput: string;
  sending: boolean;
  sendError: string | null;
  topSentinelRef: React.RefObject<HTMLDivElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  onMessageChange: (value: string) => void;
  onSendMessage: () => void;
  /** Agents available for @mention */
  agents: MentionableAgent[];
  /** Callback when mentioned agents change */
  onMentionsChange?: (mentionedAgentIds: string[]) => void;
  /** Users currently typing */
  typingUsers?: TypingUserInfo[];
  /** Agents currently thinking (processing complex queries) */
  thinkingAgents?: ThinkingAgentInfo[];
  /** Callback to open member list drawer (mobile only) */
  onShowMembers?: () => void;
  /** Callback when messages container is scrolled (for auto-scroll tracking) */
  onScroll?: (container: HTMLDivElement) => void;
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
  messageInput,
  sending,
  sendError,
  topSentinelRef,
  messagesEndRef,
  onMessageChange,
  onSendMessage,
  agents,
  onMentionsChange,
  typingUsers = [],
  thinkingAgents = [],
  onShowMembers,
  onScroll,
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
          <div className="flex items-center gap-3">
            {/* Mobile members button */}
            {onShowMembers && (
              <button
                onClick={onShowMembers}
                className="rounded-lg p-2 transition-colors hover:bg-muted lg:hidden"
                aria-label="Show team members"
              >
                <Users className="h-5 w-5 text-muted-foreground" />
              </button>
            )}
            {/* Connection status */}
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
        </div>

        {/* Header Separator */}
        <div className="px-4">
          <Separator />
        </div>
      </div>

      {/* Messages - Scrollable */}
      <div
        className="relative min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-4 py-3"
        onScroll={(e) => onScroll?.(e.currentTarget)}
      >
        <MessageList
          messages={chatDetails.messages || []}
          participants={chatDetails.participants || []}
          currentUserId={currentUserId}
          loading={loading}
          isLoadingMore={isLoadingMore}
          hasMore={hasMore}
          authenticated={authenticated}
          topSentinelRef={topSentinelRef}
          messagesEndRef={messagesEndRef}
        />
      </div>

      {/* Footer - Fixed */}
      <div className="shrink-0">
        {/* Thinking Indicator - shown when agents are processing complex queries */}
        {thinkingAgents.length > 0 && (
          <ThinkingIndicator thinkingAgents={thinkingAgents} />
        )}

        {/* Typing Indicator - shown when users/agents are typing simple responses */}
        {typingUsers.length > 0 && (
          <TypingIndicator typingUsers={typingUsers} />
        )}

        {/* Feedback Messages */}
        {authenticated && (
          <FeedbackMessages error={sendError} warning={null} success={false} />
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
