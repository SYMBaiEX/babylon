'use client';

import { BABYLON_POINTS_SYMBOL, cn } from '@babylon/shared';
import { PredictionPricing } from '@babylon/core/markets/prediction/client';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Star, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useRouter, useSearchParams } from 'next/navigation';
import { calculateExpectedPayout } from '@babylon/core/markets/prediction/client';
import { Skeleton } from '@/components/shared/Skeleton';
import {
  type BuyPredictionDetails,
  TradeConfirmationDialog,
} from '@/components/markets/TradeConfirmationDialog';
import { AssetTradesFeed } from '@/components/markets/AssetTradesFeed';
import { PerpPositionsList } from '@/components/markets/PerpPositionsList';
import { PredictionPositionsList } from '@/components/markets/PredictionPositionsList';
import { useAuth } from '@/hooks/useAuth';
import { usePredictionHistory } from '@/hooks/usePredictionHistory';
import type {
  PredictionResolutionSSE,
  PredictionTradeSSE,
} from '@/hooks/usePredictionMarketStream';
import { usePredictionMarketStream } from '@/hooks/usePredictionMarketStream';
import { usePerpHistory } from '@/hooks/usePerpHistory';
import { PerpPriceChart } from '@/components/markets/PerpPriceChart';
import { PredictionProbabilityChart } from '@/components/markets/PredictionProbabilityChart';
import { PerpsOrderEntryPanel } from '../perps-terminal/PerpsOrderEntryPanel';
import { usePredictionMarkets, usePredictionMarketsPolling } from '@/stores/predictionMarketsStore';
import { usePerpMarkets, usePerpMarketsRealtime } from '@/stores/perpMarketsStore';
import {
  invalidateUserPositions,
  usePerpPositions,
  usePredictionPositions,
  useUserPositionsPolling,
} from '@/stores/userPositionsStore';
import {
  invalidateWalletBalance,
  useWalletBalance,
  useWalletBalancePolling,
} from '@/stores/walletBalanceStore';
import { useMarketWatchlistStore, type MarketKey } from '@/stores/marketWatchlistStore';
import type { MarketTimeRange, PerpMarket, PredictionMarket, TradeSide } from '@/types/markets';
import { MARKET_TIME_RANGES } from '@/types/markets';

type MarketsFilter = 'all' | 'perp' | 'prediction';

interface MarketsTradingTerminalProps {
  onRequestBuyPoints?: () => void;
}

interface PredictionMarketTerminalState extends PredictionMarket {
  liquidity?: number;
  resolved?: boolean;
  resolution?: boolean | null;
  yesProbability?: number;
  noProbability?: number;
}

interface UnifiedRow {
  key: MarketKey;
  kind: 'perp' | 'prediction';
  title: string;
  subtitle: string;
  valuePrimary: string;
  valueSecondary?: string;
  change24hPct?: number | null;
  sortVolume: number;
  sortName: string;
  perpMarket?: PerpMarket;
  predictionMarket?: PredictionMarket;
}

function parseFilter(params: URLSearchParams): MarketsFilter {
  const filter = params.get('filter');
  if (filter === 'perp' || filter === 'prediction' || filter === 'all') {
    return filter;
  }
  const tab = params.get('tab') ?? params.get('tabs');
  if (tab === 'perps') return 'perp';
  if (tab === 'predictions') return 'prediction';
  return 'all';
}

function parseSelected(params: URLSearchParams): MarketKey | null {
  const kind = params.get('marketKind');
  const id = params.get('marketId');
  if (!kind || !id) return null;
  if (kind !== 'perp' && kind !== 'prediction') return null;
  return { kind, id };
}

function parsePerpSide(params: URLSearchParams): TradeSide | null {
  const side = params.get('side');
  if (side === 'long' || side === 'short') return side;
  return null;
}

function parsePredictionSide(params: URLSearchParams): 'yes' | 'no' | null {
  const side = params.get('side');
  if (side === 'yes' || side === 'no') return side;
  return null;
}

function formatYesPct(raw: number): string {
  const clamped = Math.min(100, Math.max(0, raw));
  const rounded = clamped >= 10 ? Math.round(clamped) : Math.round(clamped * 10) / 10;
  return `${rounded.toFixed(clamped >= 10 ? 0 : 1)}%`;
}

function computeYesPctFromShares(market: PredictionMarketTerminalState): number {
  const yes = Number(market.yesShares ?? 0);
  const no = Number(market.noShares ?? 0);
  const total = yes + no;
  if (total <= 0) return 50;
  return (yes / total) * 100;
}

