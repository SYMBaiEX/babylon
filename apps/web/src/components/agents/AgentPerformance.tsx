'use client';

import { cn } from '@babylon/shared';
import { Activity, DollarSign, TrendingDown, TrendingUp } from 'lucide-react';

/**
 * Agent performance component for displaying agent trading performance metrics.
 *
 * Displays comprehensive trading performance statistics including lifetime
 * PnL, total trades, profitable trades, and win rate. Shows detailed breakdown
 * and activity summary.
 *
 * Features:
 * - Lifetime PnL display
 * - Total trades count
 * - Profitable trades count
 * - Win rate percentage
 * - Detailed statistics breakdown
 * - Activity summary
 * - Color-coded metrics
 *
 * @param props - AgentPerformance component props
 * @returns Agent performance element
 *
 * @example
 * ```tsx
 * <AgentPerformance agent={agentData} />
 * ```
 */
interface AgentPerformanceProps {
  agent: {
    lifetimePnL: string;
    totalTrades: number;
    profitableTrades: number;
    winRate: number;
  };
}

export function AgentPerformance({ agent }: AgentPerformanceProps) {
  const pnl = parseFloat(agent.lifetimePnL);
  const isProfitable = pnl >= 0;
  const totalTrades = agent.totalTrades || 0;
  const profitableTrades = agent.profitableTrades || 0;
  const winRate = agent.winRate || 0;

  const stats = [
    {
      label: 'Lifetime P&L',
      value: pnl.toFixed(2),
      icon: isProfitable ? TrendingUp : TrendingDown,
      color: isProfitable ? 'text-green-600' : 'text-red-600',
    },
    {
      label: 'Total Trades',
      value: totalTrades.toString(),
      icon: Activity,
      color: 'text-blue-600',
    },
    {
      label: 'Profitable Trades',
      value: profitableTrades.toString(),
      icon: TrendingUp,
      color: 'text-green-600',
    },
    {
      label: 'Win Rate',
      value: `${(winRate * 100).toFixed(1)}%`,
      icon: DollarSign,
      color: 'text-purple-600',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((stat, idx) => (
          <div
            key={idx}
            className="rounded-lg border border-border bg-card/50 p-6 backdrop-blur transition-all hover:border-[#0066FF]/30"
          >
            <div className="mb-3 flex items-start justify-between">
              <div className="text-muted-foreground text-sm">{stat.label}</div>
              <stat.icon className={cn('h-5 w-5', stat.color)} />
            </div>
            <div className={cn('font-bold text-2xl', stat.color)}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Detailed Stats */}
      <div className="rounded-lg border border-border bg-card/50 p-6 backdrop-blur">
        <h3 className="mb-4 font-semibold text-lg">Detailed Statistics</h3>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg bg-muted/30 p-3 transition-all hover:bg-muted/50">
            <span className="text-muted-foreground">Total Trades</span>
            <span className="font-semibold">{totalTrades}</span>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-muted/30 p-3 transition-all hover:bg-muted/50">
            <span className="text-muted-foreground">Profitable Trades</span>
            <span className="font-semibold text-green-600">
              {profitableTrades}
            </span>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-muted/30 p-3 transition-all hover:bg-muted/50">
            <span className="text-muted-foreground">Losing Trades</span>
            <span className="font-semibold text-red-600">
              {totalTrades - profitableTrades}
            </span>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-muted/30 p-3 transition-all hover:bg-muted/50">
            <span className="text-muted-foreground">Win Rate</span>
            <span className="font-semibold">{(winRate * 100).toFixed(1)}%</span>
          </div>
        </div>
      </div>

      {/* Activity Summary */}
      <div className="rounded-lg border border-border bg-card/50 p-6 backdrop-blur">
        <h3 className="mb-4 font-semibold text-lg">Activity Summary</h3>

        {totalTrades === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <Activity className="mx-auto mb-4 h-12 w-12 opacity-50" />
            <p>No trading activity yet</p>
            <p className="mt-2 text-sm">
              Enable autonomous mode to start trading
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg bg-muted/30 p-4 transition-all hover:bg-muted/50">
              <div className="mb-2 text-muted-foreground text-sm">
                Performance
              </div>
              <div className="flex items-center gap-2">
                {isProfitable ? (
                  <TrendingUp className="h-5 w-5 text-green-600" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-red-600" />
                )}
                <span
                  className={cn(
                    'font-semibold text-lg',
                    isProfitable ? 'text-green-600' : 'text-red-600'
                  )}
                >
                  {isProfitable ? '+' : ''}
                  {pnl.toFixed(2)} points
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
