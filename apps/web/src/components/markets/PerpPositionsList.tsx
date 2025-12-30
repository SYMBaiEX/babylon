'use client';

import { calculateUnrealizedPnL, cn } from '@babylon/shared';
import { AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useMarketPrices } from '@/hooks/useMarketPrices';
import { usePerpTrade } from '@/hooks/usePerpTrade';
import { invalidatePerpMarketsCache } from '@/stores/perpMarketsStore';
import type { DisplayPerpPosition } from '@/types/markets';
import {
  type ClosePerpDetails,
  TradeConfirmationDialog,
} from './TradeConfirmationDialog';

/**
 * Alias for DisplayPerpPosition for local usage.
 */
type PerpPosition = DisplayPerpPosition;

/**
 * Perpetual positions list component for displaying and managing open positions.
 *
 * Displays a list of open perpetual positions with real-time price updates via SSE.
 * Shows position details including entry price, current price, PnL, and liquidation
 * price. Includes close position functionality with confirmation dialog.
 *
 * Features:
 * - Position list with real-time prices
 * - Unrealized PnL calculation
 * - Liquidation price display
 * - Close position with confirmation
 * - Loading states during close
 * - Toast notifications for success/error
 *
 * @param props - PerpPositionsList component props
 * @returns Perpetual positions list element
 *
 * @example
 * ```tsx
 * <PerpPositionsList
 *   positions={userPositions}
 *   onPositionClosed={() => refreshPositions()}
 * />
 * ```
 */
interface PerpPositionsListProps {
  positions: PerpPosition[];
  onPositionClosed?: () => void;
}

