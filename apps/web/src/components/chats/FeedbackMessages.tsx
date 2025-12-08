'use client';

import { AlertCircle, Check } from 'lucide-react';

interface FeedbackMessagesProps {
  error: string | null;
  warning: string | null;
  success: boolean;
}

export function FeedbackMessages({
  error,
  warning,
  success,
}: FeedbackMessagesProps) {
  if (!error && !warning && !success) {
    return null;
  }

  return (
    <div className="px-4">
      {error && (
        <div
          className="mb-2 flex items-center gap-2 rounded-lg border-2 bg-sidebar-accent/30 p-2"
          style={{ borderColor: '#f59e0b' }}
        >
          <AlertCircle
            className="h-4 w-4 shrink-0"
            style={{ color: '#f59e0b' }}
          />
          <span className="text-xs" style={{ color: '#f59e0b' }}>
            {error}
          </span>
        </div>
      )}
      {warning && (
        <div
          className="mb-2 flex items-center gap-2 rounded-lg border-2 bg-sidebar-accent/30 p-2"
          style={{ borderColor: '#3b82f6' }}
        >
          <AlertCircle
            className="h-4 w-4 shrink-0"
            style={{ color: '#3b82f6' }}
          />
          <span className="text-xs" style={{ color: '#3b82f6' }}>
            Sent · {warning}
          </span>
        </div>
      )}
      {success && (
        <div
          className="mb-2 flex items-center gap-2 rounded-lg border-2 bg-sidebar-accent/30 p-2"
          style={{ borderColor: '#10b981' }}
        >
          <Check className="h-4 w-4 shrink-0" style={{ color: '#10b981' }} />
          <span className="text-xs" style={{ color: '#10b981' }}>
            Message sent!
          </span>
        </div>
      )}
    </div>
  );
}
