'use client';

import type { UserPredictionPosition } from '@babylon/shared';
import { cn, formatCurrency, logger } from '@babylon/shared';
import { usePrivy } from '@privy-io/react-auth';
import { Bot, CheckCircle, XCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type {
  ApiErrorResponse,
  SellSharesSuccessResponse,
} from '@/types/markets';
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
  density?: 'default' | 'compact';
}

export function PredictionPositionsList({
  positions,
  onPositionSold,
  density = 'default',
}: PredictionPositionsListProps) {
  const { getAccessToken } = usePrivy();
  const compact = density === 'compact';
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
      const pnlSign = pnl >= 0 ? '+' : '-';
      toast.success('Shares sold!', {
        description: `Sold ${position.shares.toFixed(2)} ${position.side} shares for ${pnlSign}${formatCurrency(
          Math.abs(pnl),
          { useThousandsSeparator: true }
        )} PnL`,
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

  /** Use shared formatCurrency with 3 decimals for prediction prices */
  const formatPrice = (price: number) =>
    formatCurrency(price, { decimals: 3, useThousandsSeparator: true });

  if (positions.length === 0) {
    return (
      <div
        className={cn(
          'text-center text-muted-foreground',
          compact ? 'py-6' : 'py-8'
        )}
      >
        <p>No prediction positions</p>
        <p className={cn(compact ? 'mt-1 text-xs' : 'mt-1 text-sm')}>
          Buy YES or NO shares to start betting
        </p>
      </div>
    );
  }

  return (
    <div className={cn(compact ? 'space-y-2' : 'space-y-3')}>
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
          <div
            key={position.id}
            className={cn('rounded bg-muted/40', compact ? 'p-3' : 'p-4')}
          >
            <div
              className={cn(
                'flex items-center justify-between',
                compact ? 'mb-2' : 'mb-3'
              )}
            >
              <div className="flex items-center gap-2">
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
                {/* Agent position badge */}
                {position.isAgentPosition && (
                  <span className="flex items-center gap-1 rounded bg-purple-600/20 px-2 py-1 font-medium text-purple-500 text-xs">
                    <Bot size={12} />
                    {position.agentName || 'Agent'}
                  </span>
                )}
              </div>

              <div className="text-right">
                <div
                  className={cn(
                    compact ? 'font-bold text-base' : 'font-bold text-lg',
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

            <p
              className={cn(
                'font-medium text-foreground',
                compact
                  ? 'mb-2 text-sm leading-snug md:text-xs'
                  : 'mb-3 text-sm'
              )}
            >
              {position.question}
            </p>

            <div
              className={cn(
                'grid grid-cols-2 text-xs',
                compact ? 'mb-2 gap-1.5' : 'mb-3 gap-2'
              )}
            >
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
                className={cn(
                  'w-full cursor-pointer rounded bg-muted font-medium text-foreground transition-all hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50',
                  compact ? 'py-1.5 text-sm md:text-xs' : 'py-2 text-sm'
                )}
              >
                {isSelling
                  ? 'Selling...'
                  : position.shares < 0.01
                    ? 'Position Too Small'
                    : 'Sell Shares'}
              </button>
            ) : (
              <div
                className={cn(
                  'py-2 text-center font-medium',
                  compact ? 'text-sm md:text-xs' : 'text-sm'
                )}
              >
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
