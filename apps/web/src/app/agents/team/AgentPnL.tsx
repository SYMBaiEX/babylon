'use client';

import { cn, logger } from '@babylon/shared';
import { ChevronDown, Loader2, TrendingDown, TrendingUp } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAgentTotalPnL } from '@/hooks/useAgentTotalPnL';
import { useAuth } from '@/hooks/useAuth';

/** Response from /api/agents/[agentId]/trading-balance */
interface WalletResponse {
  success: boolean;
  agentBalance: {
    tradingBalance: number;
    lifetimePnL: number;
    totalDeposited?: number;
    totalWithdrawn?: number;
  };
  userBalance: number;
}

/** Response from /api/agents/[agentId] */
interface AgentResponse {
  agent?: {
    totalTrades?: number;
    profitableTrades?: number;
    winRate?: number;
  };
}

interface AgentPnLProps {
  agentId: string;
  agentName: string;
}

/** Collapsible section with smooth height animation */
function CollapsibleSection({
  title,
  count,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(
    isOpen ? undefined : 0
  );

  useEffect(() => {
    if (!contentRef.current) return undefined;

    if (isOpen) {
      const contentHeight = contentRef.current.scrollHeight;
      setHeight(contentHeight);
      const timer = setTimeout(() => setHeight(undefined), 200);
      return () => clearTimeout(timer);
    }
    const contentHeight = contentRef.current.scrollHeight;
    setHeight(contentHeight);
    requestAnimationFrame(() => {
      setHeight(0);
    });
    return undefined;
  }, [isOpen]);

  return (
    <div className="rounded-md border border-border/50 bg-muted/20">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-2 py-1.5 text-left transition-colors hover:bg-muted/30"
      >
        <span className="font-medium text-[11px] text-muted-foreground uppercase">
          {title} ({count})
        </span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 text-muted-foreground transition-transform duration-200',
            isOpen && 'rotate-180'
          )}
        />
      </button>
      <div
        style={{
          height: height === undefined ? 'auto' : height,
          overflow: 'hidden',
          transition: 'height 200ms ease-out',
        }}
      >
        <div ref={contentRef} className="px-2 pb-2">
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * P&L component showing trading performance, stats, and open positions.
 */
export function AgentPnL({ agentId, agentName }: AgentPnLProps) {
  const { getAccessToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState<
    Set<'predictions' | 'perps'>
  >(new Set(['predictions', 'perps']));
  const [balanceInfo, setBalanceInfo] = useState({
    agentBalance: 0,
    lifetimePnL: 0,
    totalDeposited: 0,
    totalWithdrawn: 0,
  });

  // Agent stats from API
  const [agentStats, setAgentStats] = useState({
    totalTrades: 0,
    profitableTrades: 0,
    winRate: 0,
  });

  // Use shared hook for P&L calculation
  const {
    realizedPnL,
    unrealizedPnL,
    totalPnL,
    pointsInPositions,
    isProfitable,
    loading: positionsLoading,
    predictions,
    perps,
  } = useAgentTotalPnL({
    agentId,
    availableBalance: balanceInfo.agentBalance,
    totalDeposited: balanceInfo.totalDeposited,
    totalWithdrawn: balanceInfo.totalWithdrawn,
    realizedPnL: balanceInfo.lifetimePnL.toString(),
  });

  // Fetch balance and agent stats
  const fetchData = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const [walletRes, agentRes] = await Promise.all([
        fetch(`/api/agents/${agentId}/trading-balance`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/agents/${agentId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (walletRes.ok) {
        const walletData = (await walletRes.json()) as WalletResponse;
        if (walletData.success) {
          setBalanceInfo({
            agentBalance: walletData.agentBalance.tradingBalance,
            lifetimePnL: walletData.agentBalance.lifetimePnL,
            totalDeposited: walletData.agentBalance.totalDeposited ?? 0,
            totalWithdrawn: walletData.agentBalance.totalWithdrawn ?? 0,
          });
        }
      }

      if (agentRes.ok) {
        const agentData = (await agentRes.json()) as AgentResponse;
        if (agentData.agent) {
          setAgentStats({
            totalTrades: agentData.agent.totalTrades ?? 0,
            profitableTrades: agentData.agent.profitableTrades ?? 0,
            winRate: agentData.agent.winRate ?? 0,
          });
        }
      }
    } catch (err) {
      logger.error(
        'Failed to fetch P&L data',
        { error: err instanceof Error ? err.message : String(err) },
        'AgentPnL'
      );
    } finally {
      setLoading(false);
    }
  }, [agentId, getAccessToken]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleSection = useCallback((section: 'predictions' | 'perps') => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Header with agent name */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">{agentName} P&L</h3>
        <div
          className={cn(
            'flex items-center gap-1 rounded-full px-2 py-0.5 font-medium text-xs',
            isProfitable
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
          )}
        >
          {isProfitable ? (
            <TrendingUp className="h-3 w-3" />
          ) : (
            <TrendingDown className="h-3 w-3" />
          )}
          {positionsLoading
            ? '...'
            : `${totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}`}
        </div>
      </div>

      {/* P&L Summary + Quick Stats - Side by side */}
      <div className="grid grid-cols-2 gap-3">
        {/* P&L Summary */}
        <div className="space-y-2 rounded-lg border border-border bg-card/50 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Total P&L</span>
            <span
              className={cn(
                'font-semibold',
                isProfitable ? 'text-green-600' : 'text-red-600'
              )}
            >
              {positionsLoading
                ? '...'
                : `${totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}`}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Realized</span>
            <span
              className={cn(
                'font-medium',
                realizedPnL >= 0 ? 'text-green-600' : 'text-red-600'
              )}
            >
              {realizedPnL >= 0 ? '+' : ''}
              {realizedPnL.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Unrealized</span>
            <span
              className={cn(
                'font-medium',
                unrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'
              )}
            >
              {positionsLoading
                ? '...'
                : `${unrealizedPnL >= 0 ? '+' : ''}${unrealizedPnL.toFixed(2)}`}
            </span>
          </div>
          <div className="border-border border-t pt-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">In Positions</span>
              <span className="font-medium">
                {positionsLoading ? '...' : pointsInPositions.toFixed(2)} pts
              </span>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-muted/30 p-2 text-center">
            <div className="text-[10px] text-muted-foreground">Trades</div>
            <div className="font-semibold text-sm">
              {agentStats.totalTrades}
            </div>
          </div>
          <div className="rounded-lg bg-muted/30 p-2 text-center">
            <div className="text-[10px] text-muted-foreground">Win Rate</div>
            <div className="font-semibold text-sm">
              {(agentStats.winRate * 100).toFixed(0)}%
            </div>
          </div>
          <div className="rounded-lg bg-muted/30 p-2 text-center">
            <div className="text-[10px] text-muted-foreground">Positions</div>
            <div className="font-semibold text-sm">
              {positionsLoading ? '...' : predictions.length + perps.length}
            </div>
          </div>
          <div className="rounded-lg bg-muted/30 p-2 text-center">
            <div className="text-[10px] text-muted-foreground">Profitable</div>
            <div className="font-semibold text-green-600 text-sm">
              {agentStats.profitableTrades}
            </div>
          </div>
        </div>
      </div>

      {/* Open Positions */}
      <div className="flex flex-col rounded-lg border border-border bg-card/50 p-3 lg:min-h-0 lg:flex-1 lg:overflow-hidden">
        <div className="mb-2 shrink-0 font-medium text-sm">Open Positions</div>

        {positionsLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : predictions.length === 0 && perps.length === 0 ? (
          <div className="flex items-center justify-center py-4 text-muted-foreground text-xs">
            No open positions
          </div>
        ) : (
          <div className="space-y-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            {/* Prediction Positions */}
            {predictions.length > 0 && (
              <CollapsibleSection
                title="Predictions"
                count={predictions.length}
                isOpen={expandedSections.has('predictions')}
                onToggle={() => toggleSection('predictions')}
              >
                <div className="space-y-1">
                  {predictions.map((pos) => (
                    <div
                      key={pos.id}
                      className="flex items-center justify-between rounded bg-muted/30 px-2 py-1.5 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">
                          {pos.question || `Market ${pos.marketId}`}
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <span
                            className={cn(
                              'font-medium',
                              pos.side === 'yes'
                                ? 'text-green-600'
                                : 'text-red-600'
                            )}
                          >
                            {pos.side.toUpperCase()}
                          </span>
                          <span>{pos.shares.toFixed(2)} shares</span>
                        </div>
                      </div>
                      {pos.unrealizedPnL !== undefined && (
                        <span
                          className={cn(
                            'ml-2 shrink-0 font-medium',
                            pos.unrealizedPnL >= 0
                              ? 'text-green-600'
                              : 'text-red-600'
                          )}
                        >
                          {pos.unrealizedPnL >= 0 ? '+' : ''}
                          {pos.unrealizedPnL.toFixed(2)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </CollapsibleSection>
            )}

            {/* Perp Positions */}
            {perps.length > 0 && (
              <CollapsibleSection
                title="Perpetuals"
                count={perps.length}
                isOpen={expandedSections.has('perps')}
                onToggle={() => toggleSection('perps')}
              >
                <div className="space-y-1">
                  {perps.map((pos) => (
                    <div
                      key={pos.id}
                      className="flex items-center justify-between rounded bg-muted/30 px-2 py-1.5 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{pos.ticker}</div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <span
                            className={cn(
                              'font-medium',
                              pos.side === 'long'
                                ? 'text-green-600'
                                : 'text-red-600'
                            )}
                          >
                            {pos.side.toUpperCase()}
                          </span>
                          <span>Size: {pos.size.toFixed(4)}</span>
                          {pos.entryPrice && (
                            <span>@ ${pos.entryPrice.toFixed(2)}</span>
                          )}
                        </div>
                      </div>
                      {pos.unrealizedPnL !== undefined && (
                        <span
                          className={cn(
                            'ml-2 shrink-0 font-medium',
                            pos.unrealizedPnL >= 0
                              ? 'text-green-600'
                              : 'text-red-600'
                          )}
                        >
                          {pos.unrealizedPnL >= 0 ? '+' : ''}
                          {pos.unrealizedPnL.toFixed(2)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </CollapsibleSection>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
