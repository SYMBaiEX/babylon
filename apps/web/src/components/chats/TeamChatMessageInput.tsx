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

interface TeamChatMessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  sending: boolean;
  authenticated: boolean;
  disabled?: boolean;
  /** Agents available for @mention */
  agents: MentionableAgent[];
  /** Callback when mentioned agents change */
  onMentionsChange?: (mentionedAgentIds: string[]) => void;
}

/**
 * Enhanced message input with @mention autocomplete for team chat (Command Center)
 */
export function TeamChatMessageInput({
  value,
  onChange,
  onSend,
  sending,
  authenticated,
  disabled = false,
  agents,
  onMentionsChange,
}: TeamChatMessageInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    isOpen,
    query,
    position,
    selectedIndex,
    mentionStartIndex,
    openAutocomplete,
    closeAutocomplete,
    updateQuery,
    handleKeyDown: autocompleteKeyDown,
    getSelectedAgent,
    setSelectedIndex,
  } = useMentionAutocomplete(agents);

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

  // Extract mentioned agent IDs from message content
  useEffect(() => {
    if (!onMentionsChange) return;

    const mentionRegex = /@(\w+)/g;
    const mentions: string[] = [];
    let match: RegExpExecArray | null = null;

    while ((match = mentionRegex.exec(value)) !== null) {
      const matchedUsername = match[1];
      const agent = agents.find(
        (a) => a.username?.toLowerCase() === matchedUsername?.toLowerCase()
      );
      if (agent) {
        mentions.push(agent.id);
      }
    }

    onMentionsChange([...new Set(mentions)]);
  }, [value, agents, onMentionsChange]);

  // Handle selecting an agent from autocomplete
  const handleSelectAgent = useCallback(
    (agent: MentionableAgent) => {
      if (mentionStartIndex < 0) return;

      const textarea = textareaRef.current;
      if (!textarea) return;

      // Get the mention text to use (prefer username, fallback to displayName)
      const mentionText = agent.username || agent.displayName || 'agent';

      // Replace the @query with @username
      const beforeMention = value.slice(0, mentionStartIndex);
      const afterQuery = value.slice(textarea.selectionStart);
      const newValue = `${beforeMention}@${mentionText} ${afterQuery}`;

      onChange(newValue);
      closeAutocomplete();

      // Set cursor position after the mention
      const newCursorPos = mentionStartIndex + mentionText.length + 2; // +2 for @ and space
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      }, 0);
    },
    [value, mentionStartIndex, onChange, closeAutocomplete]
  );

  // Handle text input changes
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      const cursorPos = e.target.selectionStart;

      onChange(newValue);

      // Check if we should open/update autocomplete
      // Look backwards from cursor for @ symbol
      const textBeforeCursor = newValue.slice(0, cursorPos);
      const atIndex = textBeforeCursor.lastIndexOf('@');

      if (atIndex >= 0) {
        // Check if there's a space between @ and cursor (means mention is complete)
        const textAfterAt = textBeforeCursor.slice(atIndex + 1);
        const hasSpace = /\s/.test(textAfterAt);

        if (!hasSpace) {
          // We're in the middle of typing a mention
          const searchQuery = textAfterAt;

          if (!isOpen) {
            // Open autocomplete
            const textarea = textareaRef.current;
            if (textarea) {
              // Position autocomplete above the textarea
              const rect = textarea.getBoundingClientRect();
              const containerRect =
                containerRef.current?.getBoundingClientRect();
              const top = containerRect
                ? containerRect.height + 8
                : rect.height + 8;
              openAutocomplete(atIndex, { top, left: 0 });
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
    [onChange, isOpen, openAutocomplete, closeAutocomplete, updateQuery]
  );

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Let autocomplete handle navigation first
      const handled = autocompleteKeyDown(e);

      if (handled) {
        // If Enter/Tab was pressed and we have a selection, select the agent
        if (e.key === 'Enter' || e.key === 'Tab') {
          const agent = getSelectedAgent();
          if (agent) {
            handleSelectAgent(agent);
          }
        }
        return;
      }

      // Normal Enter to send (when autocomplete is closed)
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSend();
      }
    },
    [autocompleteKeyDown, getSelectedAgent, handleSelectAgent, onSend]
  );

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
      <MentionAutocomplete
        agents={agents}
        query={query}
        isOpen={isOpen}
        position={position}
        selectedIndex={selectedIndex}
        onSelect={handleSelectAgent}
        onIndexChange={setSelectedIndex}
        onClose={closeAutocomplete}
      />

      <div className="flex items-end gap-2 md:gap-3">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={
            agents.length > 0
              ? 'Type a message... Use @mention to direct agents'
              : 'Type a message...'
          }
          disabled={sending || disabled}
          rows={1}
          className={cn(
            'max-h-40 min-h-[44px] flex-1 resize-none overflow-y-auto rounded-lg px-4 py-3 text-sm',
            'message-input bg-sidebar-accent/50',
            'text-foreground placeholder:text-muted-foreground',
            'outline-none focus:ring-2 focus:ring-primary/50',
            'disabled:cursor-not-allowed disabled:opacity-50'
          )}
        />
        <button
          type="button"
          onClick={onSend}
          disabled={!value.trim() || sending || disabled}
          className={cn(
            'flex h-[44px] items-center gap-2 rounded-lg px-4 py-3 font-semibold md:gap-3',
            'chat-button bg-sidebar-accent/50 text-primary',
            'transition-all duration-300',
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
