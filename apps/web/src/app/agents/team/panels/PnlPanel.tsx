'use client';

import type { PnlTagData } from '@babylon/shared';
import { cn } from '@babylon/shared';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { PanelViewMoreLink } from './PanelViewMoreLink';

interface PnlPanelProps {
  data: PnlTagData;
  type: 'agent-pnl' | 'owner-pnl';
}

export function PnlPanel({ data, type }: PnlPanelProps) {
  const {
    ownerName,
    agentName,
    balance,
    lifetimePnL,
    predictionPositions,
    perpPositions,
    recentTrades,
  } = data;

  const isPositivePnL = lifetimePnL >= 0;

  // Determine the display name based on type
  const displayName =
    type === 'owner-pnl'
      ? `${ownerName || 'Your'} P&L`
      : `${agentName || 'Agent'} P&L`;

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div>
        <h3 className="font-semibold text-sm">{displayName}</h3>
      </div>

      {/* Balance & P&L */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-muted-foreground text-xs">Balance</p>
          <p className="mt-1 font-bold text-lg">${balance.toFixed(2)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-muted-foreground text-xs">Lifetime P&L</p>
          <p
            className={cn(
              'mt-1 flex items-center gap-1 font-bold text-lg',
              isPositivePnL ? 'text-green-500' : 'text-red-500'
            )}
          >
            {isPositivePnL ? (
              <TrendingUp className="h-4 w-4" />
            ) : (
              <TrendingDown className="h-4 w-4" />
            )}
            ${Math.abs(lifetimePnL).toFixed(2)}
          </p>
        </div>
      </div>

      {/* Prediction Positions */}
      {predictionPositions && predictionPositions.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Prediction Positions</h4>
          {predictionPositions.map((pos) => (
            <div
              key={pos.id}
              className="rounded-lg border border-border bg-muted/30 p-3"
            >
              <p className="line-clamp-1 text-sm">
                {pos.question || `Market ${pos.marketId}`}
              </p>
              <div className="mt-1.5 flex items-center justify-between text-xs">
                <span
                  className={cn(
                    'font-medium',
                    pos.side === 'YES' ? 'text-green-500' : 'text-red-500'
                  )}
                >
                  {pos.side}
                </span>
                <span className="text-muted-foreground">
                  {pos.shares.toFixed(2)} shares
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Perp Positions */}
      {perpPositions && perpPositions.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Perp Positions</h4>
          {perpPositions.map((pos) => (
            <div
              key={pos.id}
              className="rounded-lg border border-border bg-muted/30 p-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">{pos.ticker}</span>
                <span
                  className={cn(
                    'font-medium text-xs',
                    pos.side === 'long' ? 'text-green-500' : 'text-red-500'
                  )}
                >
                  {pos.side.toUpperCase()}
                </span>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-muted-foreground text-xs">
                <span>Size: {pos.size.toFixed(4)}</span>
                {pos.entryPrice != null && (
                  <span>Entry: ${pos.entryPrice.toFixed(2)}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recent Trades (agent only) */}
      {type === 'agent-pnl' && recentTrades && recentTrades.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Recent Trades</h4>
          {recentTrades.map((trade, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-2 text-xs"
            >
              <span className="font-medium">{trade.action}</span>
              <span className="text-muted-foreground">{trade.ticker}</span>
              <span>${trade.amount.toFixed(2)}</span>
              {trade.pnl !== null && (
                <span
                  className={cn(
                    'font-medium',
                    trade.pnl >= 0 ? 'text-green-500' : 'text-red-500'
                  )}
                >
                  {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {(!predictionPositions || predictionPositions.length === 0) &&
        (!perpPositions || perpPositions.length === 0) && (
          <p className="text-center text-muted-foreground text-sm">
            No open positions
          </p>
        )}

      {/* View Profile Link */}
      <PanelViewMoreLink href="/profile">View full portfolio</PanelViewMoreLink>
    </div>
  );
}
