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
  onPositionClick?: (marketId: string) => void;
  density?: 'default' | 'compact';
}

export function PredictionPositionsList({
  positions,
  onPositionSold,
  onPositionClick,
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
    <div className={cn(compact ? 'space-y-1.5' : 'space-y-2')}>
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
            className={cn(
              'rounded bg-muted/40',
              compact ? 'p-2' : 'p-2.5',
              onPositionClick && 'cursor-pointer hover:bg-muted/60'
            )}
            onClick={() => onPositionClick?.(position.marketId.toString())}
          >
            {/* Row 1: Side badge, question (truncated), PnL */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <span
                  className={cn(
                    'flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 font-bold text-[11px]',
                    position.side === 'YES'
                      ? 'bg-green-600/20 text-green-600'
                      : 'bg-red-600/20 text-red-600'
                  )}
                >
                  {position.side === 'YES' ? (
                    <CheckCircle size={10} />
                  ) : (
                    <XCircle size={10} />
                  )}
                  {position.side}
                </span>
                {position.isAgentPosition && (
                  <span className="flex shrink-0 items-center gap-0.5 rounded bg-muted px-1 py-0.5 font-medium text-[11px] text-muted-foreground">
                    <Bot size={10} />
                    {position.agentName || 'Agent'}
                  </span>
                )}
                <span className="truncate font-medium text-foreground text-xs">
                  {position.question}
                </span>
              </div>
              <span
                className={cn(
                  'shrink-0 font-bold text-xs',
                  unrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'
                )}
              >
                {unrealizedPnL >= 0 ? '+' : ''}
                {formatPrice(unrealizedPnL)}{' '}
                <span className="font-normal text-[11px]">
                  ({unrealizedPnL >= 0 ? '+' : ''}
                  {pnlPercent.toFixed(2)}%)
                </span>
              </span>
            </div>

            {/* Row 2: Stats + Sell/Resolved */}
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-x-2 text-muted-foreground text-xs">
                <span>
                  {position.shares.toFixed(2)}{' '}
                  <span className="font-medium text-foreground">shares</span>
                </span>
                <span className="text-muted-foreground/40">&middot;</span>
                <span>
                  Avg{' '}
                  <span className="font-medium text-foreground">
                    {formatPrice(position.avgPrice)}
                  </span>
                </span>
                <span className="text-muted-foreground/40">&middot;</span>
                <span>
                  Now{' '}
                  <span className="font-medium text-foreground">
                    {formatPrice(position.currentPrice)}
                  </span>
                </span>
                <span className="text-muted-foreground/40">&middot;</span>
                <span>
                  Val{' '}
                  <span className="font-medium text-foreground">
                    {formatPrice(currentValue)}
                  </span>
                </span>
              </div>
              {!position.resolved ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSellClick(
                      position,
                      currentValue,
                      unrealizedPnL,
                      pnlPercent
                    );
                  }}
                  disabled={isSelling || position.shares < 0.01}
                  className={cn(
                    'shrink-0 cursor-pointer rounded-full bg-muted px-3 py-0.5 font-medium text-foreground text-xs transition-all hover:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-50'
                  )}
                >
                  {isSelling
                    ? 'Selling...'
                    : position.shares < 0.01
                      ? 'Too Small'
                      : 'Sell'}
                </button>
              ) : (
                <span className="shrink-0 font-medium text-muted-foreground text-xs">
                  Resolved:{' '}
                  <span
                    className={
                      position.resolution ? 'text-green-600' : 'text-red-600'
                    }
                  >
                    {position.resolution ? 'YES' : 'NO'}
                  </span>
                </span>
              )}
            </div>
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
