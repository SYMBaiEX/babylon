'use client';

import { cn } from '@babylon/shared';
import { Send } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { LoginButton } from '@/components/auth/LoginButton';
import { Skeleton } from '@/components/shared/Skeleton';
import {
  MentionAutocomplete,
  type MentionableAgent,
  useMentionAutocomplete,
} from './MentionAutocomplete';

const MAX_TEXTAREA_HEIGHT = 160;

/**
 * Check if @ is at a valid mention position (start of word).
 * Returns true if @ is at position 0 OR after whitespace.
 * This prevents dropdown for emails like tcm390@nyu.edu.
 */
function isAtValidMentionPosition(text: string, atIndex: number): boolean {
  if (atIndex === 0) return true;
  const charBefore = text[atIndex - 1];
  return /\s/.test(charBefore || '');
}

/**
 * Renders text with @mentions highlighted as styled chips.
 * Only highlights mentions that are in the validUsernames set.
 */
function HighlightedText({
  text,
  validUsernames,
}: {
  text: string;
  validUsernames: Set<string>;
}) {
  const parts: React.ReactNode[] = [];
  const mentionRegex = /(@[A-Za-z0-9_.-]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = null;

  while ((match = mentionRegex.exec(text)) !== null) {
    // Add text before the mention
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const mention = match[0];
    const handle = mention.slice(1).toLowerCase();

    // Only highlight if it's a valid mention handle
    if (validUsernames.has(handle)) {
      parts.push(
        <mark
          key={`${match.index}-${mention}`}
          className="rounded-sm bg-primary/20 text-primary"
          style={{ padding: 0, margin: 0 }}
        >
          {mention}
        </mark>
      );
    } else {
      parts.push(mention);
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  // Add trailing space to match textarea behavior
  return (
    <>
      {parts}
      {'\u00A0'}
    </>
  );
}

export interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  sending: boolean;
  authenticated: boolean;
  density?: 'default' | 'compact';
  /** Additional disabled condition (e.g., insufficient points for agent chat) */
  disabled?: boolean;
  /** Custom placeholder text */
  placeholder?: string;
  /** Mentionable members - when provided, enables @mention autocomplete */
  mentionableMembers?: MentionableAgent[];
}

/**
 * Chat message input with optional @mention autocomplete.
 * When `mentionableMembers` is provided, enables mention dropdown
 * that only opens at word boundaries (not for emails).
 * Also highlights valid @mentions in the input with styled chips.
 */
export function MessageInput({
  value,
  onChange,
  onSend,
  sending,
  authenticated,
  density = 'default',
  disabled = false,
  placeholder,
  mentionableMembers,
}: MessageInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Mention support is enabled when mentionableMembers is provided and non-empty
  const mentionsEnabled = mentionableMembers && mentionableMembers.length > 0;

  const {
    isOpen,
    position,
    selectedIndex,
    mentionStartIndex,
    filteredAgents,
    openAutocomplete,
    closeAutocomplete,
    updateQuery,
    handleKeyDown: autocompleteKeyDown,
    getSelectedAgent,
    setSelectedIndex,
  } = useMentionAutocomplete(mentionableMembers || []);

  // Set of valid mention handles for highlighting (lowercase)
  const validMentionHandles = useMemo(() => {
    if (!mentionableMembers) return new Set<string>();
    const set = new Set<string>();
    for (const member of mentionableMembers) {
      if (member.username) {
        set.add(member.username.toLowerCase());
      }
    }
    return set;
  }, [mentionableMembers]);

  // Reference for the highlight overlay to sync scroll
  const highlightRef = useRef<HTMLDivElement>(null);

  // Resize textarea based on content
  const resizeTextarea = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height =
        Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT) + 'px';
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: value triggers resize
  useEffect(() => {
    resizeTextarea();
  }, [value, resizeTextarea]);

  // Sync scroll position between textarea and highlight overlay
  const handleScroll = useCallback(() => {
    if (textareaRef.current && highlightRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop;
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  // Handle selecting a member from autocomplete - inserts plain @username
  const handleSelectMember = useCallback(
    (member: MentionableAgent) => {
      if (mentionStartIndex < 0) return;

      const textarea = textareaRef.current;
      if (!textarea) return;

      // Use username, fallback to displayName or id
      const mentionText =
        member.username || member.displayName || `member-${member.id}`;
      const displayText = `@${mentionText}`;

      const beforeMention = value.slice(0, mentionStartIndex);
      const afterQuery = value.slice(textarea.selectionStart);
      const newValue = `${beforeMention}${displayText} ${afterQuery}`;

      onChange(newValue);
      closeAutocomplete();

      // Set cursor after the mention
      const newCursorPos = mentionStartIndex + displayText.length + 1;
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      }, 0);
    },
    [value, mentionStartIndex, onChange, closeAutocomplete]
  );

  // Handle text input changes (with mention detection)
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      const cursorPos = e.target.selectionStart;

      onChange(newValue);

      // Only process mentions if enabled
      if (!mentionsEnabled) return;

      const textBeforeCursor = newValue.slice(0, cursorPos);
      const atIndex = textBeforeCursor.lastIndexOf('@');

      if (atIndex >= 0) {
        // Check if @ is at a valid position (start of word)
        if (!isAtValidMentionPosition(newValue, atIndex)) {
          if (isOpen) closeAutocomplete();
          return;
        }

        const textAfterAt = textBeforeCursor.slice(atIndex + 1);
        const hasSpace = /\s/.test(textAfterAt);

        if (!hasSpace) {
          const searchQuery = textAfterAt;

          if (!isOpen) {
            const textarea = textareaRef.current;
            if (textarea) {
              const containerRect =
                containerRef.current?.getBoundingClientRect();
              const bottom = containerRect
                ? containerRect.height + 8
                : textarea.getBoundingClientRect().height + 8;
              openAutocomplete(atIndex, { bottom, left: 0 });
            }
          }

          updateQuery(searchQuery);
        } else if (isOpen) {
          closeAutocomplete();
        }
      } else if (isOpen) {
        closeAutocomplete();
      }
    },
    [
      onChange,
      mentionsEnabled,
      isOpen,
      openAutocomplete,
      closeAutocomplete,
      updateQuery,
    ]
  );

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (mentionsEnabled) {
        // Let autocomplete handle navigation first
        const handled = autocompleteKeyDown(e);

        if (handled) {
          // If Enter/Tab was pressed and we have a selection, select the member
          if (e.key === 'Enter' || e.key === 'Tab') {
            const member = getSelectedAgent();
            if (member) {
              handleSelectMember(member);
            }
          }
          return;
        }
      }

      // Normal Enter to send (when autocomplete is closed)
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSend();
      }
      // Shift+Enter will insert a newline (default behavior)
    },
    [
      mentionsEnabled,
      autocompleteKeyDown,
      getSelectedAgent,
      handleSelectMember,
      onSend,
    ]
  );

  // Determine placeholder text
  const placeholderText = placeholder || 'Type a message...';
  const compact = density === 'compact';

  if (!authenticated) {
    return (
      <div className={cn('bg-background', compact ? 'px-3 py-2' : 'px-4 py-3')}>
        <div className="text-center">
          <p className="mb-3 text-muted-foreground text-sm">
            Log in to send messages
          </p>
          <LoginButton />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative bg-background',
        compact ? 'px-3 py-2' : 'px-4 py-3'
      )}
    >
      {/* Mention autocomplete dropdown */}
      {mentionsEnabled && (
        <MentionAutocomplete
          agents={filteredAgents}
          isOpen={isOpen}
          position={position}
          selectedIndex={selectedIndex}
          onSelect={handleSelectMember}
          onIndexChange={setSelectedIndex}
          onClose={closeAutocomplete}
        />
      )}

      {/* Input container with send button inside */}
      <div className="relative">
        {/* Textarea with optional highlight overlay for mentions */}
        {mentionsEnabled ? (
          <>
            {/* Highlight overlay - renders mentions with styling */}
            <div
              ref={highlightRef}
              className={cn(
                'pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words rounded-xl pr-14',
                compact
                  ? 'px-3 py-2.5 text-sm md:text-xs'
                  : 'px-4 py-4 text-sm',
                'text-foreground'
              )}
              aria-hidden="true"
            >
              <HighlightedText
                text={value}
                validUsernames={validMentionHandles}
              />
            </div>
            {/* Actual textarea - text is transparent, caret visible */}
            <textarea
              ref={textareaRef}
              value={value}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onScroll={handleScroll}
              aria-label="Message input, use @ to mention members"
              placeholder={placeholderText}
              disabled={sending || disabled}
              rows={1}
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              className={cn(
                'relative z-10 max-h-40 w-full resize-none overflow-y-auto rounded-xl pr-14',
                compact
                  ? 'min-h-[48px] px-3 py-2.5 text-sm md:text-xs'
                  : 'min-h-[56px] px-4 py-4 text-sm',
                'message-input bg-sidebar-accent/50',
                'text-transparent caret-foreground placeholder:text-muted-foreground',
                'outline-none focus:ring-2 focus:ring-primary/50',
                'disabled:cursor-not-allowed disabled:opacity-50'
              )}
            />
          </>
        ) : (
          /* Simple textarea without highlight overlay */
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholderText}
            disabled={sending || disabled}
            rows={1}
            className={cn(
              'max-h-40 w-full resize-none overflow-y-auto rounded-xl pr-14',
              compact
                ? 'min-h-[48px] px-3 py-2.5 text-sm md:text-xs'
                : 'min-h-[56px] px-4 py-4 text-sm',
              'message-input bg-sidebar-accent/50',
              'text-foreground placeholder:text-muted-foreground',
              'outline-none focus:ring-2 focus:ring-primary/50',
              'disabled:cursor-not-allowed disabled:opacity-50'
            )}
          />
        )}

        {/* Send button - positioned inside input, vertically centered */}
        <button
          type="button"
          onClick={onSend}
          disabled={!value.trim() || sending || disabled}
          className={cn(
            '-translate-y-1/2 absolute top-1/2 right-3 z-20 flex h-8 w-8 items-center justify-center rounded-lg',
            'text-primary transition-all duration-200',
            'hover:bg-muted',
            'disabled:cursor-not-allowed disabled:text-muted-foreground disabled:opacity-50'
          )}
        >
          {sending ? (
            <Skeleton className="h-5 w-5 rounded" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </button>
      </div>
    </div>
  );
}
