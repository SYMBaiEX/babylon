/**
 * Content Moderation tab for reviewing flagged posts and comments.
 *
 * Displays a queue of reported content with approve/hide/delete actions.
 * Shows content details, author info, report count, and engagement metrics.
 *
 * Features:
 * - Posts and comments queue
 * - Content type filtering
 * - Approve, hide, delete actions
 * - Author information display
 * - Report count and engagement metrics
 * - Action confirmation modal
 * - Loading states
 * - Auto-refresh
 *
 * @returns Content moderation tab element
 */
'use client';

import { cn } from '@babylon/shared';
import {
  AlertTriangle,
  Check,
  Eye,
  EyeOff,
  Flag,
  MessageSquare,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/shared/Avatar';
import { Skeleton } from '@/components/shared/Skeleton';

type ContentType = 'all' | 'posts' | 'comments';

interface ContentItem {
  id: string;
  type: 'post' | 'comment';
  content: string;
  createdAt: string;
  isHidden: boolean | null;
  authorId: string;
  authorUsername: string | null;
  authorDisplayName: string | null;
  authorProfileImage: string | null;
  authorIsActor: boolean;
  reactionCount: number;
  reportCount: number;
  commentCount?: number;
  postId?: string;
  mediaUrls?: string[];
}

interface QueueStats {
  posts: { pending: number; hidden: number };
  comments: { pending: number; hidden: number };
  totalPending: number;
}

interface QueueData {
  posts: ContentItem[];
  comments: ContentItem[];
  stats: QueueStats;
}

export function ContentModerationTab() {
  const [data, setData] = useState<QueueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [contentType, setContentType] = useState<ContentType>('all');
  const [isRefreshing, startRefresh] = useTransition();
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);
  const [showActionModal, setShowActionModal] = useState(false);
  const [actionType, setActionType] = useState<'approve' | 'hide' | 'delete'>('approve');
  const [actionReason, setActionReason] = useState('');
  const [isActioning, startActioning] = useTransition();

  const fetchQueue = useCallback((showRefreshing = false) => {
    const fetchLogic = async () => {
      const params = new URLSearchParams();
      if (contentType !== 'all') params.set('type', contentType);

      const response = await fetch(`/api/admin/content-queue?${params}`);
      if (!response.ok) {
        setLoading(false);
        return;
      }
      const result = await response.json();
      setData(result);
      setLoading(false);
    };

    if (showRefreshing) {
      startRefresh(fetchLogic);
    } else {
      fetchLogic();
    }
  }, [contentType]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const handleAction = (item: ContentItem, action: 'approve' | 'hide' | 'delete') => {
    setSelectedItem(item);
    setActionType(action);
    setActionReason('');
    setShowActionModal(true);
  };

  const executeAction = () => {
    if (!selectedItem) return;

    startActioning(async () => {
      const response = await fetch(`/api/admin/content-queue/${selectedItem.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: actionType,
          contentType: selectedItem.type,
          reason: actionReason || undefined,
        }),
      });

      if (!response.ok) {
        toast.error('Failed to perform action');
        return;
      }

      toast.success(
        actionType === 'approve'
          ? 'Content approved'
          : actionType === 'hide'
            ? 'Content hidden'
            : 'Content deleted'
      );
      setShowActionModal(false);
      setSelectedItem(null);
      fetchQueue(true);
    });
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const truncateContent = (content: string, maxLength = 200) => {
    if (content.length <= maxLength) return content;
    return content.slice(0, maxLength) + '...';
  };

  const ContentCard = ({ item }: { item: ContentItem }) => (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5 transition-shadow hover:shadow-md">
      {/* Header */}
      <div className="mb-2 sm:mb-3 flex flex-wrap items-start justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-3">
          <Avatar
            src={item.authorProfileImage ?? undefined}
            alt={item.authorDisplayName || item.authorUsername || 'User'}
            size="sm"
          />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">
                {item.authorDisplayName || item.authorUsername || 'Anonymous'}
              </span>
              {item.authorIsActor && (
                <span className="rounded bg-purple-500/20 px-1.5 py-0.5 text-purple-500 text-xs">
                  NPC
                </span>
              )}
            </div>
            <div className="text-muted-foreground text-xs">
              {formatDate(item.createdAt)}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={cn(
              'rounded px-2 py-1 text-xs font-medium',
              item.type === 'post'
                ? 'bg-blue-500/20 text-blue-500'
                : 'bg-green-500/20 text-green-500'
            )}
          >
            {item.type === 'post' ? 'Post' : 'Comment'}
          </span>
          <span className="flex items-center gap-1 rounded bg-red-500/20 px-2 py-1 text-red-500 text-xs font-medium">
            <Flag className="h-3 w-3" />
            {item.reportCount}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="mb-4 rounded-lg bg-muted/50 p-3">
        <p className="whitespace-pre-wrap text-sm">{truncateContent(item.content)}</p>
        {item.mediaUrls && item.mediaUrls.length > 0 && (
          <div className="mt-2 flex gap-2">
            {item.mediaUrls.slice(0, 3).map((url, i) => (
              <div
                key={i}
                className="h-16 w-16 overflow-hidden rounded-lg bg-muted"
              >
                <img
                  src={url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
            ))}
            {item.mediaUrls.length > 3 && (
              <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-muted text-muted-foreground text-xs">
                +{item.mediaUrls.length - 3}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="mb-4 flex items-center gap-4 text-muted-foreground text-sm">
        <span className="flex items-center gap-1">
          <MessageSquare className="h-4 w-4" />
          {item.commentCount ?? 0} comments
        </span>
        <span>❤️ {item.reactionCount} reactions</span>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          onClick={() => handleAction(item, 'approve')}
          className="flex flex-1 items-center justify-center gap-1.5 sm:gap-2 rounded-lg bg-green-500/20 px-2.5 sm:px-3 py-2 text-green-500 text-xs sm:text-sm font-medium transition-colors hover:bg-green-500/30"
        >
          <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          Approve
        </button>
        <button
          onClick={() => handleAction(item, 'hide')}
          className="flex flex-1 items-center justify-center gap-1.5 sm:gap-2 rounded-lg bg-yellow-500/20 px-2.5 sm:px-3 py-2 text-xs sm:text-sm font-medium text-yellow-500 transition-colors hover:bg-yellow-500/30"
        >
          <EyeOff className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          Hide
        </button>
        <button
          onClick={() => handleAction(item, 'delete')}
          className="flex flex-1 items-center justify-center gap-1.5 sm:gap-2 rounded-lg bg-red-500/20 px-2.5 sm:px-3 py-2 text-red-500 text-xs sm:text-sm font-medium transition-colors hover:bg-red-500/30"
        >
          <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          Delete
        </button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
          <Skeleton className="h-20 sm:h-24" />
          <Skeleton className="h-20 sm:h-24" />
          <Skeleton className="h-20 sm:h-24" />
        </div>
        <Skeleton className="h-48 sm:h-64" />
        <Skeleton className="h-48 sm:h-64" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <Flag className="mx-auto mb-3 h-12 w-12 opacity-50" />
        <p>Failed to load content queue</p>
      </div>
    );
  }

  const allItems = [
    ...(contentType === 'comments' ? [] : data.posts),
    ...(contentType === 'posts' ? [] : data.comments),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 font-bold text-2xl">
            <Eye className="h-6 w-6 text-orange-500" />
            Content Moderation
          </h2>
          <p className="mt-1 text-muted-foreground">
            Review flagged posts and comments
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Content Type Filter */}
          <div className="flex rounded-lg border border-border bg-card">
            {(['all', 'posts', 'comments'] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setContentType(t);
                  setLoading(true);
                }}
                className={cn(
                  'px-2.5 py-1.5 text-xs sm:px-4 sm:py-2 sm:text-sm font-medium transition-colors first:rounded-l-lg last:rounded-r-lg',
                  contentType === t
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                )}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          <button
            onClick={() => fetchQueue(true)}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 sm:gap-2 rounded-lg bg-muted px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm font-medium transition-colors hover:bg-muted/80 disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3.5 w-3.5 sm:h-4 sm:w-4', isRefreshing && 'animate-spin')} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <div className="rounded-xl border border-orange-500/20 bg-orange-500/10 p-4 sm:p-5">
          <div className="mb-1.5 sm:mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-orange-500" />
            <span className="font-medium text-sm sm:text-base">Pending Review</span>
          </div>
          <div className="font-bold text-2xl sm:text-3xl text-orange-500">
            {data.stats.totalPending}
          </div>
        </div>
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-4 sm:p-5">
          <div className="mb-1.5 sm:mb-2 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 sm:h-5 sm:w-5 text-blue-500" />
            <span className="font-medium text-sm sm:text-base">Flagged Posts</span>
          </div>
          <div className="font-bold text-2xl sm:text-3xl text-blue-500">
            {data.stats.posts.pending}
          </div>
        </div>
        <div className="rounded-xl border border-green-500/20 bg-green-500/10 p-4 sm:p-5">
          <div className="mb-1.5 sm:mb-2 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 sm:h-5 sm:w-5 text-green-500" />
            <span className="font-medium text-sm sm:text-base">Flagged Comments</span>
          </div>
          <div className="font-bold text-2xl sm:text-3xl text-green-500">
            {data.stats.comments.pending}
          </div>
        </div>
      </div>

      {/* Queue */}
      {allItems.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-12 text-center">
          <Check className="mx-auto mb-3 h-12 w-12 text-green-500" />
          <p className="font-medium text-lg">All clear!</p>
          <p className="text-muted-foreground">No content pending review</p>
        </div>
      ) : (
        <div className="space-y-4">
          {allItems.map((item) => (
            <ContentCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {/* Action Modal */}
      {showActionModal && selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6">
            <h3 className="mb-4 font-bold text-xl">
              {actionType === 'approve'
                ? 'Approve Content'
                : actionType === 'hide'
                  ? 'Hide Content'
                  : 'Delete Content'}
            </h3>

            <p className="mb-4 text-muted-foreground">
              {actionType === 'approve'
                ? 'This will dismiss all reports for this content.'
                : actionType === 'hide'
                  ? 'This will hide the content from public view.'
                  : 'This will permanently delete the content.'}
            </p>

            <div className="mb-4 rounded-lg bg-muted/50 p-3">
              <p className="line-clamp-3 text-sm">
                {truncateContent(selectedItem.content, 150)}
              </p>
            </div>

            {actionType !== 'approve' && (
              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium">
                  Reason (optional)
                </label>
                <textarea
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder="Enter reason for this action..."
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 resize-none"
                  rows={3}
                />
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setShowActionModal(false)}
                disabled={isActioning}
                className="flex-1 rounded-lg bg-muted px-4 py-2 font-medium transition-colors hover:bg-muted/80 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={executeAction}
                disabled={isActioning}
                className={cn(
                  'flex-1 rounded-lg px-4 py-2 font-medium transition-colors disabled:opacity-50',
                  actionType === 'approve'
                    ? 'bg-green-500 text-white hover:bg-green-600'
                    : actionType === 'hide'
                      ? 'bg-yellow-500 text-black hover:bg-yellow-600'
                      : 'bg-red-500 text-white hover:bg-red-600'
                )}
              >
                {isActioning ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
