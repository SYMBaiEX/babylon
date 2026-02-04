'use client';

import {
  COORDINATOR_INFO,
  COORDINATOR_SENDER_ID,
  type MessageTag,
} from '@babylon/shared';
import { Loader2, MessageCircle } from 'lucide-react';
import React, { useMemo } from 'react';
import { Skeleton } from '@/components/shared/Skeleton';
import { MessageBubble } from './MessageBubble';
import { SystemMessage } from './SystemMessage';
import type { ChatParticipant, Message, MessageType } from './types';
import { MessageTypeEnum } from './types';

/**
 * Determines the message type for rendering.
 * Checks senderId first (for coordinator detection), then falls back to type field.
 *
 * Note: Coordinator messages are stored with type='user' in DB (no coordinator enum),
 * so we must check senderId first to properly identify them.
 */
function getMessageType(message: Message): MessageType {
  // Check for coordinator messages by senderId first
  // (DB doesn't have 'coordinator' type, so they're stored as 'user')
  if (message.senderId === COORDINATOR_SENDER_ID) {
    return MessageTypeEnum.COORDINATOR;
  }
  // Use explicit type field if available
  if (message.type) {
    return message.type;
  }
  return MessageTypeEnum.USER;
}

interface MessageListProps {
  messages: Message[];
  participants: ChatParticipant[];
  currentUserId: string | undefined;
  loading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  authenticated: boolean;
  topSentinelRef: React.RefObject<HTMLDivElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  density?: 'default' | 'compact';
  /** Callback when a message tag is clicked */
  onTagClick?: (tag: MessageTag, messageId: string) => void;
}

export function MessageList({
  messages,
  participants,
  currentUserId,
  loading,
  isLoadingMore,
  hasMore,
  authenticated,
  topSentinelRef,
  messagesEndRef,
  density = 'default',
  onTagClick,
}: MessageListProps) {
  // Extract usernames from participants for @mention formatting
  // Only usernames that exist in the chat will be formatted as mentions
  const validMentions = useMemo(() => {
    return participants
      .map((p) => p.username)
      .filter((username): username is string => !!username);
  }, [participants]);

  if (loading) {
    return (
      <>
        <div className="flex h-full items-center justify-center">
          <div className="w-full max-w-md space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </div>
        <div ref={messagesEndRef} />
      </>
    );
  }

  return (
    <>
      {/* Gradient overlay to hint more messages */}
      {hasMore && (
        <div className="pointer-events-none absolute top-0 right-0 left-0 z-10 h-8 bg-gradient-to-b from-background via-background/90 to-transparent" />
      )}

      {/* Sentinel for infinite scroll */}
      <div ref={topSentinelRef} className="h-1 w-full" />

      {/* Loading more messages indicator */}
      {isLoadingMore && (
        <div className="sticky top-2 z-20 flex justify-center">
          <div className="flex items-center gap-2 rounded-full bg-background/85 px-3 py-1 font-medium text-muted-foreground text-xs shadow-sm backdrop-blur">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span>Loading previous messages…</span>
          </div>
        </div>
      )}

      {/* Messages */}
      {messages.map((msg) => {
        const messageType = getMessageType(msg);
        // Use stableKey if available to prevent flash when optimistic messages are confirmed
        const key = msg.stableKey || msg.id;

        switch (messageType) {
          case MessageTypeEnum.SYSTEM:
            return <SystemMessage key={key} message={msg} />;

          case MessageTypeEnum.COORDINATOR: {
            // Coordinator messages: show with bubble using coordinator info
            const coordinatorSender: ChatParticipant = {
              id: COORDINATOR_INFO.id,
              displayName: COORDINATOR_INFO.displayName,
              username: COORDINATOR_INFO.username,
              profileImageUrl: COORDINATOR_INFO.profileImageUrl,
            };
            return (
              <MessageBubble
                key={key}
                message={msg}
                sender={coordinatorSender}
                isCurrentUser={false}
                validMentions={validMentions}
                isThinking={msg.isThinking}
                density={density}
                onTagClick={onTagClick}
              />
            );
          }

          case MessageTypeEnum.USER:
          default: {
            const sender = participants.find((p) => p.id === msg.senderId);
            const isCurrentUser = currentUserId
              ? msg.senderId === currentUserId
              : false;

            return (
              <MessageBubble
                key={key}
                message={msg}
                sender={sender}
                isCurrentUser={isCurrentUser}
                validMentions={validMentions}
                isThinking={msg.isThinking}
                density={density}
                onTagClick={onTagClick}
              />
            );
          }
        }
      })}

      {/* Empty state */}
      {messages.length === 0 && (
        <div className="flex h-full items-center justify-center">
          <div className="max-w-md p-8 text-center text-muted-foreground">
            <MessageCircle className="mx-auto mb-4 h-12 w-12 opacity-50" />
            <p className="mb-2 text-foreground">No messages yet</p>
            {authenticated && (
              <p className="text-muted-foreground text-xs">
                Be the first to send a message!
              </p>
            )}
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
    </>
  );
}
