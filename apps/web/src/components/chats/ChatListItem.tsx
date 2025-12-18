'use client';

import { cn } from '@babylon/shared';
import { Users } from 'lucide-react';
import React from 'react';
import { Avatar } from '@/components/shared/Avatar';
import type { Chat } from './types';

interface ChatListItemProps {
  chat: Chat;
  isSelected: boolean;
  onSelect: (chatId: string) => void;
}

export function ChatListItem({
  chat,
  isSelected,
  onSelect,
}: ChatListItemProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(chat.id);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(chat.id)}
      onKeyDown={handleKeyDown}
      className={cn(
        'cursor-pointer px-4 py-3 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset',
        isSelected
          ? 'border-primary border-l-4 bg-sidebar-accent/50'
          : 'border-transparent border-l-4 hover:bg-sidebar-accent/30'
      )}
    >
      <div className="flex items-center gap-3">
        {chat.isGroup ? (
          <div className="chat-button flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sidebar-accent/50">
            <Users className="h-5 w-5 text-primary" />
          </div>
        ) : (
          <Avatar
            id={chat.otherUser?.id || ''}
            name={
              chat.otherUser?.displayName || chat.otherUser?.username || 'User'
            }
            type="user"
            size="md"
            imageUrl={chat.otherUser?.profileImageUrl || undefined}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-foreground text-sm">
            {chat.name}
          </div>
          <div className="truncate text-muted-foreground text-xs">
            {chat.lastMessage?.content || 'No messages yet'}
          </div>
        </div>
      </div>
    </div>
  );
}
