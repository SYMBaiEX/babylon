'use client';

import type { PerpPosition, UserPredictionPosition } from '@babylon/shared';
import { PerpPositionsList } from '@/components/markets/PerpPositionsList';
import { PredictionPositionsList } from '@/components/markets/PredictionPositionsList';

interface PositionsOverviewProps {
  perpPositions: PerpPosition[];
  predictionPositions: UserPredictionPosition[];
  onPositionClosed: () => Promise<void>;
  onPositionSold: () => Promise<void>;
}

/**
 * Section component displaying user's open positions.
 * Shows both perpetual and prediction positions in a unified view.
 */
export function PositionsOverview({
  perpPositions,
  predictionPositions,
  onPositionClosed,
  onPositionSold,
}: PositionsOverviewProps) {
  const hasPositions =
    perpPositions.length > 0 || predictionPositions.length > 0;

  if (!hasPositions) return null;

  return (
    <div className="rounded-lg border border-[#0066FF]/20 bg-gradient-to-br from-[#0066FF]/10 to-purple-500/10 p-4">
      <h2 className="mb-3 flex items-center gap-2 font-bold text-lg">
        <div className="h-5 w-1 rounded-full bg-[#0066FF]" />
        Your Positions
      </h2>

      {perpPositions.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 font-semibold text-muted-foreground text-sm">
            PERPETUAL FUTURES ({perpPositions.length})
          </h3>
          <PerpPositionsList
            positions={perpPositions}
            onPositionClosed={onPositionClosed}
          />
        </div>
      )}

      {predictionPositions.length > 0 && (
        <div>
          <h3 className="mb-2 font-semibold text-muted-foreground text-sm">
            PREDICTIONS ({predictionPositions.length})
          </h3>
          <PredictionPositionsList
            positions={predictionPositions}
            onPositionSold={onPositionSold}
          />
        </div>
      )}
    </div>
  );
}
