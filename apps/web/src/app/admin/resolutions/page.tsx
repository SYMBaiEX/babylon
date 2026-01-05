/**
 * Admin Resolution Review Queue
 *
 * Lists low-confidence prediction question resolutions that require manual review.
 */

'use client';

import { cn } from '@babylon/shared';
import { ExternalLink, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

/** Format date with time for resolution display */
function formatDateTime(dateStr: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

type PendingResolution = {
  id: string;
  questionNumber: number;
  text: string;
  outcome: boolean;
  resolutionDate: string | null;
  resolutionProofUrl: string | null;
  resolutionDescription: string | null;
  resolutionConfidence: number | null;
  resolutionReviewStatus: 'pending' | 'approved' | 'rejected' | string;
  requiresManualReview: boolean;
  updatedAt: string | null;
};

export default function AdminResolutionsPage() {
  const [items, setItems] = useState<PendingResolution[]>([]);
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/resolutions');
      let data: unknown;
      try {
        data = await res.json();
      } catch {
        throw new Error('Invalid response from server');
      }
      if (!res.ok) {
        const err = data as { error?: { message?: string } };
        throw new Error(
          err?.error?.message ?? 'Failed to load resolution queue'
        );
      }
      const payload = data as { items?: unknown[] };
      setItems(
        Array.isArray(payload?.items)
          ? (payload.items as PendingResolution[])
          : []
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load queue');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const pendingCount = useMemo(
    () => items.filter((i) => i.resolutionReviewStatus === 'pending').length,
    [items]
  );

  const act = useCallback(
    async (id: string, action: 'approve' | 'reject') => {
      setSubmittingId(id);
      try {
        const res = await fetch(`/api/admin/resolutions/${id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        });
        let data: unknown;
        try {
          data = await res.json();
        } catch {
          throw new Error(`Invalid response for ${action} on question ${id}`);
        }
        if (!res.ok) {
          const err = data as { error?: { message?: string } };
          throw new Error(err?.error?.message ?? 'Action failed');
        }
        toast.success(action === 'approve' ? 'Approved' : 'Rejected');
        await fetchQueue();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Action failed');
      } finally {
        setSubmittingId(null);
      }
    },
    [fetchQueue]
  );

  return (
    <div className="mx-auto w-full max-w-5xl p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-bold text-2xl">Resolution Review Queue</h1>
          <p className="text-muted-foreground">
            Low-confidence resolutions requiring manual approval before markets
            resolve.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => fetchQueue()}
            disabled={loading}
            title="Refresh queue"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
          <div
            className={cn(
              'inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm',
              pendingCount > 0 ? 'border-yellow-500/30 bg-yellow-500/10' : ''
            )}
          >
            <ShieldAlert className="h-4 w-4" />
            <span>{pendingCount} pending</span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-6 text-muted-foreground">
          No pending resolution reviews.
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((q) => (
            <div
              key={q.id}
              className="rounded-lg border border-border bg-card p-5"
            >
              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-muted-foreground text-xs">
                      <span>Q{q.questionNumber}</span>
                      <span>•</span>
                      <span
                        className={cn(
                          'rounded px-1.5 py-0.5 font-medium',
                          q.outcome
                            ? 'bg-green-500/10 text-green-600'
                            : 'bg-red-500/10 text-red-600'
                        )}
                      >
                        {q.outcome ? 'YES' : 'NO'}
                      </span>
                      <span>•</span>
                      <span>
                        {q.resolutionDate
                          ? formatDateTime(q.resolutionDate)
                          : 'n/a'}
                      </span>
                      {q.resolutionConfidence !== null ? (
                        <>
                          <span>•</span>
                          <span>
                            {(q.resolutionConfidence * 100).toFixed(0)}%
                            confidence
                          </span>
                        </>
                      ) : null}
                    </div>
                    <div className="mt-1 line-clamp-2 font-medium">
                      {q.text}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {q.resolutionProofUrl ? (
                      <a
                        href={q.resolutionProofUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary text-sm hover:underline"
                      >
                        Proof <ExternalLink className="h-4 w-4" />
                      </a>
                    ) : null}
                  </div>
                </div>

                {q.resolutionDescription ? (
                  <div className="rounded-md bg-muted/30 p-3 text-sm">
                    {q.resolutionDescription}
                  </div>
                ) : (
                  <div className="rounded-md bg-muted/30 p-3 text-muted-foreground text-sm">
                    No proof/description stored yet.
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Button
                    disabled={submittingId === q.id}
                    onClick={() => act(q.id, 'approve')}
                  >
                    {submittingId === q.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Approve
                  </Button>
                  <Button
                    variant="outline"
                    className="border-red-500/30 text-red-600 hover:bg-red-500/10"
                    disabled={submittingId === q.id}
                    onClick={() => act(q.id, 'reject')}
                  >
                    {submittingId === q.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Reject
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
