'use client';

import { cn } from '@babylon/shared';
import {
  ArrowDownRight,
  ArrowUpRight,
  MessageCircle,
  MessageSquare,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { memo, useState } from 'react';
import type { AgentActivity } from '@/hooks/useAgentActivity';

interface AgentActivityCardProps {
  activity: AgentActivity;
  showAgent?: boolean;
  className?: string;
}

/**
 * Card component for displaying a single agent activity item.
 *
 * Renders different layouts based on activity type (trade, post, comment, message).
 * Shows relevant details like market, amount, P&L for trades, or content preview
 * for posts and comments.
 */
export const AgentActivityCard = memo(function AgentActivityCard({
  activity,
  showAgent = false,
  className,
}: AgentActivityCardProps) {
  const [expanded, setExpanded] = useState(false);

  const timestamp = new Date(activity.timestamp);
  const timeAgo = getTimeAgo(timestamp);

  return (
    <div
      className={cn(
        'group relative cursor-pointer rounded-lg border border-zinc-800 p-4 transition-colors hover:border-zinc-700',
        'bg-zinc-900/50 hover:bg-zinc-900/80',
        className
      )}
      onClick={() => setExpanded((prev) => !prev)}
    >
      <div className="flex items-start gap-3">
        {/* Activity Icon */}
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
            getActivityIconBackground(activity)
          )}
        >
          {getActivityIcon(activity)}
        </div>

        <div className="min-w-0 flex-1">
          {/* Header Row */}
          <div className="flex flex-wrap items-center gap-2">
            {showAgent && activity.agent && (
              <span className="font-medium text-sm text-white">
                {activity.agent.name}
              </span>
            )}
            <span className="font-medium text-sm text-zinc-300">
              {getActivityTitle(activity)}
            </span>
            <span className="text-xs text-zinc-500">{timeAgo}</span>
          </div>

          {/* Activity-specific content */}
          <div className="mt-2">
            {renderActivityContent(activity, expanded)}
          </div>
        </div>

        {/* P&L Badge for trades */}
        {activity.type === 'trade' &&
          'pnl' in activity.data &&
          activity.data.pnl !== null && <PnLBadge pnl={activity.data.pnl} />}
      </div>
    </div>
  );
});

// Helper: Get activity icon
function getActivityIcon(activity: AgentActivity) {
  if (activity.type === 'trade') {
    const data = activity.data as { side: string | null; action: string };
    const isLong = data.side === 'long' || data.side === 'yes';
    const isOpen = data.action === 'open';

    if (isOpen) {
      return isLong ? (
        <ArrowUpRight className="h-5 w-5 text-emerald-400" />
      ) : (
        <ArrowDownRight className="h-5 w-5 text-red-400" />
      );
    }
    return isLong ? (
      <TrendingUp className="h-5 w-5 text-emerald-400" />
    ) : (
      <TrendingDown className="h-5 w-5 text-red-400" />
    );
  }

  if (activity.type === 'post') {
    return <MessageSquare className="h-5 w-5 text-blue-400" />;
  }

  if (activity.type === 'comment') {
    return <MessageCircle className="h-5 w-5 text-purple-400" />;
  }

  if (activity.type === 'message') {
    return <MessageCircle className="h-5 w-5 text-amber-400" />;
  }

  return <MessageSquare className="h-5 w-5 text-zinc-400" />;
}

// Helper: Get icon background color
function getActivityIconBackground(activity: AgentActivity): string {
  if (activity.type === 'trade') {
    const data = activity.data as { side: string | null };
    const isLong = data.side === 'long' || data.side === 'yes';
    return isLong ? 'bg-emerald-900/30' : 'bg-red-900/30';
  }

  if (activity.type === 'post') return 'bg-blue-900/30';
  if (activity.type === 'comment') return 'bg-purple-900/30';
  if (activity.type === 'message') return 'bg-amber-900/30';

  return 'bg-zinc-800';
}

// Helper: Get activity title
function getActivityTitle(activity: AgentActivity): string {
  if (activity.type === 'trade') {
    const data = activity.data as {
      action: string;
      side: string | null;
      marketType: string;
    };
    const sideLabel = data.side ? ` ${data.side.toUpperCase()}` : '';
    return `${data.action === 'open' ? 'Opened' : 'Closed'}${sideLabel} ${data.marketType} position`;
  }

  if (activity.type === 'post') return 'Created a post';
  if (activity.type === 'comment') {
    const data = activity.data as { parentCommentId: string | null };
    return data.parentCommentId
      ? 'Replied to a comment'
      : 'Commented on a post';
  }
  if (activity.type === 'message') return 'Sent a message';

  return 'Activity';
}

// Helper: Render activity-specific content
function renderActivityContent(activity: AgentActivity, expanded: boolean) {
  if (activity.type === 'trade') {
    const data = activity.data as {
      marketType: string;
      marketId: string | null;
      ticker: string | null;
      marketQuestion: string | null;
      amount: number;
      price: number;
      reasoning: string | null;
    };

    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-zinc-400">
            {data.marketType === 'perp' ? data.ticker : 'Prediction'}
          </span>
          <span className="text-zinc-600">•</span>
          <span className="font-mono text-white">
            ${data.amount.toLocaleString()}
          </span>
          <span className="text-zinc-600">@</span>
          <span className="font-mono text-zinc-300">
            {data.marketType === 'perp'
              ? `$${data.price.toLocaleString()}`
              : `${(data.price * 100).toFixed(1)}%`}
          </span>
        </div>

        {data.marketQuestion && (
          <p className="line-clamp-2 text-sm text-zinc-400">
            {data.marketQuestion}
          </p>
        )}

        {expanded && data.reasoning && (
          <div className="mt-3 rounded-md border border-zinc-700 bg-zinc-800/50 p-3">
            <p className="mb-1 font-medium text-xs text-zinc-500 uppercase">
              Reasoning
            </p>
            <p className="text-sm text-zinc-300">{data.reasoning}</p>
          </div>
        )}
      </div>
    );
  }

  if (activity.type === 'post' || activity.type === 'comment') {
    const data = activity.data as { contentPreview: string };
    return (
      <p
        className={cn('text-sm text-zinc-400', expanded ? '' : 'line-clamp-2')}
      >
        {data.contentPreview}
      </p>
    );
  }

  if (activity.type === 'message') {
    const data = activity.data as { contentPreview: string };
    return (
      <p
        className={cn(
          'text-sm text-zinc-400 italic',
          expanded ? '' : 'line-clamp-2'
        )}
      >
        {data.contentPreview}
      </p>
    );
  }

  return null;
}

// Helper: P&L Badge component
function PnLBadge({ pnl }: { pnl: number }) {
  const isPositive = pnl >= 0;
  return (
    <div
      className={cn(
        'shrink-0 rounded-md px-2.5 py-1 font-medium font-mono text-sm',
        isPositive
          ? 'border border-emerald-800 bg-emerald-900/30 text-emerald-400'
          : 'border border-red-800 bg-red-900/30 text-red-400'
      )}
    >
      {isPositive ? '+' : ''}$
      {pnl.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}
    </div>
  );
}

// Helper: Format time ago
function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;

  return date.toLocaleDateString();
}
