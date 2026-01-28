'use client';

import type { CommentPreviewData } from '@babylon/shared';
import { cn, getProfileUrl } from '@babylon/shared';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { memo } from 'react';
import { Avatar } from '@/components/shared/Avatar';
import {
  isNpcIdentifier,
  VerifiedBadge,
} from '@/components/shared/VerifiedBadge';

// Re-export for convenience
export type { CommentPreviewData } from '@babylon/shared';

interface CommentPreviewProps {
  comments: CommentPreviewData[];
  postId: string;
  totalCommentCount: number;
  onViewAllClick?: () => void;
  className?: string;
}

/**
 * Inline comment preview component for post cards.
 *
 * Displays 3 recent comments with full layout directly on the feed,
 * similar to how social platforms show engagement context.
 *
 * Features:
 * - Avatar + name/handle + timestamp layout
 * - Full comment content display
 * - Verified badges for NPCs
 * - "View all comments" link
 * - Inline comment input bar
 *
 * @example
 * ```tsx
 * <CommentPreview
 *   comments={topComments}
 *   postId="post-123"
 *   totalCommentCount={15}
 *   onViewAllClick={() => openComments()}
 * />
 * ```
 */
export const CommentPreview = memo(function CommentPreview({
  comments,
  postId: _postId,
  totalCommentCount,
  onViewAllClick,
  className,
}: CommentPreviewProps) {
  if (!comments || comments.length === 0) {
    return null;
  }

  return (
    <div
      className={cn('mt-3 border-muted border-b pb-3', className)}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Comment list */}
      <div className="space-y-3">
        {comments.map((comment) => (
          <CommentPreviewItem key={comment.id} comment={comment} />
        ))}
      </div>

      {/* View all comments link */}
      {totalCommentCount > comments.length && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onViewAllClick?.();
          }}
          className="mt-3 text-primary text-sm transition-colors hover:text-primary/80"
        >
          View all {totalCommentCount} comments
        </button>
      )}

      {/* Comment input bar - opens full comment section on click */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onViewAllClick?.();
        }}
        className={cn(
          'mt-3 w-full rounded-full border border-border/20 bg-muted',
          'px-4 py-2 text-left text-muted-foreground text-sm',
          'hover:bg-muted/80',
          'cursor-text transition-colors'
        )}
      >
        Leave a comment...
      </button>
    </div>
  );
});

/**
 * Individual comment preview item - full layout matching reference design
 */
const CommentPreviewItem = memo(function CommentPreviewItem({
  comment,
}: {
  comment: CommentPreviewData;
}) {
  const isNPC = isNpcIdentifier(comment.userId);
  const timeAgo = formatTimeAgo(comment.createdAt);

  return (
    <div className="flex items-start gap-3">
      {/* Avatar */}
      <Link
        href={getProfileUrl(comment.userId, comment.userUsername)}
        className="shrink-0 transition-opacity hover:opacity-80"
        onClick={(e) => e.stopPropagation()}
      >
        <Avatar
          id={comment.userId}
          name={comment.userName}
          type="actor"
          size="sm"
          src={comment.userAvatar || undefined}
        />
      </Link>

      {/* Content area */}
      <div className="min-w-0 flex-1">
        {/* Header: Name + Handle + Timestamp */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1">
            <Link
              href={getProfileUrl(comment.userId, comment.userUsername)}
              className="flex items-center gap-1 font-semibold text-foreground text-sm hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="truncate">{comment.userName}</span>
              {isNPC && <VerifiedBadge size="sm" />}
            </Link>
            {comment.userUsername && (
              <span className="truncate text-muted-foreground text-sm">
                @{comment.userUsername}
              </span>
            )}
          </div>
          <span className="shrink-0 text-muted-foreground text-xs">
            {timeAgo} ago
          </span>
        </div>

        {/* Comment content */}
        <p className="mt-0.5 text-foreground/90 text-sm leading-relaxed">
          {comment.content}
        </p>
      </div>
    </div>
  );
});

/**
 * Format timestamp to relative time (e.g., "55m", "2h", "3d")
 */
function formatTimeAgo(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMinutes < 1) return 'now';
    if (diffMinutes < 60) return `${diffMinutes}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;

    return formatDistanceToNow(date, { addSuffix: false });
  } catch {
    return '';
  }
}
