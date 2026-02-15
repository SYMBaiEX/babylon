'use client';

import {
  BABYLON_POINTS_SYMBOL,
  cn,
  formatCompactCurrency,
  logger,
} from '@babylon/shared';
import { ChevronDown, Loader2, TrendingDown, TrendingUp } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/hooks/useAuth';
import { useCollapsibleHeight } from '@/hooks/useCollapsibleHeight';
import { useUserPositions } from '@/hooks/useUserPositions';
import {
  usePerpPositions,
  usePredictionPositions,
} from '@/stores/userPositionsStore';

/** Portfolio breakdown snapshot (matches profile page calculation) */
interface PortfolioSnapshot {
  totalPnL: number;
  positions: number;
  totalAssets: number;
  available: number;
  wallet: number;
  agents: number;
  totalPoints: number;
}

/** Response from /api/agents/[agentId] */
interface AgentResponse {
  agent?: {
    totalTrades?: number;
    profitableTrades?: number;
    winRate?: number;
  };
}

type AgentPnLProps =
  | {
      entityType: 'agent';
      agentId: string;
      entityName: string;
      userId?: never;
    }
  | {
      entityType: 'user';
      userId: string;
      entityName: string;
      agentId?: never;
    };

/** Returns true if a prediction position is still open (not resolved/closed) */
function isOpenPrediction(p: { resolved?: boolean; status?: string }): boolean {
  if (p.resolved) return false;
  if (p.status && p.status !== 'active') return false;
  return true;
}

