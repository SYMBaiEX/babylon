/**
 * Admin Resolution Review Queue
 *
 * Lists low-confidence prediction question resolutions that require manual review.
 */

'use client';

import { cn } from '@babylon/shared';
import { ExternalLink, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

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
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? 'Failed to load resolution queue');
      }
      setItems(Array.isArray(data?.items) ? data.items : []);
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
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(data?.error ?? 'Action failed');
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
                    <div className="text-muted-foreground text-xs">
                      Q{q.questionNumber} • {q.resolutionDate ?? 'n/a'} •{' '}
                      {q.resolutionReviewStatus}
                      {q.resolutionConfidence !== null
                        ? ` • confidence ${(q.resolutionConfidence * 100).toFixed(0)}%`
                        : ''}
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
                    Approve
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={submittingId === q.id}
                    onClick={() => act(q.id, 'reject')}
                  >
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
