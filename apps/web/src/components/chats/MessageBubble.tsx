'use client';

import { COORDINATOR_SENDER_ID, cn, type MessageTag } from '@babylon/shared';
import { ChevronRight, Plus } from 'lucide-react';
import Link from 'next/link';
import { Response } from '@/components/chat/Response';
import { Avatar } from '@/components/shared/Avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ChatParticipant, Message } from './types';
import { getProfilePath } from './types';

const COMMON_REACTIONS = ['👍', '❤️', '😂', '🔥', '😮', '😢', '🙏'] as const;

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
  density?: 'default' | 'compact';
  /** Callback when a tag is clicked - opens sidebar with tag data */
  onTagClick?: (tag: MessageTag, messageId: string) => void;
  /** Toggle a reaction emoji on this message (current user). */
  onToggleReaction?: (
    messageId: string,
    emoji: string,
    currentlyReactedByMe: boolean
  ) => void;
}

export function MessageBubble({
  message,
  sender,
  isCurrentUser,
  validMentions,
  isThinking,
  density = 'default',
  onTagClick,
  onToggleReaction,
}: MessageBubbleProps) {
  const msgDate = new Date(message.createdAt);
  const senderName = sender?.displayName || 'Unknown';
  const compact = density === 'compact';
  // Coordinator (Agent Commander) should not link to a profile page
  const isCoordinator = sender?.id === COORDINATOR_SENDER_ID;

  return (
    <div
      className={cn(
        'flex',
        compact ? 'gap-2' : 'gap-3',
        isCurrentUser ? 'justify-end' : 'items-start'
      )}
    >
      {!isCurrentUser && sender && !isCoordinator && (
        <Link
          href={getProfilePath(sender)}
          className="shrink-0 transition-opacity hover:opacity-80"
        >
          <Avatar
            id={sender.id}
            name={senderName}
            type="user"
            size={compact ? 'sm' : 'md'}
            imageUrl={sender.profileImageUrl}
          />
        </Link>
      )}
      {!isCurrentUser && sender && isCoordinator && (
        <Avatar
          id={sender.id}
          name={senderName}
          type="user"
          size={compact ? 'sm' : 'md'}
          imageUrl={sender.profileImageUrl}
        />
      )}
      {!isCurrentUser && !sender && (
        <Avatar
          id={message.senderId}
          name={senderName}
          type="user"
          size={compact ? 'sm' : 'md'}
        />
      )}
      <div
        className={cn(
          'flex min-w-0 flex-col',
          isCurrentUser ? 'items-end' : 'items-start'
        )}
        style={{ maxWidth: 'min(80%, 48rem)' }}
      >
        <div className="mb-1 flex flex-wrap items-center gap-2">
          {!isCurrentUser && sender && !isCoordinator && (
            <Link
              href={getProfilePath(sender)}
              className={cn(
                'font-bold text-foreground transition-colors hover:text-primary',
                compact ? 'text-sm md:text-xs' : 'text-sm'
              )}
            >
              {senderName}
            </Link>
          )}
          {!isCurrentUser && sender && isCoordinator && (
            <span
              className={cn(
                'font-bold text-foreground',
                compact ? 'text-sm md:text-xs' : 'text-sm'
              )}
            >
              {senderName}
            </span>
          )}
          {!isCurrentUser && !sender && (
            <span
              className={cn(
                'font-bold text-foreground',
                compact ? 'text-sm md:text-xs' : 'text-sm'
              )}
            >
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
            'message-bubble max-w-full overflow-x-auto break-words rounded-2xl',
            compact ? 'px-3 py-2 text-sm md:text-xs' : 'px-4 py-3 text-sm',
            isCurrentUser
              ? 'rounded-tr-sm bg-primary/20'
              : 'rounded-tl-sm bg-sidebar-accent/50'
          )}
        >
          {isThinking ? (
            <div
              className="flex items-center gap-1 text-muted-foreground"
              role="status"
              aria-live="polite"
            >
              <span className="sr-only">Agent is thinking</span>
              <span
                className="inline-block h-2 w-2 animate-bounce rounded-full bg-current"
                style={{ animationDelay: '0ms' }}
                aria-hidden="true"
              />
              <span
                className="inline-block h-2 w-2 animate-bounce rounded-full bg-current"
                style={{ animationDelay: '150ms' }}
                aria-hidden="true"
              />
              <span
                className="inline-block h-2 w-2 animate-bounce rounded-full bg-current"
                style={{ animationDelay: '300ms' }}
                aria-hidden="true"
              />
            </div>
          ) : (
            <Response className="text-foreground" validMentions={validMentions}>
              {getDisplayContent(message.content)}
            </Response>
          )}
        </div>

        {/* Reactions */}
        {!isThinking && (message.reactions?.length || onToggleReaction) && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {(message.reactions ?? []).map((r) => (
              <button
                key={r.emoji}
                type="button"
                onClick={() =>
                  onToggleReaction?.(message.id, r.emoji, r.reactedByMe)
                }
                disabled={!onToggleReaction}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs transition-colors',
                  onToggleReaction ? 'hover:bg-muted' : 'cursor-default',
                  r.reactedByMe
                    ? 'border-primary/30 bg-primary/10 text-primary'
                    : 'border-border bg-background text-foreground'
                )}
                aria-label={`React ${r.emoji}`}
              >
                <span aria-hidden="true">{r.emoji}</span>
                <span className="font-medium tabular-nums">{r.count}</span>
              </button>
            ))}

            {onToggleReaction && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-1 text-muted-foreground text-xs transition-colors hover:bg-muted hover:text-foreground"
                    aria-label="Add reaction"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>React</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align={isCurrentUser ? 'end' : 'start'}>
                  {COMMON_REACTIONS.map((emoji) => {
                    const existing = (message.reactions ?? []).find(
                      (r) => r.emoji === emoji
                    );
                    const reacted = existing?.reactedByMe ?? false;
                    return (
                      <DropdownMenuItem
                        key={emoji}
                        onClick={() =>
                          onToggleReaction(message.id, emoji, reacted)
                        }
                      >
                        <span className="mr-2" aria-hidden="true">
                          {emoji}
                        </span>
                        <span>{reacted ? 'Remove' : 'React'}</span>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}

        {/* Action Tags - Pill-style chips (outside message bubble) */}
        {!isThinking &&
          message.metadata?.tags &&
          message.metadata.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {message.metadata.tags.map((tag, i) => (
                <button
                  key={`${tag.type}-${tag.entityId ?? i}`}
                  type="button"
                  onClick={() => onTagClick?.(tag, message.id)}
                  data-tag-entity={tag.entityId}
                  className="group flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 py-1 pr-2 pl-3 font-medium text-primary text-xs transition-all hover:border-primary/40 hover:bg-primary/10"
                >
                  <span>{tag.label}</span>
                  <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </button>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}