/** Returns a label + color variant for a closed prediction position */
function getResolutionLabel(p: {
  resolution?: boolean | null;
  status?: string;
}): { text: string; variant: 'green' | 'red' | 'muted' } {
  if (p.status === 'cancelled') return { text: 'Cancelled', variant: 'muted' };
  if (p.resolution === true) return { text: 'Won', variant: 'green' };
  if (p.resolution === false) return { text: 'Lost', variant: 'red' };
  return { text: 'Closed', variant: 'muted' };
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
  const { contentRef, height } = useCollapsibleHeight(isOpen);

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
 * Supports both user and agent modes.
 */
export function AgentPnL(props: AgentPnLProps) {
  const { entityType, entityName } = props;

  if (entityType === 'user') {
    return <UserPnL userId={props.userId} entityName={entityName} />;
  }

  return <AgentPnLView agentId={props.agentId} entityName={entityName} />;
}

/** User P&L view - uses portfolio-breakdown for consistent P&L (matches profile page) */
function UserPnL({
  userId,
  entityName,
}: {
  userId: string;
  entityName: string;
}) {
  const router = useRouter();
  const [expandedSections, setExpandedSections] = useState<
    Set<'predictions' | 'perps'>
  >(new Set(['predictions', 'perps']));
  const [showClosed, setShowClosed] = useState(false);

  // Portfolio breakdown (same calculation as profile page)
  const [portfolio, setPortfolio] = useState<PortfolioSnapshot | null>(null);
  const [portfolioLoading, setPortfolioLoading] = useState(true);

  // Fetch user positions (for list display only)
  const { positions: perpsData, loading: perpsLoading } =
    usePerpPositions(userId);
  const { positions: predictionsData, loading: predictionsLoading } =
    usePredictionPositions(userId);

  const loading = portfolioLoading || perpsLoading || predictionsLoading;

  // Filter to only user's personal positions (exclude agent positions)
  const perps = (perpsData ?? []).filter((p) => !p.isAgentPosition);
  const userPredictions = (predictionsData ?? []).filter(
    (p) => !p.isAgentPosition
  );
  const openPredictions = userPredictions.filter(isOpenPrediction);
  const closedPredictions = userPredictions.filter((p) => !isOpenPrediction(p));
  const predictions = showClosed
    ? [...openPredictions, ...closedPredictions]
    : openPredictions;

  // Fetch portfolio breakdown (same endpoint as profile page)
  useEffect(() => {
    let cancelled = false;
    const fetchPortfolio = async () => {
      setPortfolioLoading(true);
      try {
        const res = await fetch(
          `/api/users/${encodeURIComponent(userId)}/portfolio-breakdown`
        );
        if (res.ok && !cancelled) {
          const data = (await res.json()) as Record<string, unknown>;
          setPortfolio({
            totalPnL: Number(data.totalPnL) || 0,
            positions: Number(data.positions) || 0,
            totalAssets: Number(data.totalAssets) || 0,
            available: Number(data.available) || 0,
            wallet: Number(data.wallet) || 0,
            agents: Number(data.agents) || 0,
            totalPoints: Number(data.totalPoints) || 0,
          });
        }
      } catch (err) {
        if (!cancelled) {
          logger.error(
            'Failed to fetch portfolio breakdown',
            { error: err instanceof Error ? err.message : String(err) },
            'UserPnL'
          );
        }
      } finally {
        if (!cancelled) setPortfolioLoading(false);
      }
    };
    void fetchPortfolio();
    return () => {
      cancelled = true;
    };
  }, [userId]);

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

  const totalPnL = portfolio?.totalPnL ?? 0;
  const isProfitable = totalPnL >= 0;

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">{entityName} P&L</h3>
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
          {totalPnL >= 0 ? '+' : ''}
          {formatCompactCurrency(totalPnL)}
        </div>
      </div>

      {/* P&L Summary + Quick Stats */}
      <div className="grid grid-cols-2 gap-3">
        {/* P&L Summary (matches profile page) */}
        <div className="space-y-2 rounded-lg border border-border bg-card/50 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Total P&L</span>
            <span
              className={cn(
                'font-semibold',
                isProfitable ? 'text-green-600' : 'text-red-600'
              )}
            >
              {totalPnL >= 0 ? '+' : ''}
              {formatCompactCurrency(totalPnL)}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Total Assets</span>
            <span className="font-medium">
              {formatCompactCurrency(portfolio?.totalAssets ?? 0)}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Available</span>
            <span className="font-medium">
              {formatCompactCurrency(portfolio?.available ?? 0)}
            </span>
          </div>
          <div className="border-border border-t pt-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">In Positions</span>
              <span className="font-medium">
                {formatCompactCurrency(portfolio?.positions ?? 0)}
              </span>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-muted/30 p-2 text-center">
            <div className="text-[10px] text-muted-foreground">Balance</div>
            <div className="font-semibold text-sm">
              {formatCompactCurrency(portfolio?.wallet ?? 0)}
            </div>
          </div>
          <div className="rounded-lg bg-muted/30 p-2 text-center">
            <div className="text-[10px] text-muted-foreground">Positions</div>
            <div className="font-semibold text-sm">
              {predictions.length + perps.length}
            </div>
          </div>
          <div className="rounded-lg bg-muted/30 p-2 text-center">
            <div className="text-[10px] text-muted-foreground">Predictions</div>
            <div className="font-semibold text-sm">{predictions.length}</div>
          </div>
          <div className="rounded-lg bg-muted/30 p-2 text-center">
            <div className="text-[10px] text-muted-foreground">Perpetuals</div>
            <div className="font-semibold text-sm">{perps.length}</div>
          </div>
        </div>
      </div>

      {/* Open Positions */}
      <div className="flex flex-col rounded-lg border border-border bg-card/50 p-3 lg:min-h-0 lg:flex-1 lg:overflow-hidden">
        <div className="mb-2 flex shrink-0 items-center justify-between">
          <span className="font-medium text-sm">
            {showClosed ? 'All Positions' : 'Open Positions'}
          </span>
          {closedPredictions.length > 0 && (
            <label className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <span>Show closed</span>
              <Switch
                checked={showClosed}
                onCheckedChange={setShowClosed}
                className="scale-75"
              />
            </label>
          )}
        </div>

        {predictions.length === 0 && perps.length === 0 ? (
          <div className="flex items-center justify-center py-4 text-muted-foreground text-xs">
            {showClosed ? 'No positions' : 'No open positions'}
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
                  {predictions.map((pos) => {
                    const closed = !isOpenPrediction(pos);
                    return (
                      <button
                        type="button"
                        key={pos.id}
                        onClick={() =>
                          router.push(`/markets/predictions/${pos.marketId}`)
                        }
                        className={cn(
                          'flex w-full items-center justify-between rounded bg-muted/30 px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/50',
                          closed && 'opacity-60'
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 truncate font-medium">
                            <span className="truncate">
                              {pos.question || `Market ${pos.marketId}`}
                            </span>
                            {closed && (
                              <span
                                className={cn(
                                  'shrink-0 rounded-full px-1.5 py-0.5 font-medium text-[10px] leading-none',
                                  {
                                    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400':
                                      getResolutionLabel(pos).variant ===
                                      'green',
                                    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400':
                                      getResolutionLabel(pos).variant === 'red',
                                    'bg-muted text-muted-foreground':
                                      getResolutionLabel(pos).variant ===
                                      'muted',
                                  }
                                )}
                              >
                                {getResolutionLabel(pos).text}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <span
                              className={cn(
                                'font-medium',
                                pos.side === 'YES'
                                  ? 'text-green-600'
                                  : 'text-red-600'
                              )}
                            >
                              {pos.side}
                            </span>
                            <span>{Number(pos.shares).toFixed(2)} shares</span>
                          </div>
                        </div>
                        {pos.unrealizedPnL !== undefined && (
                          <span
                            className={cn(
                              'ml-2 shrink-0 font-medium',
                              Number(pos.unrealizedPnL) >= 0
                                ? 'text-green-600'
                                : 'text-red-600'
                            )}
                          >
                            {Number(pos.unrealizedPnL) >= 0 ? '+' : ''}
                            {formatCompactCurrency(Number(pos.unrealizedPnL))}
                          </span>
                        )}
                      </button>
                    );
                  })}
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
                    <button
                      type="button"
                      key={pos.id}
                      onClick={() =>
                        router.push(`/markets/perps/${pos.ticker}`)
                      }
                      className="flex w-full items-center justify-between rounded bg-muted/30 px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/50"
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
                          <span>Size: {Number(pos.size).toFixed(4)}</span>
                          {pos.entryPrice && (
                            <span>
                              @ {BABYLON_POINTS_SYMBOL}
                              {Number(pos.entryPrice).toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>
                      {pos.unrealizedPnL !== undefined && (
                        <span
                          className={cn(
                            'ml-2 shrink-0 font-medium',
                            Number(pos.unrealizedPnL) >= 0
                              ? 'text-green-600'
                              : 'text-red-600'
                          )}
                        >
                          {Number(pos.unrealizedPnL) >= 0 ? '+' : ''}
                          {formatCompactCurrency(Number(pos.unrealizedPnL))}
                        </span>
                      )}
                    </button>
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

/** Agent P&L view - uses portfolio-breakdown for consistent P&L (matches profile page) */
function AgentPnLView({
  agentId,
  entityName,
}: {
  agentId: string;
  entityName: string;
}) {
  const router = useRouter();
  const { getAccessToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState<
    Set<'predictions' | 'perps'>
  >(new Set(['predictions', 'perps']));
  const [showClosed, setShowClosed] = useState(false);

  // Portfolio breakdown (same calculation as profile page)
  const [portfolio, setPortfolio] = useState<PortfolioSnapshot | null>(null);
  const [portfolioLoading, setPortfolioLoading] = useState(true);

  // Agent stats from API
  const [agentStats, setAgentStats] = useState({
    totalTrades: 0,
    profitableTrades: 0,
    winRate: 0,
  });

  // Positions for list display
  const {
    predictionPositions: allPredictions,
    perpPositions: perps,
    loading: positionsLoading,
  } = useUserPositions(agentId);

  // Split prediction positions into open vs closed
  const openPredictions = allPredictions.filter(isOpenPrediction);
  const closedPredictions = allPredictions.filter((p) => !isOpenPrediction(p));
  const predictions = showClosed
    ? [...openPredictions, ...closedPredictions]
    : openPredictions;

  // Fetch portfolio breakdown (same endpoint as profile page)
  useEffect(() => {
    let cancelled = false;
    const fetchPortfolio = async () => {
      setPortfolioLoading(true);
      try {
        const res = await fetch(
          `/api/users/${encodeURIComponent(agentId)}/portfolio-breakdown`
        );
        if (res.ok && !cancelled) {
          const data = (await res.json()) as Record<string, unknown>;
          setPortfolio({
            totalPnL: Number(data.totalPnL) || 0,
            positions: Number(data.positions) || 0,
            totalAssets: Number(data.totalAssets) || 0,
            available: Number(data.available) || 0,
            wallet: Number(data.wallet) || 0,
            agents: Number(data.agents) || 0,
            totalPoints: Number(data.totalPoints) || 0,
          });
        }
      } catch (err) {
        if (!cancelled) {
          logger.error(
            'Failed to fetch portfolio breakdown',
            { error: err instanceof Error ? err.message : String(err) },
            'AgentPnLView'
          );
        }
      } finally {
        if (!cancelled) setPortfolioLoading(false);
      }
    };
    void fetchPortfolio();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  // Fetch agent stats (trades, win rate)
  const fetchData = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const agentRes = await fetch(`/api/agents/${agentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

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
        'Failed to fetch agent stats',
        { error: err instanceof Error ? err.message : String(err) },
        'AgentPnLView'
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

  if (loading || portfolioLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalPnL = portfolio?.totalPnL ?? 0;
  const isProfitable = totalPnL >= 0;

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Header with agent name */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">{entityName} P&L</h3>
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
          {totalPnL >= 0 ? '+' : ''}
          {formatCompactCurrency(totalPnL)}
        </div>
      </div>

      {/* P&L Summary + Quick Stats - Side by side */}
      <div className="grid grid-cols-2 gap-3">
        {/* P&L Summary (matches profile page) */}
        <div className="space-y-2 rounded-lg border border-border bg-card/50 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Total P&L</span>
            <span
              className={cn(
                'font-semibold',
                isProfitable ? 'text-green-600' : 'text-red-600'
              )}
            >
              {totalPnL >= 0 ? '+' : ''}
              {formatCompactCurrency(totalPnL)}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Total Assets</span>
            <span className="font-medium">
              {formatCompactCurrency(portfolio?.totalAssets ?? 0)}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Available</span>
            <span className="font-medium">
              {formatCompactCurrency(portfolio?.available ?? 0)}
            </span>
          </div>
          <div className="border-border border-t pt-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">In Positions</span>
              <span className="font-medium">
                {formatCompactCurrency(portfolio?.positions ?? 0)}
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
        <div className="mb-2 flex shrink-0 items-center justify-between">
          <span className="font-medium text-sm">
            {showClosed ? 'All Positions' : 'Open Positions'}
          </span>
          {closedPredictions.length > 0 && (
            <label className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <span>Show closed</span>
              <Switch
                checked={showClosed}
                onCheckedChange={setShowClosed}
                className="scale-75"
              />
            </label>
          )}
        </div>

        {positionsLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : predictions.length === 0 && perps.length === 0 ? (
          <div className="flex items-center justify-center py-4 text-muted-foreground text-xs">
            {showClosed ? 'No positions' : 'No open positions'}
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
                  {predictions.map((pos) => {
                    const closed = !isOpenPrediction(pos);
                    return (
                      <button
                        type="button"
                        key={pos.id}
                        onClick={() =>
                          router.push(`/markets/predictions/${pos.marketId}`)
                        }
                        className={cn(
                          'flex w-full items-center justify-between rounded bg-muted/30 px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/50',
                          closed && 'opacity-60'
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 truncate font-medium">
                            <span className="truncate">
                              {pos.question || `Market ${pos.marketId}`}
                            </span>
                            {closed && (
                              <span
                                className={cn(
                                  'shrink-0 rounded-full px-1.5 py-0.5 font-medium text-[10px] leading-none',
                                  {
                                    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400':
                                      getResolutionLabel(pos).variant ===
                                      'green',
                                    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400':
                                      getResolutionLabel(pos).variant === 'red',
                                    'bg-muted text-muted-foreground':
                                      getResolutionLabel(pos).variant ===
                                      'muted',
                                  }
                                )}
                              >
                                {getResolutionLabel(pos).text}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <span
                              className={cn(
                                'font-medium',
                                pos.side === 'YES'
                                  ? 'text-green-600'
                                  : 'text-red-600'
                              )}
                            >
                              {pos.side}
                            </span>
                            <span>{Number(pos.shares).toFixed(2)} shares</span>
                          </div>
                        </div>
                        {pos.unrealizedPnL !== undefined && (
                          <span
                            className={cn(
                              'ml-2 shrink-0 font-medium',
                              Number(pos.unrealizedPnL) >= 0
                                ? 'text-green-600'
                                : 'text-red-600'
                            )}
                          >
                            {Number(pos.unrealizedPnL) >= 0 ? '+' : ''}
                            {formatCompactCurrency(Number(pos.unrealizedPnL))}
                          </span>
                        )}
                      </button>
                    );
                  })}
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
                    <button
                      type="button"
                      key={pos.id}
                      onClick={() =>
                        router.push(`/markets/perps/${pos.ticker}`)
                      }
                      className="flex w-full items-center justify-between rounded bg-muted/30 px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/50"
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
                          <span>Size: {Number(pos.size).toFixed(4)}</span>
                          {pos.entryPrice && (
                            <span>
                              @ {BABYLON_POINTS_SYMBOL}
                              {Number(pos.entryPrice).toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>
                      {pos.unrealizedPnL !== undefined && (
                        <span
                          className={cn(
                            'ml-2 shrink-0 font-medium',
                            Number(pos.unrealizedPnL) >= 0
                              ? 'text-green-600'
                              : 'text-red-600'
                          )}
                        >
                          {Number(pos.unrealizedPnL) >= 0 ? '+' : ''}
                          {formatCompactCurrency(Number(pos.unrealizedPnL))}
                        </span>
                      )}
                    </button>
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
