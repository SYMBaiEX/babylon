'use client';

import { cn } from '@babylon/shared';
import { Send } from 'lucide-react';
import React from 'react';
import { LoginButton } from '@/components/auth/LoginButton';
import { Skeleton } from '@/components/shared/Skeleton';

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
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
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
      <div className="flex gap-2 md:gap-3">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Type a message..."
          disabled={sending}
          className={cn(
            'flex-1 rounded-lg px-4 py-3 text-sm',
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
            'flex items-center gap-2 rounded-lg px-4 py-3 font-semibold md:gap-3',
            'chat-button bg-sidebar-accent/50',
            'transition-all duration-300',
            'disabled:cursor-not-allowed disabled:opacity-50'
          )}
          style={{ color: '#0066FF' }}
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
