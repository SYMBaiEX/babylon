'use client';

import { cn } from '@babylon/shared';
import { Activity, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { memo } from 'react';
import { useAgentActivity } from '@/hooks/useAgentActivity';
import { AgentActivityCard } from './AgentActivityCard';

interface AgentActivityFeedProps {
  agentId?: string;
  limit?: number;
  type?: 'all' | 'trade' | 'post' | 'comment';
  showAgent?: boolean;
  showConnectionStatus?: boolean;
  emptyMessage?: string;
  className?: string;
}

/**
 * Real-time activity feed for agent actions.
 *
 * Displays a list of agent activities (trades, posts, comments) with real-time
 * updates via SSE and polling fallback. Shows connection status and loading states.
 *
 * @param props.agentId - Optional agent ID to filter activities (shows all if not provided)
 * @param props.limit - Maximum number of activities to show
 * @param props.type - Filter by activity type
 * @param props.showAgent - Whether to show agent name on each activity card
 * @param props.showConnectionStatus - Whether to show SSE connection indicator
 * @param props.emptyMessage - Custom message when no activities
 */
export const AgentActivityFeed = memo(function AgentActivityFeed({
  agentId,
  limit = 50,
  type = 'all',
  showAgent = false,
  showConnectionStatus = true,
  emptyMessage = 'No activity yet',
  className,
}: AgentActivityFeedProps) {
  const { activities, isLoading, isConnected, refresh, error } =
    useAgentActivity({
      agentId,
      limit,
      type,
      enableSSE: !!agentId,
    });

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Header with connection status */}
      {showConnectionStatus && (
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-zinc-400" />
            <span className="font-medium text-sm text-zinc-300">
              Live Activity
            </span>
            {agentId && <ConnectionIndicator isConnected={isConnected} />}
          </div>
          <button
            onClick={() => void refresh()}
            disabled={isLoading}
            className={cn(
              'rounded-md p-1.5 transition-colors hover:bg-zinc-800',
              'text-zinc-400 hover:text-zinc-200',
              isLoading && 'animate-spin'
            )}
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-800 bg-red-900/20 p-3">
          <p className="text-red-400 text-sm">
            Failed to load activity: {error.message}
          </p>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && activities.length === 0 && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <ActivitySkeleton key={i} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && activities.length === 0 && !error && (
        <EmptyState message={emptyMessage} />
      )}

      {/* Activity list */}
      {activities.length > 0 && (
        <div className="space-y-3">
          {activities.map((activity) => (
            <AgentActivityCard
              key={activity.id}
              activity={activity}
              showAgent={showAgent}
            />
          ))}
        </div>
      )}
    </div>
  );
});

// Connection indicator component
function ConnectionIndicator({ isConnected }: { isConnected: boolean }) {
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium text-xs',
        isConnected
          ? 'bg-emerald-900/30 text-emerald-400'
          : 'bg-zinc-800 text-zinc-500'
      )}
    >
      {isConnected ? (
        <>
          <Wifi className="h-3 w-3" />
          <span>Live</span>
        </>
      ) : (
        <>
          <WifiOff className="h-3 w-3" />
          <span>Polling</span>
        </>
      )}
    </div>
  );
}

// Loading skeleton component
function ActivitySkeleton() {
  return (
    <div className="animate-pulse rounded-lg border border-zinc-800 p-4">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 shrink-0 rounded-full bg-zinc-800" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-48 rounded bg-zinc-800" />
          <div className="h-3 w-32 rounded bg-zinc-800" />
        </div>
      </div>
    </div>
  );
}

// Empty state component
function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800">
        <Activity className="h-6 w-6 text-zinc-500" />
      </div>
      <p className="text-sm text-zinc-400">{message}</p>
      <p className="mt-1 text-xs text-zinc-500">
        Activity will appear here when your agent takes actions
      </p>
    </div>
  );
}
