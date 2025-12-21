'use client';

import { Clock } from 'lucide-react';
import { memo } from 'react';
import { calculateSharePercentages, getDaysLeft } from '../../_lib/formatters';
import type { PredictionMarket } from '@/types/markets';

interface HotPredictionCardProps {
  prediction: PredictionMarket;
  onClick: (prediction: PredictionMarket) => void;
}

/**
 * Card component for displaying a hot/trending prediction market.
 * Memoized for performance as prediction data changes infrequently.
 */
export const HotPredictionCard = memo(function HotPredictionCard({
  prediction,
  onClick,
}: HotPredictionCardProps) {
  const { yesPercent, noPercent } = calculateSharePercentages(
    prediction.yesShares,
    prediction.noShares
  );
  const daysLeft = getDaysLeft(prediction.resolutionDate);

  return (
    <button
      type="button"
      onClick={() => onClick(prediction)}
      className="w-full cursor-pointer rounded-lg border border-transparent bg-muted/30 p-3 text-left transition-all hover:border-purple-500/30 hover:bg-muted"
    >
      <div className="mb-2 line-clamp-2 font-medium text-sm">
        {prediction.text}
        {prediction.oracleCommitTxHash && (
          <span
            className="ml-2 text-green-600 text-xs"
            title="Committed to oracle"
          >
            ✓
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-green-600">
            {yesPercent.toFixed(0)}% YES
          </span>
          <span className="text-muted-foreground">•</span>
          <span className="font-bold text-red-600">
            {noPercent.toFixed(0)}% NO
          </span>
        </div>
        {daysLeft !== null && (
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3 w-3" />
            {daysLeft}d
          </div>
        )}
      </div>
    </button>
  );
});

