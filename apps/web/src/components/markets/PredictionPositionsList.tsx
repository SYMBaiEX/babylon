'use client';

import type { UserPredictionPosition } from '@babylon/shared';
import { cn, logger } from '@babylon/shared';
import { usePrivy } from '@privy-io/react-auth';
import { CheckCircle, XCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { ApiErrorResponse, SellSharesSuccessResponse } from '@/types/markets';
import {
  type SellPredictionDetails,
  TradeConfirmationDialog,
} from './TradeConfirmationDialog';

/**
 * Alias for UserPredictionPosition for local usage.
 */
type PredictionPosition = UserPredictionPosition;

/**
 * Prediction positions list component for displaying and managing prediction positions.
 *
 * Displays a list of open prediction market positions with current prices and PnL.
 * Shows position details including shares, average price, current value, and
 * unrealized profit/loss. Includes sell functionality with confirmation dialog.
 *
 * Features:
 * - Position list with current prices
 * - Unrealized PnL calculation
 * - Sell position with confirmation
 * - Loading states during sell
 * - Toast notifications for success/error
 * - Empty state message
 *
 * @param props - PredictionPositionsList component props
 * @returns Prediction positions list element
 *
 * @example
 * ```tsx
 * <PredictionPositionsList
 *   positions={userPositions}
 *   onPositionSold={() => refreshPositions()}
 * />
 * ```
 */
interface PredictionPositionsListProps {
  positions: PredictionPosition[];
  onPositionSold?: () => void;
}

export function PredictionPositionsList({
  positions,
  onPositionSold,
}: PredictionPositionsListProps) {
  const { getAccessToken } = usePrivy();
  const [sellingId, setSellingId] = useState<string | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [pendingSell, setPendingSell] = useState<{
    position: PredictionPosition;
    expectedValue: number;
    unrealizedPnL: number;
    unrealizedPnLPercent: number;
  } | null>(null);

  const handleSellClick = (
    position: PredictionPosition,
    expectedValue: number,
    unrealizedPnL: number,
    unrealizedPnLPercent: number
  ) => {
    setPendingSell({
      position,
      expectedValue,
      unrealizedPnL,
      unrealizedPnLPercent,
    });
    setConfirmDialogOpen(true);
  };

  const handleConfirmSell = async () => {
    if (!pendingSell) return;

    const position = pendingSell.position;
    setSellingId(position.id);
    setConfirmDialogOpen(false);

    const token = await getAccessToken();
    if (!token) {
      toast.error('Authentication required. Please log in.');
      setSellingId(null);
      setPendingSell(null);
      return;
    }

    try {
      const response = await fetch(
        `/api/markets/predictions/${position.marketId}/sell`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            shares: position.shares,
            positionId: position.id,
          }),
        }
      );

      if (!response.ok) {
        const errorData: ApiErrorResponse = await response.json();
        const errorMessage =
          typeof errorData.error === 'object'
            ? (errorData.error.message ?? 'Failed to sell shares')
            : (errorData.error ?? errorData.message ?? 'Failed to sell shares');
        toast.error(errorMessage);
        return;
      }

      const data: SellSharesSuccessResponse = await response.json();
      const pnl = data.pnl;
      toast.success('Shares sold!', {
        description: `Sold ${position.shares.toFixed(2)} ${position.side} shares for ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} PnL`,
      });

      onPositionSold?.();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to sell shares';
      logger.error(
        'Failed to sell prediction shares',
        { marketId: position.marketId, positionId: position.id, error: err },
        'PredictionPositionsList'
      );
      toast.error(message);
    } finally {
      setSellingId(null);
      setPendingSell(null);
    }
  };

  const formatPrice = (price: number) => `$${price.toFixed(3)}`;

  if (positions.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <p>No prediction positions</p>
        <p className="mt-1 text-sm">Buy YES or NO shares to start betting</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {positions.map((position) => {
        const currentValue =
          position.currentValue ?? position.shares * position.currentPrice;
        const costBasis =
          position.costBasis ?? position.shares * position.avgPrice;
        const unrealizedPnL =
          position.unrealizedPnL ?? currentValue - costBasis;
        const pnlPercent =
          costBasis !== 0 ? (unrealizedPnL / costBasis) * 100 : 0;
        const isSelling = sellingId === position.id;

        return (
          <div key={position.id} className="rounded bg-muted/40 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span
                className={cn(
                  'flex items-center gap-1 rounded px-2 py-1 font-bold text-xs',
                  position.side === 'YES'
                    ? 'bg-green-600/20 text-green-600'
                    : 'bg-red-600/20 text-red-600'
                )}
              >
                {position.side === 'YES' ? (
                  <CheckCircle size={12} />
                ) : (
                  <XCircle size={12} />
                )}
                {position.side}
              </span>

              <div className="text-right">
                <div
                  className={cn(
                    'font-bold text-lg',
                    unrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'
                  )}
                >
                  {unrealizedPnL >= 0 ? '+' : ''}
                  {formatPrice(unrealizedPnL)}
                </div>
                <div
                  className={cn(
                    'text-xs',
                    unrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'
                  )}
                >
                  {unrealizedPnL >= 0 ? '+' : ''}
                  {pnlPercent.toFixed(2)}%
                </div>
              </div>
            </div>

            <p className="mb-3 font-medium text-foreground text-sm">
              {position.question}
            </p>

            <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
              <div>
                <div className="text-muted-foreground">Shares</div>
                <div className="font-medium text-foreground">
                  {position.shares.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Avg Cost</div>
                <div className="font-medium text-foreground">
                  {formatPrice(position.avgPrice)}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Current Price</div>
                <div className="font-medium text-foreground">
                  {formatPrice(position.currentPrice)}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Value</div>
                <div className="font-medium text-foreground">
                  {formatPrice(currentValue)}
                </div>
              </div>
            </div>

            {!position.resolved ? (
              <button
                onClick={() =>
                  handleSellClick(
                    position,
                    currentValue,
                    unrealizedPnL,
                    pnlPercent
                  )
                }
                disabled={isSelling || position.shares < 0.01}
                className="w-full cursor-pointer rounded bg-muted py-2 font-medium text-foreground transition-all hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSelling
                  ? 'Selling...'
                  : position.shares < 0.01
                    ? 'Position Too Small'
                    : 'Sell Shares'}
              </button>
            ) : (
              <div className="py-2 text-center font-medium text-sm">
                <span className="text-muted-foreground">Resolved: </span>
                <span
                  className={
                    position.resolution ? 'text-green-600' : 'text-red-600'
                  }
                >
                  {position.resolution ? 'YES' : 'NO'}
                </span>
              </div>
            )}
          </div>
        );
      })}

      {/* Confirmation Dialog */}
      <TradeConfirmationDialog
        open={confirmDialogOpen}
        onOpenChange={setConfirmDialogOpen}
        onConfirm={handleConfirmSell}
        isSubmitting={sellingId !== null}
        tradeDetails={
          pendingSell
            ? ({
                type: 'sell-prediction',
                question: pendingSell.position.question,
                side: pendingSell.position.side,
                shares: pendingSell.position.shares,
                avgPrice: pendingSell.position.avgPrice,
                currentPrice: pendingSell.position.currentPrice,
                expectedValue: pendingSell.expectedValue,
                unrealizedPnL: pendingSell.unrealizedPnL,
                unrealizedPnLPercent: pendingSell.unrealizedPnLPercent,
              } as SellPredictionDetails)
            : null
        }
      />
    </div>
  );
}