export function MarketsTradingTerminal({ onRequestBuyPoints }: MarketsTradingTerminalProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { user, authenticated, login, getAccessToken } = useAuth();
  const userId = authenticated ? (user?.id ?? null) : null;

  const { markets: perpMarkets, loading: perpLoading, error: perpError } = usePerpMarkets();
  usePerpMarketsRealtime();

  const { markets: predictionMarkets, loading: predictionLoading, error: predictionError } =
    usePredictionMarkets(userId ?? undefined);
  usePredictionMarketsPolling(30_000, userId ?? undefined);

  useUserPositionsPolling(userId);
  useWalletBalancePolling(userId);
  const { balance, loading: balanceLoading, refresh: refreshWalletBalance } =
    useWalletBalance(userId);

  const { positions: perpPositions, refresh: refreshPerpPositions } = usePerpPositions(userId);
  const { positions: predictionPositions, refresh: refreshPredictionPositions } =
    usePredictionPositions(userId);

  const [filter, setFilter] = useState<MarketsFilter>(() => parseFilter(searchParams));
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<MarketKey | null>(() => parseSelected(searchParams));

  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [bottomCollapsed, setBottomCollapsed] = useState(false);
  const [bottomTab, setBottomTab] = useState<'positions' | 'trades'>('positions');

  const [predictionSide, setPredictionSide] = useState<'yes' | 'no'>(
    () => parsePredictionSide(searchParams) ?? 'yes'
  );
  const [predictionAmount, setPredictionAmount] = useState('10');
  const [predictionSubmitting, setPredictionSubmitting] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  const [perpTimeRange, setPerpTimeRange] = useState<MarketTimeRange>('1D');
  const [predictionTimeRange, setPredictionTimeRange] = useState<MarketTimeRange>('ALL');
  const [perpSideFromUrl, setPerpSideFromUrl] = useState<TradeSide | null>(() =>
    parsePerpSide(searchParams)
  );

  // Mobile UI state
  const [isMobileMarketListOpen, setIsMobileMarketListOpen] = useState(false);
  const [isMobileTradeSheetOpen, setIsMobileTradeSheetOpen] = useState(false);

  // One-way sync from URL → local UI state
  useEffect(() => {
    const nextFilter = parseFilter(searchParams);
    setFilter(nextFilter);
    setSelected(parseSelected(searchParams));

    const nextPerpSide = parsePerpSide(searchParams);
    const nextPredSide = parsePredictionSide(searchParams);
    if (nextPerpSide) {
      // Perps order entry manages its own side; we only use this to open the trade sheet.
      setPerpSideFromUrl(nextPerpSide);
      setIsMobileTradeSheetOpen(true);
    }
    if (nextPredSide) setPredictionSide(nextPredSide);
  }, [searchParams]);

  const favorites = useMarketWatchlistStore((s) => s.favorites);
  const toggleFavorite = useMarketWatchlistStore((s) => s.toggleFavorite);
  const isFavorite = useMarketWatchlistStore((s) => s.isFavorite);

  const rows: UnifiedRow[] = useMemo(() => {
    const q = query.trim().toLowerCase();

    const perps: UnifiedRow[] = perpMarkets.map((m) => ({
      key: { kind: 'perp', id: m.ticker },
      kind: 'perp',
      title: m.ticker,
      subtitle: m.name,
      valuePrimary: `${BABYLON_POINTS_SYMBOL}${m.currentPrice.toFixed(2)}`,
      valueSecondary: `Vol ${Math.round(m.volume24h).toLocaleString()}`,
      change24hPct: m.changePercent24h,
      sortVolume: m.volume24h ?? 0,
      sortName: m.ticker.toLowerCase(),
      perpMarket: m,
    }));

    const preds: UnifiedRow[] = predictionMarkets.map((m) => {
      const yesPct = computeYesPctFromShares(m as PredictionMarketTerminalState);
      const vol = Number(m.yesShares ?? 0) + Number(m.noShares ?? 0);
      return {
        key: { kind: 'prediction', id: m.id.toString() },
        kind: 'prediction',
        title: m.text,
        subtitle: `Scenario ${m.scenario}`,
        valuePrimary: `YES ${formatYesPct(yesPct)}`,
        valueSecondary: m.status !== 'active' ? m.status.toUpperCase() : undefined,
        change24hPct: null,
        sortVolume: vol,
        sortName: m.text.toLowerCase(),
        predictionMarket: m,
      };
    });

    const combined = [...perps, ...preds];

    const filtered = combined.filter((row) => {
      if (filter !== 'all' && row.kind !== filter) return false;
      if (q.length === 0) return true;
      return (
        row.title.toLowerCase().includes(q) ||
        row.subtitle.toLowerCase().includes(q) ||
        (row.kind === 'perp' && row.perpMarket?.name.toLowerCase().includes(q))
      );
    });

    return filtered.sort((a, b) => {
      if (b.sortVolume !== a.sortVolume) return b.sortVolume - a.sortVolume;
      return a.sortName.localeCompare(b.sortName);
    });
  }, [perpMarkets, predictionMarkets, query, filter]);

  // Ensure a default selection
  useEffect(() => {
    if (selected) return;
    if (rows.length === 0) return;
    setSelected(rows[0]?.key ?? null);
  }, [selected, rows]);

  // Keep selection consistent with the active filter (avoids hidden-selection confusion).
  useEffect(() => {
    if (!selected) return;
    if (filter === 'all') return;
    if (selected.kind === filter) return;
    setSelected(rows[0]?.key ?? null);
  }, [filter, rows, selected]);

  const selectedPerp = useMemo(() => {
    if (!selected || selected.kind !== 'perp') return null;
    return perpMarkets.find((m) => m.ticker.toUpperCase() === selected.id.toUpperCase()) ?? null;
  }, [selected, perpMarkets]);

  const [predictionState, setPredictionState] = useState<PredictionMarketTerminalState | null>(null);

  useEffect(() => {
    if (!selected || selected.kind !== 'prediction') {
      setPredictionState(null);
      return;
    }
    const base =
      predictionMarkets.find((m) => m.id.toString() === selected.id) ?? null;
    setPredictionState(base as PredictionMarketTerminalState | null);
  }, [selected, predictionMarkets]);

  const handlePredictionTradeEvent = useCallback((event: PredictionTradeSSE) => {
    setPredictionState((prev) => {
      if (!prev || prev.id.toString() !== event.marketId) return prev;
      return {
        ...prev,
        yesShares: event.yesShares,
        noShares: event.noShares,
        liquidity: event.liquidity ?? prev.liquidity,
        yesProbability: event.yesPrice,
        noProbability: event.noPrice,
      };
    });
  }, []);

  const handlePredictionResolutionEvent = useCallback(
    (event: PredictionResolutionSSE) => {
      setPredictionState((prev) => {
        if (!prev || prev.id.toString() !== event.marketId) return prev;
        return {
          ...prev,
          resolved: true,
          resolution: event.winningSide === 'yes',
          yesShares: event.yesShares,
          noShares: event.noShares,
          liquidity: event.liquidity ?? prev.liquidity,
          yesProbability: event.yesPrice,
          noProbability: event.noPrice,
        };
      });
    },
    []
  );

  usePredictionMarketStream(selected?.kind === 'prediction' ? selected.id : null, {
    onTrade: handlePredictionTradeEvent,
    onResolution: handlePredictionResolutionEvent,
  });

  const predictionSeed = useMemo(() => {
    if (!predictionState) return undefined;
    const yes = Number(predictionState.yesShares ?? 0);
    const no = Number(predictionState.noShares ?? 0);
    const total = yes + no;
    if (total <= 0) {
      const seeded = PredictionPricing.initializeMarket();
      return {
        yesShares: seeded.yesShares,
        noShares: seeded.noShares,
        liquidity: seeded.yesShares + seeded.noShares,
      };
    }
    return {
      yesShares: yes,
      noShares: no,
      liquidity: Number(predictionState.liquidity ?? total),
    };
  }, [predictionState]);

  const { history: predictionHistory, refresh: refreshPredictionHistory } =
    usePredictionHistory(selected?.kind === 'prediction' ? selected.id : null, {
      limit: 1000,
      seed: predictionSeed,
      range: predictionTimeRange,
    });

  const { history: perpHistory, refresh: refreshPerpHistory } = usePerpHistory(
    selectedPerp?.ticker ?? null,
    { range: perpTimeRange }
  );

  const handleSelect = useCallback(
    (key: MarketKey) => {
      setSelected(key);
      const next = new URLSearchParams(searchParams.toString());
      next.set('marketKind', key.kind);
      next.set('marketId', key.id);
      next.set('filter', filter);
      next.delete('tab');
      next.delete('tabs');
      next.delete('side');
      router.replace(`/markets?${next.toString()}`, { scroll: false });
      setIsMobileMarketListOpen(false);
    },
    [router, searchParams, filter]
  );

  const handleFilterChange = useCallback(
    (nextFilter: MarketsFilter) => {
      setFilter(nextFilter);
      const next = new URLSearchParams(searchParams.toString());
      next.set('filter', nextFilter);
      next.delete('tab');
      next.delete('tabs');
      next.delete('side');
      router.replace(`/markets?${next.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const predictionAmountNum = Number.parseFloat(predictionAmount) || 0;
  const predictionEffectiveShares = useMemo(() => {
    if (!predictionSeed) return null;
    return {
      yesShares: predictionSeed.yesShares ?? 0,
      noShares: predictionSeed.noShares ?? 0,
    };
  }, [predictionSeed]);

  const predictionCalculation = useMemo(() => {
    if (!predictionEffectiveShares) return null;
    if (predictionAmountNum <= 0) return null;
    return PredictionPricing.calculateBuy(
      predictionEffectiveShares.yesShares,
      predictionEffectiveShares.noShares,
      predictionSide,
      predictionAmountNum
    );
  }, [predictionEffectiveShares, predictionSide, predictionAmountNum]);

  const expectedPayout = useMemo(() => {
    if (!predictionCalculation) return 0;
    return calculateExpectedPayout(
      predictionCalculation.sharesBought,
      predictionCalculation.avgPrice
    );
  }, [predictionCalculation]);
  const expectedProfit = expectedPayout - predictionAmountNum;

  const handlePredictionSubmit = () => {
    if (!authenticated) {
      login();
      return;
    }
    if (!predictionState) return;
    if (predictionState.status !== 'active' || predictionState.resolved) {
      toast.error('This market is not active.');
      return;
    }
    if (predictionAmountNum < 1) {
      toast.error(`Minimum bet is ${BABYLON_POINTS_SYMBOL}1`);
      return;
    }
    setConfirmDialogOpen(true);
  };

  const handleConfirmPredictionBuy = async () => {
    if (!predictionState) return;
    if (!predictionCalculation) return;

    setPredictionSubmitting(true);
    setConfirmDialogOpen(false);

    const token = await getAccessToken();
    if (!token) {
      toast.error('Authentication required. Please log in.');
      setPredictionSubmitting(false);
      return;
    }

    const response = await fetch(
      `/api/markets/predictions/${encodeURIComponent(predictionState.id.toString())}/buy`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ side: predictionSide, amount: predictionAmountNum }),
      }
    );

    const data = await response.json();
    if (!response.ok) {
      const errorMessage =
        typeof data.error === 'object'
          ? data.error.message || 'Failed to buy shares'
          : data.error || data.message || 'Failed to buy shares';
      toast.error(errorMessage);
      setPredictionSubmitting(false);
      return;
    }

    toast.success(`Bought ${predictionSide.toUpperCase()} shares!`, {
      description: `${predictionCalculation.sharesBought.toFixed(2)} shares at ${predictionCalculation.avgPrice.toFixed(3)} each`,
    });

    invalidateUserPositions();
    invalidateWalletBalance();
    await Promise.all([
      refreshPredictionPositions(),
      refreshPerpPositions(),
      refreshWalletBalance(),
      refreshPredictionHistory(),
    ]);

    setPredictionSubmitting(false);
  };

  const selectedPredictionId = selected?.kind === 'prediction' ? selected.id : null;
  const selectedPredictionPositions = useMemo(() => {
    if (!selectedPredictionId) return [];
    return predictionPositions.filter((p) => p.marketId.toString() === selectedPredictionId);
  }, [predictionPositions, selectedPredictionId]);

  const selectedPerpPositions = useMemo(() => {
    if (!selectedPerp) return [];
    return perpPositions.filter(
      (p) => p.ticker.toUpperCase() === selectedPerp.ticker.toUpperCase() && !p.closedAt
    );
  }, [perpPositions, selectedPerp]);

  const desktopTradesContainerRef = useRef<HTMLDivElement | null>(null);
  const mobileTradesContainerRef = useRef<HTMLDivElement | null>(null);

  const terminalHeader = (
    <div className="flex h-11 shrink-0 items-center justify-between border-white/5 border-b bg-background/40 px-3 backdrop-blur-md">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex shrink-0 rounded-md bg-muted/20 p-1 font-semibold text-xs">
          {(['all', 'perp', 'prediction'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => handleFilterChange(f)}
              className={cn(
                'rounded px-2.5 py-1 transition-colors',
                filter === f ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {f === 'all' ? 'All' : f === 'perp' ? 'Perps' : 'Predictions'}
            </button>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search markets…"
            className="w-full rounded border border-white/10 bg-background/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>

      <div className="ml-3 flex items-center gap-2 text-xs">
        {authenticated ? (
          <button
            type="button"
            onClick={onRequestBuyPoints}
            className="rounded border border-white/10 bg-background/30 px-2 py-1 text-muted-foreground transition-colors hover:bg-muted/20 hover:text-foreground"
          >
            {balanceLoading ? '…' : `${BABYLON_POINTS_SYMBOL}${Math.floor(balance).toLocaleString()}`}
          </button>
        ) : (
          <button
            type="button"
            onClick={login}
            className="rounded bg-foreground px-3 py-1 font-semibold text-background"
          >
            Log in
          </button>
        )}
      </div>
    </div>
  );

  const listPanel = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-white/5 border-b px-3 py-2">
        <div className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
          Markets
        </div>
        <button
          type="button"
          onClick={() => setLeftCollapsed(true)}
          className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted/20 hover:text-foreground"
          aria-label="Collapse markets panel"
        >
          ◀
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {(perpLoading || predictionLoading) && rows.length === 0 ? (
          <div className="space-y-2 p-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : perpError || predictionError ? (
          <div className="p-4 text-muted-foreground text-sm">
            Failed to load markets.
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-10 bg-background/70 text-muted-foreground backdrop-blur-md">
              <tr className="border-white/5 border-b">
                <th className="w-10 px-3 py-2" />
                <th className="px-2 py-2">Market</th>
                <th className="px-2 py-2 text-right">Value</th>
                <th className="px-3 py-2 text-right">24h</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const active =
                  selected?.kind === row.key.kind && selected.id.toString() === row.key.id.toString();
                const change = row.change24hPct;
                return (
                  <tr
                    key={`${row.key.kind}:${row.key.id}`}
                    className={cn(
                      'cursor-pointer border-white/5 border-b transition-colors hover:bg-muted/20',
                      active && 'bg-muted/30'
                    )}
                    onClick={() => handleSelect(row.key)}
                  >
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(row.key);
                        }}
                        className={cn(
                          'text-muted-foreground/60 transition-colors hover:text-yellow-400',
                          isFavorite(row.key) && 'text-yellow-400'
                        )}
                        aria-label="Toggle favorite"
                      >
                        <Star size={14} fill={isFavorite(row.key) ? 'currentColor' : 'none'} />
                      </button>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex min-w-0 flex-col">
                        <div className="truncate font-bold text-foreground">
                          {row.kind === 'perp' ? row.title : row.title}
                        </div>
                        <div className="truncate text-[10px] text-muted-foreground">
                          {row.kind === 'perp' ? row.subtitle : row.subtitle}
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right">
                      <div className="font-mono text-foreground/90 tabular-nums">
                        {row.valuePrimary}
                      </div>
                      {row.valueSecondary && (
                        <div className="font-mono text-[9px] text-muted-foreground tabular-nums">
                          {row.valueSecondary}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {row.kind === 'perp' && change != null ? (
                        <div
                          className={cn(
                            'inline-flex items-center justify-end rounded-full px-2 py-0.5 font-bold text-[10px] tabular-nums',
                            change >= 0 ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                          )}
                        >
                          {change >= 0 ? '+' : ''}
                          {change.toFixed(2)}%
                        </div>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-muted-foreground">
                    No markets found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {favorites.length > 0 && (
        <div className="border-white/5 border-t p-2 text-[10px] text-muted-foreground">
          Favorites: {favorites.length}
        </div>
      )}
    </div>
  );

  const predictionYesPct = useMemo(() => {
    if (!predictionState) return 50;
    return computeYesPctFromShares(predictionState);
  }, [predictionState]);

  const centerPanel = (
    <div className="flex h-full min-h-0 flex-col bg-background/10">
      {selected?.kind === 'prediction' ? (
        <>
          <div className="flex shrink-0 items-center justify-between border-white/5 border-b px-4 py-3">
            <div className="min-w-0">
              <div className="truncate font-bold text-foreground text-lg">
                {predictionState?.text ?? 'Prediction market'}
              </div>
              <div className="text-muted-foreground text-xs">
                YES {formatYesPct(predictionYesPct)} · NO {formatYesPct(100 - predictionYesPct)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-md bg-muted/20 p-1 font-semibold text-xs">
                {MARKET_TIME_RANGES.map((range) => (
                  <button
                    key={range}
                    type="button"
                    onClick={() => setPredictionTimeRange(range)}
                    className={cn(
                      'rounded px-2 py-1 transition-colors',
                      predictionTimeRange === range
                        ? 'bg-foreground text-background'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {range}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1">
            <PredictionProbabilityChart
              data={predictionHistory}
              marketId={selectedPredictionId ?? 'unknown'}
              timeRange={predictionTimeRange}
              onTimeRangeChange={setPredictionTimeRange}
            />
          </div>
        </>
      ) : selectedPerp ? (
        <>
          <div className="flex shrink-0 items-center justify-between border-white/5 border-b px-4 py-3">
            <div className="min-w-0">
              <div className="font-bold text-foreground text-lg">${selectedPerp.ticker}</div>
              <div className="truncate text-muted-foreground text-xs">{selectedPerp.name}</div>
            </div>
          </div>
          <div className="min-h-0 flex-1 p-4">
            <PerpPriceChart
              data={perpHistory.map((p) => ({ time: p.time, price: p.price }))}
              currentPrice={selectedPerp.currentPrice}
              ticker={selectedPerp.ticker}
              timeRange={perpTimeRange}
              onTimeRangeChange={setPerpTimeRange}
              showHeader={false}
              className="h-full"
            />
          </div>
        </>
      ) : (
        <div className="flex h-full items-center justify-center text-muted-foreground">
          Select a market
        </div>
      )}
    </div>
  );

  const rightPanel = (
    <div className="flex h-full min-h-0 flex-col bg-background/20">
      <div className="flex items-center justify-between border-white/5 border-b px-3 py-2">
        <div className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
          Trade
        </div>
        <button
          type="button"
          onClick={() => setRightCollapsed(true)}
          className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted/20 hover:text-foreground"
          aria-label="Collapse trade panel"
        >
          ▶
        </button>
      </div>

      {selected?.kind === 'prediction' ? (
        <div className="min-h-0 flex-1 overflow-auto p-4 pb-[calc(72px+env(safe-area-inset-bottom)+24px)]">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-sm">Buy Shares</div>
            <div className="rounded bg-muted/20 px-2 py-1 text-[10px] text-muted-foreground uppercase tracking-wider">
              Standard
            </div>
          </div>

          <div className="mt-3 flex rounded-md bg-muted/20 p-1">
            <button
              type="button"
              onClick={() => setPredictionSide('yes')}
              className={cn(
                'flex-1 rounded-sm py-2 font-bold text-xs transition-colors',
                predictionSide === 'yes'
                  ? 'bg-green-600 text-white'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              YES
            </button>
            <button
              type="button"
              onClick={() => setPredictionSide('no')}
              className={cn(
                'flex-1 rounded-sm py-2 font-bold text-xs transition-colors',
                predictionSide === 'no'
                  ? 'bg-red-600 text-white'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              NO
            </button>
          </div>

          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between">
              <label className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                Amount
              </label>
              <span className="text-[10px] text-muted-foreground">Min {BABYLON_POINTS_SYMBOL}1</span>
            </div>
            <input
              type="number"
              value={predictionAmount}
              onChange={(e) => setPredictionAmount(e.target.value)}
              min={1}
              step="1"
              className="w-full rounded border border-white/10 bg-background/30 px-3 py-2 font-mono text-sm tabular-nums focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="10"
            />
          </div>

          {predictionCalculation && (
            <div className="mt-4 rounded border border-white/10 bg-muted/10 p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Shares</span>
                <span className="font-mono text-foreground tabular-nums">
                  {predictionCalculation.sharesBought.toFixed(2)}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-muted-foreground">Avg price</span>
                <span className="font-mono text-foreground tabular-nums">
                  {(predictionCalculation.avgPrice * 100).toFixed(1)}%
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-muted-foreground">Expected payout</span>
                <span className="font-mono text-foreground tabular-nums">
                  {BABYLON_POINTS_SYMBOL}
                  {expectedPayout.toFixed(2)}
                </span>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handlePredictionSubmit}
            disabled={predictionSubmitting || (authenticated && predictionAmountNum < 1)}
            className={cn(
              'mt-5 w-full rounded py-3 font-bold text-sm text-white shadow transition-all',
              predictionSide === 'yes'
                ? 'bg-green-600 hover:brightness-110'
                : 'bg-red-600 hover:brightness-110',
              (predictionSubmitting || (authenticated && predictionAmountNum < 1)) && 'cursor-not-allowed opacity-50'
            )}
          >
            {predictionSubmitting
              ? 'Processing…'
              : !authenticated
                ? 'Log In to Trade'
                : `BUY ${predictionSide.toUpperCase()} · ${BABYLON_POINTS_SYMBOL}${predictionAmountNum.toFixed(0)}`}
          </button>
        </div>
      ) : selectedPerp ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <PerpsOrderEntryPanel
            market={selectedPerp}
            initialSide={perpSideFromUrl ?? undefined}
          />
        </div>
      ) : (
        <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
          Select a market to trade.
        </div>
      )}
    </div>
  );

  const bottomPanel = (
    <div className="flex h-full min-h-0 flex-col bg-background/20">
      <div className="flex items-center justify-between border-white/5 border-b bg-background/30 px-2">
        <div className="scrollbar-hide flex min-w-0 flex-1 overflow-x-auto">
          <TabButton active={bottomTab === 'positions'} onClick={() => setBottomTab('positions')}>
            Positions
          </TabButton>
          <TabButton active={bottomTab === 'trades'} onClick={() => setBottomTab('trades')}>
            Trades
          </TabButton>
          <TabButton active={false} onClick={() => {}} disabled soon>
            Orders
          </TabButton>
          <TabButton active={false} onClick={() => {}} disabled soon>
            PnL
          </TabButton>
        </div>
        <button
          type="button"
          onClick={() => setBottomCollapsed(true)}
          className="ml-2 rounded p-2 text-muted-foreground transition-colors hover:bg-muted/20 hover:text-foreground"
          aria-label="Collapse bottom panel"
        >
          ▾
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {!authenticated ? (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
            Log in to view positions.
          </div>
        ) : bottomTab === 'positions' ? (
          selected?.kind === 'prediction' ? (
            <div className="h-full overflow-auto">
              {selectedPredictionPositions.length > 0 ? (
                <PredictionPositionsList
                  positions={selectedPredictionPositions}
                  onPositionSold={async () => {
                    invalidateUserPositions();
                    invalidateWalletBalance();
                    await Promise.all([
                      refreshPredictionPositions(),
                      refreshPerpPositions(),
                      refreshWalletBalance(),
                      refreshPredictionHistory(),
                    ]);
                  }}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground text-xs">
                  No open positions
                </div>
              )}
            </div>
          ) : (
            <div className="h-full overflow-auto">
              {selectedPerpPositions.length > 0 ? (
                <PerpPositionsList
                  positions={selectedPerpPositions}
                  onPositionClosed={async () => {
                    invalidateUserPositions();
                    invalidateWalletBalance();
                    await Promise.all([
                      refreshPerpPositions(),
                      refreshPredictionPositions(),
                      refreshWalletBalance(),
                      refreshPerpHistory(),
                    ]);
                  }}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground text-xs">
                  No open positions
                </div>
              )}
            </div>
          )
        ) : selected?.kind === 'prediction' ? (
          <div ref={desktopTradesContainerRef} className="h-full overflow-auto">
            <AssetTradesFeed
              marketType="prediction"
              assetId={selected.id}
              containerRef={desktopTradesContainerRef}
            />
          </div>
        ) : selectedPerp ? (
          <div ref={desktopTradesContainerRef} className="h-full overflow-auto">
            <AssetTradesFeed
              marketType="perp"
              assetId={selectedPerp.ticker}
              containerRef={desktopTradesContainerRef}
            />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
            Select a market to see trades.
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      {/* Desktop */}
      <div className="hidden min-h-0 flex-1 flex-col md:flex">
        {terminalHeader}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {leftCollapsed && (
            <button
              type="button"
              onClick={() => setLeftCollapsed(false)}
              className="w-9 shrink-0 border-white/5 border-r bg-background/30 text-muted-foreground transition-colors hover:bg-muted/20 hover:text-foreground"
              aria-label="Open markets panel"
            >
              <span className="writing-vertical-lr rotate-180 font-semibold text-[10px] tracking-wider">
                MARKETS
              </span>
            </button>
          )}

          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <PanelGroup direction="vertical" className="flex min-h-0 flex-1">
              <Panel defaultSize={bottomCollapsed ? 100 : 70} minSize={35} className="min-h-0">
                <PanelGroup direction="horizontal" className="min-h-0">
                  {!leftCollapsed && (
                    <>
                      <Panel defaultSize={22} minSize={15} maxSize={32} className="min-h-0 border-white/5 border-r">
                        {listPanel}
                      </Panel>
                      <PanelResizeHandle className="w-1 bg-white/5 hover:bg-primary/40" />
                    </>
                  )}

                  <Panel defaultSize={leftCollapsed ? 72 : 56} minSize={40} className="min-h-0">
                    {centerPanel}
                  </Panel>

                  {!rightCollapsed && (
                    <>
                      <PanelResizeHandle className="w-1 bg-white/5 hover:bg-primary/40" />
                      <Panel defaultSize={22} minSize={18} maxSize={32} className="min-h-0 border-white/5 border-l bg-background/20">
                        {rightPanel}
                      </Panel>
                    </>
                  )}

                  {rightCollapsed && (
                    <button
                      type="button"
                      onClick={() => setRightCollapsed(false)}
                      className="w-9 shrink-0 border-white/5 border-l bg-background/30 text-muted-foreground transition-colors hover:bg-muted/20 hover:text-foreground"
                      aria-label="Open trade panel"
                    >
                      <span className="writing-vertical-lr rotate-180 font-semibold text-[10px] tracking-wider">
                        TRADE
                      </span>
                    </button>
                  )}
                </PanelGroup>
              </Panel>

              {!bottomCollapsed && (
                <>
                  <PanelResizeHandle className="h-1 bg-white/5 hover:bg-primary/40" />
                  <Panel defaultSize={30} minSize={12} className="min-h-0 border-white/5 border-t bg-background/20">
                    {bottomPanel}
                  </Panel>
                </>
              )}
            </PanelGroup>

            {bottomCollapsed && (
              <button
                type="button"
                onClick={() => setBottomCollapsed(false)}
                className={cn(
                  'flex h-7 shrink-0 items-center justify-between border-white/5 border-t bg-background/40 px-4 text-muted-foreground',
                  'transition-colors hover:bg-muted/20 hover:text-foreground'
                )}
              >
                <span className="font-semibold text-[10px] tracking-widest">POSITIONS & TRADES</span>
                <span className="text-[10px]">▲</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile */}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden md:hidden">
        <div className="shrink-0 border-white/5 border-b bg-background">
          <div className="flex h-14 items-center justify-between px-4">
            <div className="font-bold text-lg tracking-tight">Markets</div>
            <button
              type="button"
              onClick={() => setIsMobileMarketListOpen(true)}
              className="flex items-center gap-2 rounded-full bg-muted px-3 py-1.5"
            >
              <span className="max-w-[180px] truncate font-bold text-sm">
                {selected?.kind === 'perp' ? selected.id : predictionState?.text ?? 'Select'}
              </span>
              <span className="text-muted-foreground text-xs">▼</span>
            </button>
          </div>
          <div className="px-3 pb-3">
            {/* Filter + search */}
            <div className="flex items-center gap-2">
              <div className="flex shrink-0 rounded-md bg-muted/20 p-1 font-semibold text-xs">
                {(['all', 'perp', 'prediction'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => handleFilterChange(f)}
                    className={cn(
                      'rounded px-2.5 py-1 transition-colors',
                      filter === f
                        ? 'bg-foreground text-background'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {f === 'all' ? 'All' : f === 'perp' ? 'Perps' : 'Pred'}
                  </button>
                ))}
              </div>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="w-full rounded border border-white/10 bg-background/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          <div className="hide-scrollbar flex h-full flex-col overflow-y-auto overflow-x-hidden">
            <div className="h-[45vh] w-full shrink-0 border-white/5 border-b">
              {selected?.kind === 'prediction' ? (
                <PredictionProbabilityChart
                  data={predictionHistory}
                  marketId={selectedPredictionId ?? 'unknown'}
                  timeRange={predictionTimeRange}
                  onTimeRangeChange={setPredictionTimeRange}
                />
              ) : selectedPerp ? (
                <PerpPriceChart
                  data={perpHistory.map((p) => ({ time: p.time, price: p.price }))}
                  currentPrice={selectedPerp.currentPrice}
                  ticker={selectedPerp.ticker}
                  timeRange={perpTimeRange}
                  onTimeRangeChange={setPerpTimeRange}
                  showHeader={false}
                  className="h-full"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  Select a market
                </div>
              )}
            </div>

            <div className="sticky top-0 z-30 flex h-12 shrink-0 items-center border-white/5 border-b bg-background px-2 shadow-sm">
              <button
                type="button"
                onClick={() => setBottomTab('positions')}
                className={cn(
                  'relative flex h-full min-w-[88px] flex-1 items-center justify-center py-3 font-bold text-sm capitalize transition-colors',
                  bottomTab === 'positions' ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                Positions
                {bottomTab === 'positions' && (
                  <div className="absolute bottom-0 left-0 h-0.5 w-full rounded-t-full bg-foreground" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setBottomTab('trades')}
                className={cn(
                  'relative flex h-full min-w-[88px] flex-1 items-center justify-center py-3 font-bold text-sm capitalize transition-colors',
                  bottomTab === 'trades' ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                Trades
                {bottomTab === 'trades' && (
                  <div className="absolute bottom-0 left-0 h-0.5 w-full rounded-t-full bg-foreground" />
                )}
              </button>
              <button
                type="button"
                disabled
                className="flex h-full min-w-[88px] flex-1 cursor-not-allowed items-center justify-center py-3 font-bold text-muted-foreground text-sm capitalize opacity-60"
              >
                Orders
                <span className="ml-2 rounded-full bg-muted/20 px-2 py-0.5 text-[10px] text-muted-foreground uppercase tracking-wider">
                  Soon
                </span>
              </button>
            </div>

            <div className="min-h-[320px] flex-1">
              {bottomTab === 'positions' ? (
                !authenticated ? (
                  <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                    Log in to view positions.
                  </div>
                ) : selected?.kind === 'prediction' ? (
                  <PredictionPositionsList
                    positions={selectedPredictionPositions}
                    onPositionSold={async () => {
                      invalidateUserPositions();
                      invalidateWalletBalance();
                      await Promise.all([
                        refreshPredictionPositions(),
                        refreshPerpPositions(),
                        refreshWalletBalance(),
                        refreshPredictionHistory(),
                      ]);
                    }}
                  />
                ) : (
                  <PerpPositionsList
                    positions={selectedPerpPositions}
                    onPositionClosed={async () => {
                      invalidateUserPositions();
                      invalidateWalletBalance();
                      await Promise.all([
                        refreshPerpPositions(),
                        refreshPredictionPositions(),
                        refreshWalletBalance(),
                        refreshPerpHistory(),
                      ]);
                    }}
                  />
                )
              ) : selected?.kind === 'prediction' ? (
                <div ref={mobileTradesContainerRef} className="h-full overflow-auto">
                  <AssetTradesFeed
                    marketType="prediction"
                    assetId={selected.id}
                    containerRef={mobileTradesContainerRef}
                  />
                </div>
              ) : selectedPerp ? (
                <div ref={mobileTradesContainerRef} className="h-full overflow-auto">
                  <AssetTradesFeed
                    marketType="perp"
                    assetId={selectedPerp.ticker}
                    containerRef={mobileTradesContainerRef}
                  />
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                  Select a market to see trades.
                </div>
              )}
            </div>

            <div className="h-28 shrink-0" />
          </div>

          <div className="pointer-events-none absolute bottom-[calc(72px+env(safe-area-inset-bottom)+24px)] left-0 z-30 flex w-full justify-center px-4">
            <button
              type="button"
              onClick={() => setIsMobileTradeSheetOpen(true)}
              className="pointer-events-auto w-full max-w-sm rounded-full bg-foreground py-3.5 font-bold text-background shadow-lg transition-transform active:scale-95"
              disabled={!selected}
            >
              Trade
            </button>
          </div>

          <div className="relative z-40 flex h-[72px] select-none items-center justify-between rounded-t-[20px] border-white/5 border-t bg-background px-2 pb-safe font-medium text-[10px] text-muted-foreground shadow-[0_-5px_15px_rgba(0,0,0,0.12)]">
            {/* Minimal bottom nav */}
            <button
              type="button"
              className="flex flex-1 flex-col items-center justify-center gap-1 py-1 font-bold text-foreground"
            >
              Markets
            </button>
            <button
              type="button"
              onClick={authenticated ? onRequestBuyPoints : login}
              className="flex flex-1 flex-col items-center justify-center gap-1 py-1 transition-colors hover:text-foreground"
            >
              {authenticated ? 'Balance' : 'Log in'}
            </button>
          </div>

          {isMobileMarketListOpen && (
            <div className="fade-in slide-in-from-bottom-2 absolute inset-0 z-50 flex animate-in flex-col bg-background duration-200">
              <div className="flex items-center justify-between border-white/5 border-b p-4">
                <h2 className="font-bold text-lg">Markets</h2>
                <button
                  type="button"
                  onClick={() => setIsMobileMarketListOpen(false)}
                  className="rounded-full p-2 transition-colors hover:bg-muted/20"
                  aria-label="Close markets list"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">{listPanel}</div>
            </div>
          )}

          {isMobileTradeSheetOpen && (
            <div className="fixed inset-0 z-50 flex flex-col justify-end">
              <button
                type="button"
                aria-label="Close trade sheet"
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={() => setIsMobileTradeSheetOpen(false)}
              />
              <div className="slide-in-from-bottom-2 relative z-10 flex max-h-[85vh] w-full animate-in flex-col rounded-t-2xl border-white/5 border-t bg-background/95 shadow-2xl duration-200">
                <div className="flex items-center justify-between border-white/5 border-b p-4">
                  <h2 className="font-bold text-lg">Trade</h2>
                  <button
                    type="button"
                    onClick={() => setIsMobileTradeSheetOpen(false)}
                    className="rounded-full p-2 transition-colors hover:bg-muted/20"
                    aria-label="Close trade sheet"
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {rightPanel}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <TradeConfirmationDialog
        open={confirmDialogOpen}
        onOpenChange={setConfirmDialogOpen}
        onConfirm={handleConfirmPredictionBuy}
        isSubmitting={predictionSubmitting}
        tradeDetails={
          predictionState && predictionCalculation
            ? ({
                type: 'buy-prediction',
                question: predictionState.text,
                side: predictionSide.toUpperCase() as 'YES' | 'NO',
                amount: predictionAmountNum,
                sharesBought: predictionCalculation.sharesBought,
                avgPrice: predictionCalculation.avgPrice,
                newPrice:
                  predictionSide === 'yes'
                    ? predictionCalculation.newYesPrice
                    : predictionCalculation.newNoPrice,
                priceImpact: predictionCalculation.priceImpact,
                expectedPayout,
                expectedProfit,
              } satisfies BuyPredictionDetails)
            : null
        }
      />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
  disabled,
  soon,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  soon?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        '-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2 font-semibold text-xs transition-colors',
        active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
        disabled && 'cursor-not-allowed opacity-60 hover:text-muted-foreground'
      )}
    >
      {children}
      {soon && (
        <span className="rounded-full bg-muted/20 px-2 py-0.5 text-[10px] text-muted-foreground uppercase tracking-wider">
          Soon
        </span>
      )}
    </button>
  );
}
