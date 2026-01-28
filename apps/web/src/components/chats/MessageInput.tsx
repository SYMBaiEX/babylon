'use client';

import { cn } from '@babylon/shared';
import { Send } from 'lucide-react';
import React, { useCallback, useEffect, useRef } from 'react';
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

export interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  sending: boolean;
  authenticated: boolean;
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

  if (!authenticated) {
    return (
      <div className="bg-background px-4 py-3">
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
    <div ref={containerRef} className="relative bg-background px-4 py-3">
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
        {/* Simple textarea - no highlight overlay needed, mentions work without it */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          aria-label={
            mentionsEnabled
              ? 'Message input, use @ to mention members'
              : undefined
          }
          placeholder={placeholderText}
          disabled={sending || disabled}
          rows={1}
          spellCheck={mentionsEnabled ? false : undefined}
          autoComplete={mentionsEnabled ? 'off' : undefined}
          autoCorrect={mentionsEnabled ? 'off' : undefined}
          autoCapitalize={mentionsEnabled ? 'off' : undefined}
          className={cn(
            'max-h-40 min-h-[56px] w-full resize-none overflow-y-auto rounded-xl px-4 py-4 pr-14 text-sm',
            'message-input bg-sidebar-accent/50',
            'text-foreground placeholder:text-muted-foreground',
            'outline-none focus:ring-2 focus:ring-primary/50',
            'disabled:cursor-not-allowed disabled:opacity-50'
          )}
        />

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