export function PerpPositionsList({
  positions,
  onPositionClosed,
}: PerpPositionsListProps) {
  const [closingId, setClosingId] = useState<string | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [pendingClose, setPendingClose] = useState<{
    position: PerpPosition;
    currentPrice: number;
    pnl: number;
    pnlPercent: number;
  } | null>(null);
  const { getAccessToken } = useAuth();
  const { closePosition: closePerpPosition } = usePerpTrade({
    getAccessToken,
  });

  const tickers = useMemo(
    () => positions.map((pos) => pos.ticker),
    [positions]
  );
  const livePrices = useMarketPrices(tickers);

  // Pre-calculate PnL for all positions to avoid recalculating during render
  const positionsWithPnL = useMemo(
    () =>
      positions.map((position) => {
        const livePrice = livePrices.get(position.ticker)?.price;
        const currentPrice = livePrice ?? position.currentPrice;
        const { pnl, pnlPercent } = calculateUnrealizedPnL(
          position.entryPrice,
          currentPrice,
          position.side,
          position.size
        );
        const liquidationDistance =
          position.side === 'long'
            ? ((currentPrice - position.liquidationPrice) / currentPrice) * 100
            : ((position.liquidationPrice - currentPrice) / currentPrice) * 100;
        return {
          position,
          currentPrice,
          pnl,
          pnlPercent,
          liquidationDistance,
          isNearLiquidation: liquidationDistance < 5,
        };
      }),
    [positions, livePrices]
  );

  const handleCloseClick = useCallback(
    (
      position: PerpPosition,
      currentPrice: number,
      pnl: number,
      pnlPercent: number
    ) => {
      setPendingClose({ position, currentPrice, pnl, pnlPercent });
      setConfirmDialogOpen(true);
    },
    []
  );

  const handleConfirmClose = useCallback(async () => {
    if (!pendingClose) return;

    setClosingId(pendingClose.position.id);
    setConfirmDialogOpen(false);

    const data = await closePerpPosition(pendingClose.position.id);
    const pnl =
      typeof data?.pnl === 'number'
        ? data.pnl
        : typeof data?.realizedPnL === 'number'
          ? data.realizedPnL
          : 0;

    toast.success('Position closed!', {
      description: `${pendingClose.position.ticker}: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} PnL`,
    });

    // Invalidate cache to ensure fresh data on next fetch
    invalidatePerpMarketsCache();
    await onPositionClosed?.();
    setClosingId(null);
    setPendingClose(null);
  }, [closePerpPosition, onPositionClosed, pendingClose]);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (positions.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <p>No open positions</p>
        <p className="mt-1 text-sm">
          Open a long or short position to get started
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {positionsWithPnL.map(
        ({
          position,
          currentPrice,
          pnl,
          pnlPercent,
          liquidationDistance,
          isNearLiquidation,
        }) => {
          const isClosing = closingId === position.id;

          return (
            <div
              key={position.id}
              className={cn(
                'rounded p-4 transition-all',
                isNearLiquidation ? 'bg-red-600/10' : 'bg-muted/40'
              )}
            >
              {/* Header */}
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'flex items-center gap-1 rounded px-2 py-1 font-bold text-xs',
                      position.side === 'long'
                        ? 'bg-green-600/20 text-green-600'
                        : 'bg-red-600/20 text-red-600'
                    )}
                  >
                    {position.side === 'long' ? (
                      <TrendingUp size={12} />
                    ) : (
                      <TrendingDown size={12} />
                    )}
                    {position.leverage}x {position.side.toUpperCase()}
                  </span>
                  <span className="font-bold text-foreground">
                    ${position.ticker}
                  </span>
                </div>

                <div className="text-right">
                  <div
                    className={cn(
                      'font-bold text-lg',
                      pnl >= 0 ? 'text-green-600' : 'text-red-600'
                    )}
                  >
                    {pnl >= 0 ? '+' : ''}
                    {formatPrice(pnl)}
                  </div>
                  <div
                    className={cn(
                      'text-xs',
                      pnl >= 0 ? 'text-green-600' : 'text-red-600'
                    )}
                  >
                    {pnl >= 0 ? '+' : ''}
                    {pnlPercent.toFixed(2)}%
                  </div>
                </div>
              </div>

              {/* Liquidation Warning */}
              {isNearLiquidation && (
                <div className="mb-3 flex items-center gap-2 rounded bg-red-600/20 p-2">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 text-red-600" />
                  <p className="font-medium text-red-600 text-xs">
                    Near liquidation! {liquidationDistance.toFixed(2)}% away
                  </p>
                </div>
              )}

              {/* Stats Grid */}
              <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-muted-foreground">Entry</div>
                  <div className="font-medium text-foreground">
                    {formatPrice(position.entryPrice)}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Current</div>
                  <div className="font-medium text-foreground">
                    {formatPrice(currentPrice)}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Liquidation</div>
                  <div className="font-bold text-red-600">
                    {formatPrice(position.liquidationPrice)}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Size</div>
                  <div className="font-medium text-foreground">
                    {formatPrice(position.size)}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Funding Paid</div>
                  <div
                    className={cn(
                      'font-medium',
                      position.fundingPaid >= 0
                        ? 'text-red-600'
                        : 'text-green-600'
                    )}
                  >
                    {position.fundingPaid >= 0 ? '-' : '+'}
                    {formatPrice(Math.abs(position.fundingPaid))}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Opened</div>
                  <div className="font-medium text-foreground">
                    {formatDate(position.openedAt)}
                  </div>
                </div>
              </div>

              {/* Close Button */}
              <button
                onClick={() =>
                  handleCloseClick(position, currentPrice, pnl, pnlPercent)
                }
                disabled={isClosing}
                className={cn(
                  'w-full cursor-pointer rounded py-2 font-medium transition-all',
                  isNearLiquidation
                    ? 'bg-red-600 text-primary-foreground hover:bg-red-700'
                    : 'bg-muted text-foreground hover:bg-muted',
                  isClosing && 'cursor-not-allowed opacity-50'
                )}
              >
                {isClosing ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Closing...
                  </span>
                ) : (
                  'Close Position'
                )}
              </button>
            </div>
          );
        }
      )}

      {/* Confirmation Dialog */}
      <TradeConfirmationDialog
        open={confirmDialogOpen}
        onOpenChange={setConfirmDialogOpen}
        onConfirm={handleConfirmClose}
        isSubmitting={closingId !== null}
        tradeDetails={
          pendingClose
            ? ({
                type: 'close-perp',
                ticker: pendingClose.position.ticker,
                side: pendingClose.position.side,
                size: pendingClose.position.size,
                leverage: pendingClose.position.leverage,
                entryPrice: pendingClose.position.entryPrice,
                currentPrice: pendingClose.currentPrice,
                unrealizedPnL: pendingClose.pnl,
                unrealizedPnLPercent: pendingClose.pnlPercent,
              } as ClosePerpDetails)
            : null
        }
      />
    </div>
  );
}
