'use client';

import type { UserPredictionPosition } from '@babylon/shared';
import { cn } from '@babylon/shared';
import { RefreshCw, Wallet } from 'lucide-react';
import { PerpPositionsList } from '@/components/markets/PerpPositionsList';
import { PredictionPositionsList } from '@/components/markets/PredictionPositionsList';
import type { PortfolioBreakdownSnapshot } from '@/hooks/usePortfolioPnL';
import type { DisplayPerpPosition } from '@/types/markets';
import { formatBalance } from '../../_lib/formatters';

function formatSignedBalance(value: number): string {
  if (value === 0) return formatBalance(0);
  const sign = value > 0 ? '+' : '-';
  return `${sign}${formatBalance(Math.abs(value))}`;
}

/** Props for the TerminalPortfolio component */
interface TerminalPortfolioProps {
  authenticated: boolean;
  onLogin: () => void;
  onRequestBuyPoints?: (() => void) | null;
  balance: number;
  balanceLoading: boolean;
  portfolio: PortfolioBreakdownSnapshot | null;
  portfolioLoading: boolean;
  portfolioError: string | null;
  onRefresh: () => void;
  /** When true, disables refresh button (e.g., during cooldown) without showing loading spinner */
  refreshDisabled?: boolean;
  perpPositions: DisplayPerpPosition[];
  predictionPositions: UserPredictionPosition[];
  onPerpPositionClosed: () => Promise<void>;
  onPredictionPositionSold: () => Promise<void>;
}

/** Helper to format portfolio values with loading state */
function formatPortfolioValue(
  isLoading: boolean,
  portfolio: PortfolioBreakdownSnapshot | null,
  getValue: (p: PortfolioBreakdownSnapshot) => number | string,
  formatter: (v: number) => string = formatBalance
): string {
  if (isLoading || !portfolio) return '—';
  const value = getValue(portfolio);
  return typeof value === 'number' ? formatter(value) : value;
}

function StatCard({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-background/30 px-3 py-2">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
        {label}
      </div>
      <div
        className={cn('mt-1 font-mono text-sm tabular-nums', valueClassName)}
      >
        {value}
      </div>
    </div>
  );
}

export function TerminalPortfolio({
  authenticated,
  onLogin,
  onRequestBuyPoints,
  balance,
  balanceLoading,
  portfolio,
  portfolioLoading,
  portfolioError,
  onRefresh,
  refreshDisabled = false,
  perpPositions,
  predictionPositions,
  onPerpPositionClosed,
  onPredictionPositionSold,
}: TerminalPortfolioProps) {
  if (!authenticated) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div className="max-w-md text-muted-foreground text-sm">
          <div className="mb-3 font-semibold text-foreground">
            Log in to view your portfolio
          </div>
          <button
            type="button"
            onClick={onLogin}
            className="mt-2 rounded bg-foreground px-4 py-2 font-semibold text-background text-sm transition-colors hover:opacity-90"
          >
            Log In
          </button>
        </div>
      </div>
    );
  }

  const pnlValueClass =
    (portfolio?.totalPnL ?? 0) >= 0 ? 'text-green-500' : 'text-red-500';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-white/5 border-b bg-background/20 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-semibold text-foreground text-sm">
              <Wallet className="h-4 w-4 text-muted-foreground" />
              Portfolio
            </div>
            <div className="mt-0.5 text-muted-foreground text-xs">
              Balance, PnL, positions
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onRequestBuyPoints && (
              <button
                type="button"
                onClick={onRequestBuyPoints}
                className="rounded bg-muted/20 px-2 py-1 font-semibold text-[10px] text-muted-foreground uppercase tracking-wider transition-colors hover:bg-muted/30 hover:text-foreground"
              >
                Buy
              </button>
            )}
            <button
              type="button"
              onClick={
                !portfolioLoading && !refreshDisabled ? onRefresh : undefined
              }
              disabled={portfolioLoading || refreshDisabled}
              className={cn(
                'inline-flex items-center gap-1 rounded bg-muted/20 px-2 py-1 font-semibold text-[10px] uppercase tracking-wider transition-colors',
                portfolioLoading || refreshDisabled
                  ? 'cursor-not-allowed text-muted-foreground opacity-50'
                  : 'text-foreground hover:bg-muted/30'
              )}
              aria-label="Refresh portfolio"
              aria-busy={portfolioLoading}
              title={refreshDisabled ? 'Please wait before refreshing again' : 'Refresh'}
            >
              <RefreshCw
                className={cn(
                  'h-3.5 w-3.5',
                  portfolioLoading && 'animate-spin'
                )}
              />
              Refresh
            </button>
          </div>
        </div>

        {portfolioError && (
          <div className="mt-2 rounded border border-red-500/20 bg-red-500/10 px-3 py-2 text-red-200 text-xs">
            {portfolioError}
          </div>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
          <StatCard
            label="Wallet (spendable)"
            value={balanceLoading ? '—' : formatBalance(balance)}
          />
          <StatCard
            label="Total PnL"
            value={formatPortfolioValue(
              portfolioLoading,
              portfolio,
              (p) => p.totalPnL,
              formatSignedBalance
            )}
            valueClassName={pnlValueClass}
          />
          <StatCard
            label="Total Assets"
            value={formatPortfolioValue(
              portfolioLoading,
              portfolio,
              (p) => p.totalAssets
            )}
          />
          <StatCard
            label="Available"
            value={formatPortfolioValue(
              portfolioLoading,
              portfolio,
              (p) => p.available
            )}
          />
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
          <StatCard
            label="Agents"
            value={formatPortfolioValue(
              portfolioLoading,
              portfolio,
              (p) => p.agents
            )}
          />
          <StatCard
            label="Positions"
            value={formatPortfolioValue(
              portfolioLoading,
              portfolio,
              (p) => p.positions
            )}
          />
          <StatCard
            label="Agent Count"
            value={formatPortfolioValue(portfolioLoading, portfolio, (p) =>
              p.agentCount.toLocaleString()
            )}
          />
          <StatCard
            label="Original"
            value={formatPortfolioValue(
              portfolioLoading,
              portfolio,
              (p) => p.originalAmount
            )}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto overscroll-contain p-3">
        <div className="space-y-3">
          {perpPositions.length === 0 && predictionPositions.length === 0 ? (
            <div className="flex h-[140px] items-center justify-center rounded border border-white/10 bg-background/20 text-muted-foreground text-sm">
              No open positions yet.
            </div>
          ) : (
            <>
              {perpPositions.length > 0 && (
                <div className="rounded border border-white/10 bg-background/10 p-2">
                  <div className="px-1 pb-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                    Perps ({perpPositions.length})
                  </div>
                  <PerpPositionsList
                    positions={perpPositions}
                    density="compact"
                    onPositionClosed={onPerpPositionClosed}
                  />
                </div>
              )}

              {predictionPositions.length > 0 && (
                <div className="rounded border border-white/10 bg-background/10 p-2">
                  <div className="px-1 pb-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                    Predictions ({predictionPositions.length})
                  </div>
                  <PredictionPositionsList
                    positions={predictionPositions}
                    density="compact"
                    onPositionSold={onPredictionPositionSold}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
