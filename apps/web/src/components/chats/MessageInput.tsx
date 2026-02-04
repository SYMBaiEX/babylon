'use client';

import { cn } from '@babylon/shared';
import { ArrowUp } from 'lucide-react';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { LoginButton } from '@/components/auth/LoginButton';
import { Skeleton } from '@/components/shared/Skeleton';
import {
  MentionAutocomplete,
  type MentionableAgent,
  useMentionAutocomplete,
} from './MentionAutocomplete';

const MAX_TEXTAREA_HEIGHT = 160;

/** Represents a mention range in the text */
interface MentionRange {
  start: number;
  end: number;
  text: string;
}

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
 * Find all valid mention ranges in the text.
 * Only returns mentions that exist in validUsernames set AND are at valid
 * mention positions (start of text or after whitespace).
 */
function findMentionRanges(
  text: string,
  validUsernames: Set<string>
): MentionRange[] {
  const ranges: MentionRange[] = [];
  const mentionRegex = /(@[A-Za-z0-9_.-]+)/g;
  let match: RegExpExecArray | null = null;

  while ((match = mentionRegex.exec(text)) !== null) {
    const mention = match[0];
    const handle = mention.slice(1).toLowerCase();

    // Only include valid mentions at valid positions (not in emails, etc.)
    if (
      validUsernames.has(handle) &&
      isAtValidMentionPosition(text, match.index)
    ) {
      ranges.push({
        start: match.index,
        end: match.index + mention.length,
        text: mention,
      });
    }
  }

  return ranges;
}

/**
 * Find if cursor is inside a mention.
 * Returns the mention range if cursor is inside one, null otherwise.
 */
function getMentionAtCursor(
  cursorPos: number,
  mentionRanges: MentionRange[]
): MentionRange | null {
  for (const range of mentionRanges) {
    // Cursor is inside the mention (not at boundaries)
    if (cursorPos > range.start && cursorPos < range.end) {
      return range;
    }
  }
  return null;
}

/**
 * Find the mention that ends just before the cursor (for backspace).
 */
function getMentionBeforeCursor(
  cursorPos: number,
  mentionRanges: MentionRange[]
): MentionRange | null {
  for (const range of mentionRanges) {
    if (range.end === cursorPos) {
      return range;
    }
  }
  return null;
}

/**
 * Find the mention that starts just after the cursor (for delete key).
 */
