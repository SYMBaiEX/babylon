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

// Type guards for discriminated union on activity.type
interface TradeData {
  tradeId: string;
  marketType: 'prediction' | 'perp';
  marketId: string | null;
  ticker: string | null;
  marketQuestion: string | null;
  action: string;
  side: string | null;
  amount: number;
  price: number;
  pnl: number | null;
  reasoning: string | null;
}

interface PostData {
  postId: string;
  contentPreview: string;
}

interface CommentData {
  commentId: string;
  postId: string;
  contentPreview: string;
  parentCommentId: string | null;
}

interface MessageData {
  messageId: string;
  chatId: string;
  recipientId: string | null;
  contentPreview: string;
}

function isTradeActivity(
  activity: AgentActivity
): activity is AgentActivity & { type: 'trade'; data: TradeData } {
  return activity.type === 'trade';
}

function isPostActivity(
  activity: AgentActivity
): activity is AgentActivity & { type: 'post'; data: PostData } {
  return activity.type === 'post';
}

function isCommentActivity(
  activity: AgentActivity
): activity is AgentActivity & { type: 'comment'; data: CommentData } {
  return activity.type === 'comment';
}

function isMessageActivity(
  activity: AgentActivity
): activity is AgentActivity & { type: 'message'; data: MessageData } {
  return activity.type === 'message';
}

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
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setExpanded((prev) => !prev);
        }
      }}
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      aria-label={`${getActivityTitle(activity)}. Click to ${expanded ? 'collapse' : 'expand'} details.`}
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
  if (isTradeActivity(activity)) {
    const { side, action } = activity.data;
    const isLong = side === 'long' || side === 'yes';
    const isOpen = action === 'open';

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

  if (isPostActivity(activity)) {
    return <MessageSquare className="h-5 w-5 text-blue-400" />;
  }

  if (isCommentActivity(activity)) {
    return <MessageCircle className="h-5 w-5 text-purple-400" />;
  }

  if (isMessageActivity(activity)) {
    return <MessageCircle className="h-5 w-5 text-amber-400" />;
  }

  return <MessageSquare className="h-5 w-5 text-zinc-400" />;
}

// Helper: Get icon background color
function getActivityIconBackground(activity: AgentActivity): string {
  if (isTradeActivity(activity)) {
    const isLong =
      activity.data.side === 'long' || activity.data.side === 'yes';
    return isLong ? 'bg-emerald-900/30' : 'bg-red-900/30';
  }

  if (isPostActivity(activity)) return 'bg-blue-900/30';
  if (isCommentActivity(activity)) return 'bg-purple-900/30';
  if (isMessageActivity(activity)) return 'bg-amber-900/30';

  return 'bg-zinc-800';
}

// Helper: Get activity title
function getActivityTitle(activity: AgentActivity): string {
  if (isTradeActivity(activity)) {
    const { action, side, marketType } = activity.data;
    const sideLabel = side ? ` ${side.toUpperCase()}` : '';
    return `${action === 'open' ? 'Opened' : 'Closed'}${sideLabel} ${marketType} position`;
  }

  if (isPostActivity(activity)) return 'Created a post';

  if (isCommentActivity(activity)) {
    return activity.data.parentCommentId
      ? 'Replied to a comment'
      : 'Commented on a post';
  }

  if (isMessageActivity(activity)) return 'Sent a message';

  return 'Activity';
}

// Helper: Render activity-specific content
function renderActivityContent(activity: AgentActivity, expanded: boolean) {
  if (isTradeActivity(activity)) {
    const { marketType, ticker, marketQuestion, amount, price, reasoning } =
      activity.data;

    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-zinc-400">
            {marketType === 'perp' ? ticker : 'Prediction'}
          </span>
          <span className="text-zinc-600">•</span>
          <span className="font-mono text-white">
            ${amount.toLocaleString()}
          </span>
          <span className="text-zinc-600">@</span>
          <span className="font-mono text-zinc-300">
            {marketType === 'perp'
              ? `$${price.toLocaleString()}`
              : `${(price * 100).toFixed(1)}%`}
          </span>
        </div>

        {marketQuestion && (
          <p className="line-clamp-2 text-sm text-zinc-400">{marketQuestion}</p>
        )}

        {expanded && reasoning && (
          <div className="mt-3 rounded-md border border-zinc-700 bg-zinc-800/50 p-3">
            <p className="mb-1 font-medium text-xs text-zinc-500 uppercase">
              Reasoning
            </p>
            <p className="text-sm text-zinc-300">{reasoning}</p>
          </div>
        )}
      </div>
    );
  }

  if (isPostActivity(activity)) {
    return (
      <p
        className={cn('text-sm text-zinc-400', expanded ? '' : 'line-clamp-2')}
      >
        {activity.data.contentPreview}
      </p>
    );
  }

  if (isCommentActivity(activity)) {
    return (
      <p
        className={cn('text-sm text-zinc-400', expanded ? '' : 'line-clamp-2')}
      >
        {activity.data.contentPreview}
      </p>
    );
  }

  if (isMessageActivity(activity)) {
    return (
      <p
        className={cn(
          'text-sm text-zinc-400 italic',
          expanded ? '' : 'line-clamp-2'
        )}
      >
        {activity.data.contentPreview}
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
