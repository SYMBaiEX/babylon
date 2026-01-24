'use client';

import { cn } from '@babylon/shared';
import { Loader2, MessageSquarePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Conversation info */
interface ConversationInfo {
  id: string;
  name: string | null;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

interface ConversationListProps {
  conversations: ConversationInfo[];
  loading?: boolean;
  onNewChat: () => void;
  onSelectConversation: (chatId: string) => void;
  /** Called when a link is clicked (for closing drawer on mobile) */
  onClose?: () => void;
}

/**
 * Conversation list component for Command Center sidebar
 *
 * Shows all conversations in the team chat.
 * Allows creating new conversations (fresh chat).
 */
export function ConversationList({
  conversations,
  loading = false,
  onNewChat,
  onSelectConversation,
  onClose,
}: ConversationListProps) {
  const handleSelectConversation = (chatId: string) => {
    onSelectConversation(chatId);
    onClose?.();
  };

  return (
    <div className="space-y-3">
      {/* Header with New Chat button */}
      <div className="flex items-center justify-between px-3">
        <h3 className="font-medium text-foreground text-sm">Conversations</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={onNewChat}
          className="h-7 gap-1.5 px-2 text-xs"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
          New Chat
        </Button>
      </div>

      {/* Conversation list */}
      <div className="max-h-[200px] space-y-1 overflow-y-auto px-1">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : conversations.length === 0 ? (
          <p className="py-4 text-center text-muted-foreground text-xs">
            No conversations yet
          </p>
        ) : (
          conversations.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              onClick={() => handleSelectConversation(conversation.id)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                conversation.isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <span
                className={cn(
                  'h-1.5 w-1.5 shrink-0 rounded-full',
                  conversation.isActive ? 'bg-primary' : 'bg-transparent'
                )}
              />
              <span className="truncate text-sm">
                {conversation.name || 'Untitled'}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