function getMentionAfterCursor(
  cursorPos: number,
  mentionRanges: MentionRange[]
): MentionRange | null {
  for (const range of mentionRanges) {
    if (range.start === cursorPos) {
      return range;
    }
  }
  return null;
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

  // Calculate mention ranges for atomic mention behavior
  const mentionRanges = useMemo(
    () => findMentionRanges(value, validMentionHandles),
    [value, validMentionHandles]
  );

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

  // Handle selection/click to snap cursor out of mentions
  const handleSelect = useCallback(() => {
    if (!mentionsEnabled || mentionRanges.length === 0) return;

    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;

    // Only handle single cursor position, not text selection
    if (cursorPos !== selectionEnd) return;

    const mentionAtCursor = getMentionAtCursor(cursorPos, mentionRanges);
    if (mentionAtCursor) {
      // Snap cursor to the end of the mention
      setTimeout(() => {
        textarea.setSelectionRange(mentionAtCursor.end, mentionAtCursor.end);
      }, 0);
    }
  }, [mentionsEnabled, mentionRanges]);

  // Handle keyboard navigation with atomic mention behavior
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

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

        const cursorPos = textarea.selectionStart;
        const selectionEnd = textarea.selectionEnd;
        const hasSelection = cursorPos !== selectionEnd;

        // Arrow key navigation - skip over mentions
        if (
          !hasSelection &&
          (e.key === 'ArrowLeft' || e.key === 'ArrowRight')
        ) {
          if (e.key === 'ArrowLeft' && cursorPos > 0) {
            // Check if we're at the end of a mention
            const mentionBefore = getMentionBeforeCursor(
              cursorPos,
              mentionRanges
            );
            if (mentionBefore) {
              e.preventDefault();
              textarea.setSelectionRange(
                mentionBefore.start,
                mentionBefore.start
              );
              return;
            }
          } else if (e.key === 'ArrowRight' && cursorPos < value.length) {
            // Check if we're at the start of a mention
            const mentionAfter = getMentionAfterCursor(
              cursorPos,
              mentionRanges
            );
            if (mentionAfter) {
              e.preventDefault();
              textarea.setSelectionRange(mentionAfter.end, mentionAfter.end);
              return;
            }
          }
        }

        // Backspace - delete entire mention if cursor is right after one
        if (e.key === 'Backspace' && !hasSelection && cursorPos > 0) {
          const mentionBefore = getMentionBeforeCursor(
            cursorPos,
            mentionRanges
          );
          if (mentionBefore) {
            e.preventDefault();
            const newValue =
              value.slice(0, mentionBefore.start) + value.slice(cursorPos);
            onChange(newValue);
            // Close autocomplete if open
            if (isOpen) closeAutocomplete();
            setTimeout(() => {
              textarea.setSelectionRange(
                mentionBefore.start,
                mentionBefore.start
              );
            }, 0);
            return;
          }
        }

        // Delete key - delete entire mention if cursor is right before one
        if (e.key === 'Delete' && !hasSelection && cursorPos < value.length) {
          const mentionAfter = getMentionAfterCursor(cursorPos, mentionRanges);
          if (mentionAfter) {
            e.preventDefault();
            const newValue =
              value.slice(0, cursorPos) + value.slice(mentionAfter.end);
            onChange(newValue);
            // Close autocomplete if open
            if (isOpen) closeAutocomplete();
            setTimeout(() => {
              textarea.setSelectionRange(cursorPos, cursorPos);
            }, 0);
            return;
          }
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
      mentionRanges,
      value,
      isOpen,
      autocompleteKeyDown,
      closeAutocomplete,
      getSelectedAgent,
      handleSelectMember,
      onChange,
      onSend,
    ]
  );

  // Determine placeholder text
  const placeholderText = placeholder || 'Type a message...';
  const compact = density === 'compact';

  const [isFocused, setIsFocused] = useState(false);
  const hasContent = value.trim().length > 0;
  const canSend = hasContent && !sending && !disabled;

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
    <div ref={containerRef} className={cn('relative', compact ? 'p-3' : 'p-4')}>
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

      {/* Composer shell */}
      <div
        className={cn(
          'flex items-center gap-2 rounded-xl border border-border px-3 py-2 transition-shadow duration-200',
          'focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/30',
          isFocused && 'shadow-sm',
          (sending || disabled) && 'opacity-60'
        )}
      >
        {/* Input area */}
        <div className="relative min-w-0 flex-1">
          {mentionsEnabled ? (
            <>
              {/* Highlight overlay */}
              <div
                ref={highlightRef}
                className={cn(
                  'pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words py-[5px]',
                  compact
                    ? 'text-sm leading-[22px] md:text-xs'
                    : 'text-sm leading-[22px]',
                  'text-foreground'
                )}
                aria-hidden="true"
              >
                <HighlightedText
                  text={value}
                  validUsernames={validMentionHandles}
                />
              </div>
              <textarea
                ref={textareaRef}
                value={value}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onScroll={handleScroll}
                onSelect={handleSelect}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                aria-label="Message input, use @ to mention members"
                placeholder={placeholderText}
                disabled={sending || disabled}
                rows={1}
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                className={cn(
                  'relative z-10 max-h-40 w-full resize-none overflow-y-auto bg-transparent py-[5px]',
                  compact
                    ? 'min-h-[32px] text-sm leading-[22px] md:text-xs'
                    : 'min-h-[32px] text-sm leading-[22px]',
                  'text-transparent caret-foreground placeholder:text-muted-foreground/40',
                  'outline-none',
                  'disabled:cursor-not-allowed'
                )}
              />
            </>
          ) : (
            <textarea
              ref={textareaRef}
              value={value}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={placeholderText}
              disabled={sending || disabled}
              rows={1}
              className={cn(
                'max-h-40 w-full resize-none overflow-y-auto bg-transparent py-[5px]',
                compact
                  ? 'min-h-[32px] text-sm leading-[22px] md:text-xs'
                  : 'min-h-[32px] text-sm leading-[22px]',
                'text-foreground placeholder:text-muted-foreground/40',
                'outline-none',
                'disabled:cursor-not-allowed'
              )}
            />
          )}
        </div>

        {/* Send button */}
        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all duration-150',
            canSend
              ? 'bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95'
              : 'text-muted-foreground'
          )}
        >
          {sending ? (
            <Skeleton className="h-4 w-4 rounded" />
          ) : (
            <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
          )}
        </button>
      </div>
    </div>
  );
}
