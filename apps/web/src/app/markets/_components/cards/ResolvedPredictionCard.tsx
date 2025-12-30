'use client';

import { cn } from '@babylon/shared';
import { CheckCircle, Clock } from 'lucide-react';
import { memo, useMemo } from 'react';
import type { PredictionMarket } from '@/types/markets';

interface ResolvedPredictionCardProps {
  prediction: PredictionMarket;
}

/**
 * Card component for displaying a resolved or expired prediction market.
 * - Resolved: Shows the final outcome (YES/NO)
 * - Expired: Shows "Awaiting resolution" with elapsed time
 */
export const ResolvedPredictionCard = memo(function ResolvedPredictionCard({
  prediction,
}: ResolvedPredictionCardProps) {
  const isResolved = prediction.status === 'resolved';

  // Check if expired (date passed but not yet resolved)
  const isExpired = useMemo(() => {
    if (isResolved) return false;
    if (!prediction.resolutionDate) return false;
    return new Date(prediction.resolutionDate).getTime() <= Date.now();
  }, [isResolved, prediction.resolutionDate]);

  // Time since expiration
  const expiredSince = useMemo(() => {
    if (!isExpired || !prediction.resolutionDate) return null;
    const diff = Date.now() - new Date(prediction.resolutionDate).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    return 'Just now';
  }, [isExpired, prediction.resolutionDate]);

  return (
    <div
      className={cn(
        'rounded-lg border p-3',
        isResolved
          ? 'border-border/50 bg-muted/20 opacity-70'
          : 'border-amber-500/30 bg-amber-500/5'
      )}
    >
      <div className="mb-2 font-medium text-sm">{prediction.text}</div>

      {isResolved ? (
        // Resolved market - show outcome
        <div className="flex items-center gap-2 text-xs">
          <CheckCircle className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Resolved:</span>
          <span
            className={cn(
              'font-bold',
              prediction.resolvedOutcome
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400'
            )}
          >
            {prediction.resolvedOutcome ? 'YES' : 'NO'}
          </span>
        </div>
      ) : isExpired ? (
        // Expired but not resolved - awaiting resolution
        <div className="flex items-center gap-2 text-xs">
          <Clock className="h-3.5 w-3.5 text-amber-500" />
          <span className="text-amber-600 dark:text-amber-400">
            Expired {expiredSince} • Awaiting resolution
          </span>
        </div>
      ) : null}
    </div>
  );
});
