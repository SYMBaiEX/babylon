'use client';

import { cn, formatCurrency, formatNumberWithSeparators } from '@babylon/shared';
import { ArrowUpDown, Clock } from 'lucide-react';
import { memo } from 'react';
import type { PredictionMarketWithPosition } from '@/types/markets';
import { calculateSharePercentages, getDaysLeft } from '../../_lib/formatters';

interface PredictionMarketCardProps {
  prediction: PredictionMarketWithPosition;
  onClick: (prediction: PredictionMarketWithPosition) => void;
}

/**
 * Card component for displaying an active prediction market.
 * Shows question, probabilities, time remaining, and user position if any.
 */
export const PredictionMarketCard = memo(function PredictionMarketCard({
  prediction,
  onClick,
}: PredictionMarketCardProps) {
  const { yesPercent, noPercent, totalShares } = calculateSharePercentages(
    prediction.yesShares,
    prediction.noShares
  );
  const daysLeft = getDaysLeft(prediction.resolutionDate);
  const hasPosition =
    prediction.userPosition !== null && prediction.userPosition !== undefined;

  return (
    <button
      type="button"
      onClick={() => onClick(prediction)}
      className={cn(
        'w-full cursor-pointer rounded p-3 text-left transition-all',
        hasPosition
          ? 'bg-[#0066FF]/5 hover:bg-[#0066FF]/20'
          : 'bg-muted/30 hover:bg-muted'
      )}
    >
      <div className="mb-2 font-medium">
        {prediction.text}
        {prediction.oracleCommitTxHash && (
          <span
            className="ml-2 text-green-600 text-xs"
            title="Committed to oracle"
          >
            ✓ Committed
          </span>
        )}
        {prediction.oracleRevealTxHash && (
          <span
            className="ml-2 text-purple-600 text-xs"
            title="Revealed on-chain"
          >
            ✓ Revealed
          </span>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3 text-xs">
          <div className="flex gap-3 text-muted-foreground">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {daysLeft !== null ? `${daysLeft}d` : 'Soon'}
            </div>
            <div className="flex items-center gap-1">
              <ArrowUpDown className="h-3 w-3" />
              {totalShares > 0 ? formatNumberWithSeparators(totalShares) : '0'}
            </div>
          </div>
          <div className="flex gap-2">
            <div className="font-medium text-green-600">
              {yesPercent.toFixed(1)}% YES
            </div>
            <div className="font-medium text-red-600">
              {noPercent.toFixed(1)}% NO
            </div>
          </div>
        </div>
        {hasPosition && prediction.userPosition && (
          <div className="flex items-center gap-2 text-xs">
            <span
              className={cn(
                'rounded px-2 py-0.5 font-medium',
                prediction.userPosition.side === 'YES'
                  ? 'bg-green-600/20 text-green-600'
                  : 'bg-red-600/20 text-red-600'
              )}
            >
              {prediction.userPosition.side}{' '}
              {prediction.userPosition.shares.toFixed(2)}
            </span>
            <span
              className={cn(
                'font-medium',
                prediction.userPosition.unrealizedPnL >= 0
                  ? 'text-green-600'
                  : 'text-red-600'
              )}
            >
              {prediction.userPosition.unrealizedPnL >= 0 ? '+' : ''}
              {formatCurrency(prediction.userPosition.unrealizedPnL, {
                useThousandsSeparator: true,
              })}
            </span>
          </div>
        )}
      </div>
    </button>
  );
});
