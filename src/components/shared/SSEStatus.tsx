/**
 * SSE Connection Status Indicator
 * 
 * Shows a subtle indicator of the real-time connection status
 */

'use client';

import { useSSE } from '@/hooks/useSSE';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SSEStatusProps {
  className?: string;
  showLabel?: boolean;
}

export function SSEStatus({ className, showLabel = false }: SSEStatusProps) {
  const { isConnected, error } = useSSE({
    channels: ['feed'], // Subscribe to at least one channel
  });

  if (error) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 text-sm text-red-600 dark:text-red-400',
          className
        )}
        title={error}
      >
        <WifiOff className="h-4 w-4" />
        {showLabel && <span>Offline</span>}
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 text-sm text-yellow-600 dark:text-yellow-400',
          className
        )}
        title="Connecting to real-time updates..."
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        {showLabel && <span>Connecting...</span>}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 text-sm text-green-600 dark:text-green-400',
        className
      )}
      title="Connected to real-time updates"
    >
      <Wifi className="h-4 w-4" />
      {showLabel && <span>Live</span>}
    </div>
  );
}

/**
 * Minimal dot indicator for compact spaces
 */
export function SSEStatusDot({ className }: { className?: string }) {
  const { isConnected, error } = useSSE({
    channels: ['feed'],
  });

  const statusColor = error
    ? 'bg-red-500'
    : isConnected
    ? 'bg-green-500'
    : 'bg-yellow-500';

  const statusText = error
    ? 'Offline'
    : isConnected
    ? 'Live'
    : 'Connecting...';

  return (
    <div
      className={cn('relative flex items-center', className)}
      title={`Real-time updates: ${statusText}`}
    >
      <span className={cn('h-2 w-2 rounded-full', statusColor)} />
      {isConnected && (
        <span
          className={cn(
            'absolute h-2 w-2 rounded-full animate-ping',
            statusColor,
            'opacity-75'
          )}
        />
      )}
    </div>
  );
}

