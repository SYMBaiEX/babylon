'use client';

import type { MessageType } from '@babylon/db';
import { cn } from '@babylon/shared';
import { Loader2, MessageCircle } from 'lucide-react';
import React from 'react';
import { Skeleton } from '@/components/shared/Skeleton';
import { MessageBubble } from './MessageBubble';
import { SystemMessage } from './SystemMessage';
import type { ChatParticipant, Message } from './types';
import { MessageTypeEnum } from './types';

/**
 * Determines the message type for rendering.
 * Uses message.type field if available (new messages), falls back to default user type.
 */
function getMessageType(message: Message): MessageType {
  // Prefer explicit type field (new messages after migration)
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
  pullDistance: number;
  authenticated: boolean;
  topSentinelRef: React.RefObject<HTMLDivElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

export function MessageList({
  messages,
  participants,
  currentUserId,
  loading,
  isLoadingMore,
  hasMore,
  pullDistance,
  authenticated,
  topSentinelRef,
  messagesEndRef,
}: MessageListProps) {
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

      {/* Pull-to-refresh indicator */}
      {pullDistance > 0 && (
        <div
          className="absolute top-0 right-0 left-0 flex items-center justify-center py-2 transition-opacity"
          style={{ opacity: Math.min(pullDistance / 80, 1) }}
        >
          <Loader2
            className={cn(
              'h-6 w-6 text-primary',
              pullDistance > 80 ? 'animate-spin' : ''
            )}
          />
        </div>
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

        switch (messageType) {
          case MessageTypeEnum.SYSTEM:
            return <SystemMessage key={msg.id} message={msg} />;

          case MessageTypeEnum.USER:
          default: {
            const sender = participants.find((p) => p.id === msg.senderId);
            const isCurrentUser = currentUserId
              ? msg.senderId === currentUserId
              : false;

            return (
              <MessageBubble
                key={msg.id}
                message={msg}
                sender={sender}
                isCurrentUser={isCurrentUser}
              />
            );
          }
        }
      })}

      {/* Empty state */}
      {messages.length === 0 && (
        <div className="flex h-full items-center justify-center">
          <div className="max-w-md p-8 text-center text-muted-foreground">
            <MessageCircle className="mx-auto mb-3 h-12 w-12 opacity-50" />
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
