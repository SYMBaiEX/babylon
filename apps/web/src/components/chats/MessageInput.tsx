'use client';

import { cn } from '@babylon/shared';
import { Send } from 'lucide-react';
import React, { useCallback, useEffect, useRef } from 'react';
import { LoginButton } from '@/components/auth/LoginButton';
import { Skeleton } from '@/components/shared/Skeleton';

const MAX_TEXTAREA_HEIGHT = 160;

interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  sending: boolean;
  authenticated: boolean;
}

export function MessageInput({
  value,
  onChange,
  onSend,
  sending,
  authenticated,
}: MessageInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Resize textarea based on content
  const resizeTextarea = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height =
        Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT) + 'px';
    }
  }, []);

  // Resize textarea when value changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: value is intentionally included to trigger resize when content changes
  useEffect(() => {
    resizeTextarea();
  }, [value, resizeTextarea]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
    // Shift+Enter will insert a newline (default behavior)
  };

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
    <div className="bg-background px-4 py-3">
      <div className="flex items-end gap-2 md:gap-3">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          disabled={sending}
          rows={1}
          className={cn(
            'max-h-40 min-h-[44px] flex-1 resize-none overflow-y-auto rounded-lg px-4 py-3 text-sm',
            'message-input bg-sidebar-accent/50',
            'text-foreground placeholder:text-muted-foreground',
            'outline-none',
            'disabled:cursor-not-allowed disabled:opacity-50'
          )}
        />
        <button
          onClick={onSend}
          disabled={!value.trim() || sending}
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
