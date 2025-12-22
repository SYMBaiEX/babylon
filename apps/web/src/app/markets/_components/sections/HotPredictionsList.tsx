'use client';

import { TrendingUp } from 'lucide-react';
import { memo } from 'react';
import type { PredictionMarket } from '@/types/markets';
import type { TopPrediction } from '../../_hooks';
import { HotPredictionCard } from '../cards';

interface HotPredictionsListProps {
  predictions: TopPrediction[];
  onPredictionClick: (prediction: PredictionMarket) => void;
}

/**
 * Section component displaying hot/trending prediction markets.
 * Shows top predictions by volume (total shares).
 * Memoized to prevent unnecessary re-renders when parent state changes.
 */
export const HotPredictionsList = memo(function HotPredictionsList({
  predictions,
  onPredictionClick,
}: HotPredictionsListProps) {
  return (
    <div className="rounded-lg border border-border bg-card/50 p-4 backdrop-blur">
      <h2 className="mb-3 flex items-center gap-2 font-bold text-lg">
        <TrendingUp className="h-5 w-5 text-purple-600" />
        Hot Predictions
      </h2>
      {predictions.length > 0 ? (
        <div className="space-y-2">
          {predictions.map((prediction) => (
            <HotPredictionCard
              key={`prediction-${prediction.id}`}
              prediction={prediction}
              onClick={onPredictionClick}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg bg-muted/30 p-6 text-center">
          <p className="text-muted-foreground text-sm">
            No active predictions yet.
          </p>
        </div>
      )}
    </div>
  );
});
