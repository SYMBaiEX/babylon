'use client';

import { memo } from 'react';
import type { PredictionMarket } from '@/types/markets';

interface ResolvedPredictionCardProps {
  prediction: PredictionMarket;
}

/**
 * Card component for displaying a resolved prediction market.
 * Shows the question and final outcome with reduced opacity.
 */
export const ResolvedPredictionCard = memo(function ResolvedPredictionCard({
  prediction,
}: ResolvedPredictionCardProps) {
  return (
    <div className="rounded bg-muted/20 p-3 opacity-60">
      <div className="mb-2 font-medium">{prediction.text}</div>
      <div className="flex gap-2 text-xs">
        <span className="text-muted-foreground">Resolved:</span>
        <span
          className={
            prediction.resolvedOutcome
              ? 'font-bold text-green-600'
              : 'font-bold text-red-600'
          }
        >
          {prediction.resolvedOutcome ? 'YES' : 'NO'}
        </span>
      </div>
    </div>
  );
});

