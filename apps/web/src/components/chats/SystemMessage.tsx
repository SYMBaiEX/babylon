'use client';

import type { Message } from './types';

interface SystemMessageProps {
  message: Message;
}

export function SystemMessage({ message }: SystemMessageProps) {
  const msgDate = new Date(message.createdAt);

  return (
    <div className="flex justify-center py-2">
      <div className="flex items-center gap-2 rounded-full bg-muted/50 px-3 py-1.5 text-muted-foreground text-xs">
        <span>{message.content}</span>
        <span className="opacity-60">·</span>
        <span className="opacity-60">
          {msgDate.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          })}
        </span>
      </div>
    </div>
  );
}

