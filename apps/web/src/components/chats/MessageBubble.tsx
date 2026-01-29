'use client';

import { cn } from '@babylon/shared';
import Link from 'next/link';
import { Response } from '@/components/chat/Response';
import { Avatar } from '@/components/shared/Avatar';
import type { ChatParticipant, Message } from './types';
import { getProfilePath } from './types';

/**
 * Extracts the displayable content from a message, stripping `<think>...</think>` reasoning blocks.
 * AI models use these tags for internal reasoning which should not be displayed to users.
 *
 * Note: For agent-generated messages (e.g., DMs, team chat responses), think tags are now
 * stripped before storage by executeDirectMessage and scheduleAgentResponse. This function
 * serves as a fallback for older messages or edge cases where tags persist.
 *
 * If the message only contains reasoning with no actual response, returns empty string
 * which will render as a minimal placeholder in the UI.
 */
function getDisplayContent(content: string): string {
  // Remove paired <think>...</think> blocks
  const withoutBlocks = content.replace(/<think>[\s\S]*?<\/think>/gi, '');
  // Also strip orphan tags (unclosed/unmatched)
  return withoutBlocks.replace(/<\/?think>/gi, '').trim();
}

interface MessageBubbleProps {
  message: Message;
  sender: ChatParticipant | undefined;
  isCurrentUser: boolean;
  /** Valid usernames for @mention formatting (case-sensitive) */
  validMentions?: string[];
  /** Whether this message is showing "Thinking..." placeholder state */
  isThinking?: boolean;
}

export function MessageBubble({
  message,
  sender,
  isCurrentUser,
  validMentions,
  isThinking,
}: MessageBubbleProps) {
  const msgDate = new Date(message.createdAt);
  const senderName = sender?.displayName || 'Unknown';

  return (
    <div
      className={cn(
        'flex gap-3',
        isCurrentUser ? 'justify-end' : 'items-start'
      )}
    >
      {!isCurrentUser && sender && (
        <Link
          href={getProfilePath(sender)}
          className="shrink-0 transition-opacity hover:opacity-80"
        >
          <Avatar
            id={sender.id}
            name={senderName}
            type="user"
            size="md"
            imageUrl={sender.profileImageUrl}
          />
        </Link>
      )}
      {!isCurrentUser && !sender && (
        <Avatar id={message.senderId} name={senderName} type="user" size="md" />
      )}
      <div
        className={cn(
          'flex min-w-0 max-w-[80%] flex-col',
          isCurrentUser ? 'items-end' : 'items-start'
        )}
      >
        <div className="mb-1 flex flex-wrap items-center gap-2">
          {!isCurrentUser && sender && (
            <Link
              href={getProfilePath(sender)}
              className="font-bold text-foreground text-sm transition-colors hover:text-primary"
            >
              {senderName}
            </Link>
          )}
          {!isCurrentUser && !sender && (
            <span className="font-bold text-foreground text-sm">
              {senderName}
            </span>
          )}
          {!isCurrentUser && <span className="text-muted-foreground">·</span>}
          <span className="text-muted-foreground text-xs">
            {msgDate.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })}{' '}
            at{' '}
            {msgDate.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
        <div
          className={cn(
            'message-bubble max-w-full overflow-x-auto break-words rounded-2xl px-4 py-3 text-sm',
            isCurrentUser
              ? 'rounded-tr-sm bg-primary/20'
              : 'rounded-tl-sm bg-sidebar-accent/50'
          )}
        >
          {isThinking ? (
            <div className="flex items-center gap-1 text-muted-foreground">
              <span
                className="inline-block h-2 w-2 animate-bounce rounded-full bg-current"
                style={{ animationDelay: '0ms' }}
              />
              <span
                className="inline-block h-2 w-2 animate-bounce rounded-full bg-current"
                style={{ animationDelay: '150ms' }}
              />
              <span
                className="inline-block h-2 w-2 animate-bounce rounded-full bg-current"
                style={{ animationDelay: '300ms' }}
              />
            </div>
          ) : (
            <Response className="text-foreground" validMentions={validMentions}>
              {getDisplayContent(message.content)}
            </Response>
          )}
        </div>
      </div>
    </div>
  );
}
