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
const MENTION_DEBOUNCE_MS = 300;

/**
 * Renders text with @mentions highlighted as styled chips
 */
function HighlightedText({
  text,
  validUsernames,
}: {
  text: string;
  validUsernames: Set<string>;
}) {
  // Split text by @mentions and render with highlighting
  const parts: React.ReactNode[] = [];
  const mentionRegex = /(@[A-Za-z0-9_.-]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = null;

  while ((match = mentionRegex.exec(text)) !== null) {
    // Add text before the mention
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const mention = match[1];
    const username = mention.slice(1).toLowerCase(); // Remove @ and lowercase

    // Only highlight if it's a valid agent username
    if (validUsernames.has(username)) {
      parts.push(
        <span
          key={`${match.index}-${mention}`}
          className="rounded bg-primary/20 px-0.5 text-primary"
        >
          {mention}
        </span>
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

  return <>{parts}</>;
}

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

  // Track previous mentions to avoid infinite loop
  const prevMentionsRef = useRef<string>('');
  const mentionDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Memoized lookup map from lowercase username to agent ID
  const usernameToAgentId = useMemo(() => {
    const map = new Map<string, string>();
    for (const agent of agents) {
      if (agent.username) {
        map.set(agent.username.toLowerCase(), agent.id);
      }
    }
    return map;
  }, [agents]);

  // Set of valid usernames for highlighting
  const validUsernames = useMemo(() => {
    const set = new Set<string>();
    for (const agent of agents) {
      if (agent.username) {
        set.add(agent.username.toLowerCase());
      }
    }
    return set;
  }, [agents]);

  // Extract mentioned agent IDs from message content (debounced)
  useEffect(() => {
    if (!onMentionsChange) return;

    // Clear previous debounce timer
    if (mentionDebounceRef.current) {
      clearTimeout(mentionDebounceRef.current);
    }

    // Debounce mention extraction to avoid running on every keystroke
    mentionDebounceRef.current = setTimeout(() => {
      // Regex matches @mentions but not email addresses
      // Requires @ at word boundary (start or after whitespace/punctuation)
      const mentionRegex = /(?:^|[\s(,])@([A-Za-z0-9_.-]+)/g;
      const mentions: string[] = [];
      let match: RegExpExecArray | null = null;

      while ((match = mentionRegex.exec(value)) !== null) {
        const matchedUsername = match[1]?.toLowerCase();
        if (matchedUsername) {
          const agentId = usernameToAgentId.get(matchedUsername);
          if (agentId) {
            mentions.push(agentId);
          }
        }
      }

      const uniqueMentions = [...new Set(mentions)];
      const mentionsKey = uniqueMentions.sort().join(',');

      // Only call if mentions actually changed
      if (mentionsKey !== prevMentionsRef.current) {
        prevMentionsRef.current = mentionsKey;
        onMentionsChange(uniqueMentions);
      }
    }, MENTION_DEBOUNCE_MS);

    return () => {
      if (mentionDebounceRef.current) {
        clearTimeout(mentionDebounceRef.current);
      }
    };
  }, [value, usernameToAgentId, onMentionsChange]);

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
            // Open autocomplete above the textarea
            const textarea = textareaRef.current;
            if (textarea) {
              const rect = textarea.getBoundingClientRect();
              const containerRect =
                containerRef.current?.getBoundingClientRect();
              const bottom = containerRect
                ? containerRect.height + 8
                : rect.height + 8;
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
      {/* Mention autocomplete dropdown - pass pre-filtered agents from hook */}
      <MentionAutocomplete
        agents={filteredAgents}
        isOpen={isOpen}
        position={position}
        selectedIndex={selectedIndex}
        onSelect={handleSelectAgent}
        onIndexChange={setSelectedIndex}
        onClose={closeAutocomplete}
      />

      <div className="flex items-end gap-2 md:gap-3">
        <div className="relative min-h-[44px] flex-1">
          {/* Highlight overlay - renders mentions with styling */}
          <div
            className={cn(
              'pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words rounded-lg px-4 py-3 text-sm',
              'text-foreground'
            )}
            aria-hidden="true"
          >
            <HighlightedText text={value} validUsernames={validUsernames} />
          </div>
          {/* Actual textarea - text is transparent, caret visible */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={
              agents.length > 0
                ? 'Message... @mention agents'
                : 'Type a message...'
            }
            disabled={sending || disabled}
            rows={1}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            className={cn(
              'relative z-10 max-h-40 min-h-[44px] w-full resize-none overflow-y-auto rounded-lg px-4 py-3 text-sm',
              'message-input bg-sidebar-accent/50',
              'text-transparent caret-foreground placeholder:text-muted-foreground',
              'outline-none focus:ring-2 focus:ring-primary/50',
              'disabled:cursor-not-allowed disabled:opacity-50'
            )}
          />
        </div>
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
