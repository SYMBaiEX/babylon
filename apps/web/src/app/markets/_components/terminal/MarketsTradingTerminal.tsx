'use client';

import {
  calculateExpectedPayout,
  PredictionPricing,
} from '@babylon/core/markets/prediction/client';
import { FEE_CONFIG } from '@babylon/engine/config/fees';
import { BABYLON_POINTS_SYMBOL, cn } from '@babylon/shared';
import {
  ArrowUpDown,
  Check,
  ChevronUp,
  Filter,
  Info,
  Maximize2,
  Minimize2,
  Search,
  Star,
  Wallet,
  X,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { toast } from 'sonner';
import { AssetTradesFeed } from '@/components/markets/AssetTradesFeed';
import { PerpPositionsList } from '@/components/markets/PerpPositionsList';
import { PerpPriceChart } from '@/components/markets/PerpPriceChart';
import { PredictionPositionsList } from '@/components/markets/PredictionPositionsList';
import { PredictionProbabilityChart } from '@/components/markets/PredictionProbabilityChart';
import {
  type BuyPredictionDetails,
  type SellPredictionDetails,
  TradeConfirmationDialog,
} from '@/components/markets/TradeConfirmationDialog';
import { Skeleton } from '@/components/shared/Skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/useAuth';
import { usePerpHistory } from '@/hooks/usePerpHistory';
import { usePortfolioPnL } from '@/hooks/usePortfolioPnL';
import { usePredictionHistory } from '@/hooks/usePredictionHistory';
import type {
  PredictionResolutionSSE,
  PredictionTradeSSE,
} from '@/hooks/usePredictionMarketStream';
import { usePredictionMarketStream } from '@/hooks/usePredictionMarketStream';
import {
  type MarketKey,
  useMarketWatchlistStore,
} from '@/stores/marketWatchlistStore';
import {
  usePerpMarkets,
  usePerpMarketsRealtime,
} from '@/stores/perpMarketsStore';
import {
  usePredictionMarkets,
  usePredictionMarketsPolling,
} from '@/stores/predictionMarketsStore';
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
import type {
  MarketTimeRange,
  PerpMarket,
  PredictionMarket,
  TradeSide,
} from '@/types/markets';
import { MARKET_TIME_RANGES } from '@/types/markets';
import { formatBalance } from '../../_lib/formatters';
import { PerpsOrderEntryPanel } from '../perps-terminal/PerpsOrderEntryPanel';
import { TerminalAgentsChat } from './TerminalAgentsChat';
import { TerminalPortfolio } from './TerminalPortfolio';
import { TerminalSocialFeed } from './TerminalSocialFeed';

type MarketsFilter = 'all' | 'favorites' | 'perp' | 'prediction';
type MarketsSort = 'volume' | 'change' | 'openInterest' | 'name';
type BottomTab = 'agent' | 'social' | 'portfolio' | 'positions' | 'trades';

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
  sortOpenInterest: number;
  sortName: string;
  perpMarket?: PerpMarket;
  predictionMarket?: PredictionMarket;
}

function parseFilter(params: URLSearchParams): MarketsFilter {
  const filter = params.get('filter');
  if (
    filter === 'perp' ||
    filter === 'prediction' ||
    filter === 'favorites' ||
    filter === 'all'
  ) {
    return filter;
  }
  const tab = params.get('tab') ?? params.get('tabs');
  if (tab === 'perps') return 'perp';
  if (tab === 'predictions') return 'prediction';
  return 'all';
}

function parseSort(params: URLSearchParams): MarketsSort {
  const sort = params.get('sort');
  if (
    sort === 'volume' ||
    sort === 'change' ||
    sort === 'openInterest' ||
    sort === 'name'
  ) {
    return sort;
  }
  return 'volume';
}

function parseSortDesc(params: URLSearchParams): boolean {
  const dir = params.get('sortDir');
  if (dir === 'asc') return false;
  if (dir === 'desc') return true;
  return true;
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
  const rounded =
    clamped >= 10 ? Math.round(clamped) : Math.round(clamped * 10) / 10;
  return `${rounded.toFixed(clamped >= 10 ? 0 : 1)}%`;
}

function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
}

function computeYesPctFromShares(
  market: PredictionMarketTerminalState
): number {
  // Prefer CPMM-derived probability from SSE when available
  if (market.yesProbability != null) {
    return market.yesProbability * 100;
  }
  // Fallback to share-ratio calculation
  const yes = Number(market.yesShares ?? 0);
  const no = Number(market.noShares ?? 0);
  const total = yes + no;
  if (total <= 0) return 50;
  return (yes / total) * 100;
}

/** Reusable time range selector for market charts */
function TimeRangeSelector({
  timeRange,
  onTimeRangeChange,
}: {
  timeRange: MarketTimeRange;
  onTimeRangeChange: (range: MarketTimeRange) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-md bg-muted/20 p-1 font-semibold text-xs">
      {MARKET_TIME_RANGES.map((range) => (
        <button
          key={range}
          type="button"
          onClick={() => onTimeRangeChange(range)}
          className={cn(
            'rounded px-2 py-1 transition-colors',
            timeRange === range
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {range}
        </button>
      ))}
    </div>
  );
}

/** Reusable prediction market header for mobile/desktop views */
function PredictionMarketHeader({
  predictionState,
  yesPct,
  timeRange,
  onTimeRangeChange,
  onDetailsClick,
  variant = 'default',
}: {
  predictionState: PredictionMarketTerminalState | null;
  yesPct: number;
  timeRange: MarketTimeRange;
  onTimeRangeChange: (range: MarketTimeRange) => void;
  onDetailsClick: () => void;
  variant?: 'default' | 'compact';
}) {
  const isCompact = variant === 'compact';
  const titleClass = isCompact
    ? 'whitespace-normal break-words font-bold text-sm leading-snug'
    : 'whitespace-normal break-words font-bold text-foreground text-lg leading-snug';

  return (
    <div
      className={cn(
        'shrink-0 border-white/5 border-b bg-background/40 px-4 py-3 backdrop-blur-md',
        isCompact ? 'space-y-2' : ''
      )}
    >
      <div
        className={cn(
          'flex gap-3',
          isCompact
            ? 'items-start justify-between'
            : 'flex-col lg:flex-row lg:items-start lg:justify-between'
        )}
      >
        <div className="min-w-0">
          <div className={titleClass}>
            {predictionState?.text ?? 'Prediction market'}
          </div>
          <div className="mt-1 whitespace-normal break-words text-muted-foreground text-xs">
            {predictionState?.resolutionDescription?.trim()
              ? predictionState.resolutionDescription
              : `Scenario ${predictionState?.scenario ?? ''}`}
          </div>
        </div>
        {isCompact ? (
          <button
            type="button"
            onClick={onDetailsClick}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border border-white/10 bg-background/30 text-muted-foreground transition-colors hover:bg-muted/20 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            aria-label="View market details"
            title="Details"
          >
            <Info size={14} />
          </button>
        ) : null}
      </div>

      <div
        className={cn(
          'flex items-center gap-2',
          isCompact
            ? 'flex-wrap justify-between'
            : 'flex-col gap-2 lg:items-end'
        )}
      >
        <div className="flex items-center gap-2">
          <div className="rounded-full bg-blue-500/10 px-2 py-1 font-bold text-[10px] text-blue-400 tabular-nums">
            YES {formatYesPct(yesPct)}
          </div>
          <div className="rounded-full bg-violet-500/10 px-2 py-1 font-bold text-[10px] text-violet-400 tabular-nums">
            NO {formatYesPct(100 - yesPct)}
          </div>
          {!isCompact && (
            <button
              type="button"
              onClick={onDetailsClick}
              className="inline-flex h-8 w-8 items-center justify-center rounded border border-white/10 bg-background/30 text-muted-foreground transition-colors hover:bg-muted/20 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              aria-label="View market details"
              title="Details"
            >
              <Info size={14} />
            </button>
          )}
        </div>
        <TimeRangeSelector
          timeRange={timeRange}
          onTimeRangeChange={onTimeRangeChange}
        />
      </div>
    </div>
  );
}

/** Reusable perp market header for mobile/desktop views */
function PerpMarketHeader({
  selectedPerp,
  timeRange,
  onTimeRangeChange,
  variant = 'default',
}: {
  selectedPerp: PerpMarket;
  timeRange: MarketTimeRange;
  onTimeRangeChange: (range: MarketTimeRange) => void;
  variant?: 'default' | 'compact';
}) {
  const isCompact = variant === 'compact';
  const titleClass = isCompact
    ? 'font-bold text-foreground text-sm'
    : 'font-bold text-foreground text-lg';

  return (
    <div className="flex shrink-0 items-start justify-between gap-3 border-white/5 border-b bg-background/40 px-4 py-3 backdrop-blur-md">
      <div className="min-w-0">
        <div className={titleClass}>${selectedPerp.ticker}</div>
        <div className="truncate text-muted-foreground text-xs">
          {selectedPerp.name}
        </div>
      </div>
      <TimeRangeSelector
        timeRange={timeRange}
        onTimeRangeChange={onTimeRangeChange}
      />
    </div>
  );
}

export function MarketsTradingTerminal({
  onRequestBuyPoints,
}: MarketsTradingTerminalProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const terminalRootRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const previousOverflowRef = useRef<{
    body: string;
    html: string;
  } | null>(null);

  const { user, authenticated, login, getAccessToken } = useAuth();
  const userId = authenticated ? (user?.id ?? null) : null;

  const {
    markets: perpMarkets,
    loading: perpLoading,
    error: perpError,
  } = usePerpMarkets();
  usePerpMarketsRealtime();

  const {
    markets: predictionMarkets,
    loading: predictionLoading,
    error: predictionError,
  } = usePredictionMarkets(userId ?? undefined);
  usePredictionMarketsPolling(30_000, userId ?? undefined);

  useUserPositionsPolling(userId);
  useWalletBalancePolling(userId);
  const {
    balance,
    loading: balanceLoading,
    refresh: refreshWalletBalance,
  } = useWalletBalance(userId);

  const { positions: perpPositions, refresh: refreshPerpPositions } =
    usePerpPositions(userId);
  const {
    positions: predictionPositions,
    refresh: refreshPredictionPositions,
  } = usePredictionPositions(userId);
  const {
    data: portfolioPnL,
    loading: portfolioLoading,
    error: portfolioError,
    refresh: refreshPortfolio,
  } = usePortfolioPnL();

  const [filter, setFilter] = useState<MarketsFilter>(() =>
    parseFilter(searchParams)
  );
  const [sortBy, setSortBy] = useState<MarketsSort>(() =>
    parseSort(searchParams)
  );
  const [sortDesc, setSortDesc] = useState(() => parseSortDesc(searchParams));
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<MarketKey | null>(() =>
    parseSelected(searchParams)
  );

  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [bottomCollapsed, setBottomCollapsed] = useState(false);
  const [bottomTab, setBottomTab] = useState<BottomTab>('agent');

  const [showMarketsMenu, setShowMarketsMenu] = useState(false);
  const marketsMenuRef = useRef<HTMLDivElement | null>(null);

  const [predictionSide, setPredictionSide] = useState<'yes' | 'no'>(
    () => parsePredictionSide(searchParams) ?? 'yes'
  );
  const [predictionAmount, setPredictionAmount] = useState('10');
  const [predictionTradeMode, setPredictionTradeMode] = useState<
    'buy' | 'sell'
  >('buy');
  const [predictionSellShares, setPredictionSellShares] = useState('');
  const [predictionSubmitting, setPredictionSubmitting] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [predictionDetailsOpen, setPredictionDetailsOpen] = useState(false);

  const [perpTimeRange, setPerpTimeRange] = useState<MarketTimeRange>('1D');
  const [predictionTimeRange, setPredictionTimeRange] =
    useState<MarketTimeRange>('ALL');
  const [perpSideFromUrl, setPerpSideFromUrl] = useState<TradeSide | null>(() =>
    parsePerpSide(searchParams)
  );

  // Mobile UI state
  const [isMobileMarketListOpen, setIsMobileMarketListOpen] = useState(false);
  const [isMobileTradeSheetOpen, setIsMobileTradeSheetOpen] = useState(false);
  const [isMobileChartFullscreen, setIsMobileChartFullscreen] = useState(false);
  const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(false);

  const openMobilePanel = useCallback((tab?: BottomTab) => {
    if (tab) setBottomTab(tab);
    setIsMobilePanelOpen(true);
    setIsMobileMarketListOpen(false);
    setIsMobileTradeSheetOpen(false);
  }, []);

  useEffect(() => {
    if (!isFullscreen) return undefined;

    previousOverflowRef.current = {
      body: document.body.style.overflow,
      html: document.documentElement.style.overflow,
    };
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflowRef.current?.body ?? '';
      document.documentElement.style.overflow =
        previousOverflowRef.current?.html ?? '';
      previousOverflowRef.current = null;
    };
  }, [isFullscreen]);

  useEffect(() => {
    if (!isFullscreen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsFullscreen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFullscreen]);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  useEffect(() => {
    if (!showMarketsMenu) return undefined;

    const onMouseDown = (event: MouseEvent) => {
      if (
        marketsMenuRef.current &&
        !marketsMenuRef.current.contains(event.target as Node)
      ) {
        setShowMarketsMenu(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowMarketsMenu(false);
    };

    document.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [showMarketsMenu]);

  // One-way sync from URL → local UI state
  useEffect(() => {
    const nextFilter = parseFilter(searchParams);
    setFilter(nextFilter);
    setSelected(parseSelected(searchParams));
    setSortBy(parseSort(searchParams));
    setSortDesc(parseSortDesc(searchParams));

    const nextPerpSide = parsePerpSide(searchParams);
    const nextPredSide = parsePredictionSide(searchParams);
    setPerpSideFromUrl(nextPerpSide);
    if (nextPerpSide) {
      // Perps order entry manages its own side; we only use this to open the trade sheet.
      setIsMobileTradeSheetOpen(true);
    }
    if (nextPredSide) setPredictionSide(nextPredSide);
  }, [searchParams]);

  const favoritesSet = useMarketWatchlistStore((s) => s.favoritesSet);
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
      sortOpenInterest: m.openInterest ?? 0,
      sortName: m.ticker.toLowerCase(),
      perpMarket: m,
    }));

    const preds: UnifiedRow[] = predictionMarkets.map((m) => {
      const yesPct = computeYesPctFromShares(
        m as PredictionMarketTerminalState
      );
      const vol = Number(m.yesShares ?? 0) + Number(m.noShares ?? 0);
      return {
        key: { kind: 'prediction', id: m.id.toString() },
        kind: 'prediction',
        title: m.text,
        subtitle: `Scenario ${m.scenario}`,
        valuePrimary: `YES ${formatYesPct(yesPct)}`,
        valueSecondary:
          m.status !== 'active' ? m.status.toUpperCase() : undefined,
        change24hPct: null,
        sortVolume: vol,
        sortOpenInterest: 0,
        sortName: m.text.toLowerCase(),
        predictionMarket: m,
      };
    });

    const combined = [...perps, ...preds];

    const filtered = combined.filter((row) => {
      if (filter === 'favorites') {
        if (!isFavorite(row.key)) return false;
      } else if (filter !== 'all' && row.kind !== filter) {
        return false;
      }
      if (q.length === 0) return true;
      return (
        row.title.toLowerCase().includes(q) ||
        row.subtitle.toLowerCase().includes(q) ||
        (row.kind === 'perp' && row.perpMarket?.name.toLowerCase().includes(q))
      );
    });

    return filtered.sort((a, b) => {
      const compareNumbers = (valA: number, valB: number) =>
        sortDesc ? valB - valA : valA - valB;

      if (sortBy === 'name') {
        const byName = a.sortName.localeCompare(b.sortName);
        return sortDesc ? -byName : byName;
      }

      if (sortBy === 'change') {
        // Use direction-aware sentinel so nulls always sort last
        const sentinel = sortDesc
          ? Number.NEGATIVE_INFINITY
          : Number.POSITIVE_INFINITY;
        const valA = a.change24hPct ?? sentinel;
        const valB = b.change24hPct ?? sentinel;
        const byChange = compareNumbers(valA, valB);
        if (byChange !== 0) return byChange;
      } else if (sortBy === 'openInterest') {
        const byOI = compareNumbers(a.sortOpenInterest, b.sortOpenInterest);
        if (byOI !== 0) return byOI;
      } else {
        const byVol = compareNumbers(a.sortVolume, b.sortVolume);
        if (byVol !== 0) return byVol;
      }

      const byVolFallback = compareNumbers(a.sortVolume, b.sortVolume);
      if (byVolFallback !== 0) return byVolFallback;
      return a.sortName.localeCompare(b.sortName);
    });
  }, [
    perpMarkets,
    predictionMarkets,
    query,
    filter,
    sortBy,
    sortDesc,
    isFavorite,
  ]);

  // Ensure a default selection and sync URL when auto-selecting
  useEffect(() => {
    if (rows.length === 0) return;

    const selectAndUpdateUrl = (key: MarketKey | null) => {
      setSelected(key);
      if (key) {
        const next = new URLSearchParams(searchParams.toString());
        next.set('marketKind', key.kind);
        next.set('marketId', key.id);
        next.set('filter', filter);
        next.delete('tab');
        next.delete('tabs');
        next.delete('side');
        router.replace(`/markets?${next.toString()}`, { scroll: false });
      }
    };

    if (!selected) {
      selectAndUpdateUrl(rows[0]?.key ?? null);
      return;
    }
    const stillVisible = rows.some(
      (row) =>
        row.key.kind === selected.kind &&
        row.key.id.toString() === selected.id.toString()
    );
    if (!stillVisible) selectAndUpdateUrl(rows[0]?.key ?? null);
  }, [selected, rows, router, searchParams, filter]);

  const selectedPerp = useMemo(() => {
    if (!selected || selected.kind !== 'perp') return null;
    return (
      perpMarkets.find(
        (m) => m.ticker.toUpperCase() === selected.id.toUpperCase()
      ) ?? null
    );
  }, [selected, perpMarkets]);

  const [predictionState, setPredictionState] =
    useState<PredictionMarketTerminalState | null>(null);

  useEffect(() => {
    if (!selected || selected.kind !== 'prediction') {
      setPredictionState(null);
      return;
    }
    const base =
      predictionMarkets.find((m) => m.id.toString() === selected.id) ?? null;
    setPredictionState(base as PredictionMarketTerminalState | null);
  }, [selected, predictionMarkets]);

  const handlePredictionTradeEvent = useCallback(
    (event: PredictionTradeSSE) => {
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
    },
    []
  );

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

  usePredictionMarketStream(
    selected?.kind === 'prediction' ? selected.id : null,
    {
      onTrade: handlePredictionTradeEvent,
      onResolution: handlePredictionResolutionEvent,
    }
  );

  const predictionEffectiveShares = useMemo(() => {
    if (!predictionState) return null;

    const yes = Number(predictionState.yesShares ?? 0);
    const no = Number(predictionState.noShares ?? 0);

    if (yes > 0 && no > 0) {
      return {
        yesShares: yes,
        noShares: no,
        liquidity: Number(predictionState.liquidity ?? yes + no),
      };
    }

    const seeded = PredictionPricing.initializeMarket();
    return {
      yesShares: seeded.yesShares,
      noShares: seeded.noShares,
      liquidity: seeded.yesShares + seeded.noShares,
    };
  }, [
    predictionState?.id,
    predictionState?.yesShares,
    predictionState?.noShares,
    predictionState?.liquidity,
    predictionState,
  ]);

  const predictionHistorySeed = useMemo(
    () =>
      predictionEffectiveShares
        ? {
            yesShares: predictionEffectiveShares.yesShares,
            noShares: predictionEffectiveShares.noShares,
            liquidity: predictionEffectiveShares.liquidity,
          }
        : undefined,
    [predictionEffectiveShares]
  );

  const { history: predictionHistory, refresh: refreshPredictionHistory } =
    usePredictionHistory(selected?.kind === 'prediction' ? selected.id : null, {
      limit: 1000,
      seed: predictionHistorySeed,
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

  const handleSortChange = useCallback(
    (nextSort: MarketsSort) => {
      const next = new URLSearchParams(searchParams.toString());
      if (sortBy === nextSort) {
        const nextDesc = !sortDesc;
        setSortDesc(nextDesc);
        next.set('sort', nextSort);
        next.set('sortDir', nextDesc ? 'desc' : 'asc');
      } else {
        setSortBy(nextSort);
        setSortDesc(true);
        next.set('sort', nextSort);
        next.set('sortDir', 'desc');
      }
      router.replace(`/markets?${next.toString()}`, { scroll: false });
    },
    [router, searchParams, sortBy, sortDesc]
  );

  const selectedPredictionId =
    selected?.kind === 'prediction' ? selected.id : null;
  const selectedPredictionPositions = useMemo(() => {
    if (!selectedPredictionId) return [];
    return predictionPositions.filter(
      (p) => p.marketId.toString() === selectedPredictionId
    );
  }, [predictionPositions, selectedPredictionId]);

  const selectedPredictionShares = useMemo(() => {
    let yesShares = 0;
    let noShares = 0;
    for (const position of selectedPredictionPositions) {
      if (position.side === 'YES') yesShares += position.shares;
      if (position.side === 'NO') noShares += position.shares;
    }
    return { yesShares, noShares };
  }, [selectedPredictionPositions]);

  const canSellPrediction =
    authenticated &&
    (selectedPredictionShares.yesShares >= 0.01 ||
      selectedPredictionShares.noShares >= 0.01);

  useEffect(() => {
    if (predictionTradeMode !== 'sell') return;
    if (canSellPrediction) return;
    setPredictionTradeMode('buy');
    setPredictionSellShares('');
  }, [canSellPrediction, predictionTradeMode]);

  useEffect(() => {
    if (predictionTradeMode !== 'sell') return;
    if (!canSellPrediction) return;
    const canSellThisSide =
      predictionSide === 'yes'
        ? selectedPredictionShares.yesShares >= 0.01
        : selectedPredictionShares.noShares >= 0.01;
    if (canSellThisSide) return;
    const canSellOtherSide =
      predictionSide === 'yes'
        ? selectedPredictionShares.noShares >= 0.01
        : selectedPredictionShares.yesShares >= 0.01;
    if (!canSellOtherSide) return;
    setPredictionSide((prev) => (prev === 'yes' ? 'no' : 'yes'));
    setPredictionSellShares('');
  }, [
    canSellPrediction,
    predictionSide,
    predictionTradeMode,
    selectedPredictionShares.noShares,
    selectedPredictionShares.yesShares,
  ]);

  const selectedPerpPositions = useMemo(() => {
    if (!selectedPerp) return [];
    return perpPositions.filter(
      (p) =>
        p.ticker.toUpperCase() === selectedPerp.ticker.toUpperCase() &&
        !p.closedAt
    );
  }, [perpPositions, selectedPerp]);

  const predictionAmountNum = Number.parseFloat(predictionAmount) || 0;
  const predictionSellSharesNum = Number.parseFloat(predictionSellShares) || 0;

  const predictionBuyCalculation = useMemo(() => {
    if (!predictionEffectiveShares) return null;
    if (predictionAmountNum <= 0) return null;
    try {
      return PredictionPricing.calculateBuyWithFees(
        predictionEffectiveShares.yesShares,
        predictionEffectiveShares.noShares,
        predictionSide,
        predictionAmountNum,
        FEE_CONFIG.TRADING_FEE_RATE
      );
    } catch {
      return null;
    }
  }, [predictionEffectiveShares, predictionSide, predictionAmountNum]);

  const sellPosition = useMemo(() => {
    const wantedSide = predictionSide.toUpperCase() as 'YES' | 'NO';
    const candidates = selectedPredictionPositions.filter(
      (p) => p.side === wantedSide && p.shares >= 0.01
    );
    if (candidates.length === 0) return null;
    const first = candidates[0];
    if (!first) return null;
    return candidates
      .slice(1)
      .reduce((best, pos) => (pos.shares > best.shares ? pos : best), first);
  }, [predictionSide, selectedPredictionPositions]);

  const maxSellShares = sellPosition?.shares ?? 0;
  const clampedSellShares =
    predictionSellSharesNum > 0
      ? Math.min(predictionSellSharesNum, maxSellShares)
      : 0;

  const predictionSellCalculation = useMemo(() => {
    if (!predictionEffectiveShares) return null;
    if (!sellPosition) return null;
    if (clampedSellShares <= 0) return null;
    try {
      return PredictionPricing.calculateSellWithFees(
        predictionEffectiveShares.yesShares,
        predictionEffectiveShares.noShares,
        predictionSide,
        clampedSellShares,
        FEE_CONFIG.TRADING_FEE_RATE
      );
    } catch {
      return null;
    }
  }, [
    predictionEffectiveShares,
    predictionSide,
    sellPosition,
    clampedSellShares,
  ]);

  const expectedPayout = useMemo(() => {
    if (!predictionBuyCalculation) return 0;
    return calculateExpectedPayout(
      predictionBuyCalculation.sharesBought,
      predictionBuyCalculation.avgPrice
    );
  }, [predictionBuyCalculation]);
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
    if (predictionTradeMode === 'buy') {
      if (predictionAmountNum < 1) {
        toast.error(`Minimum bet is ${BABYLON_POINTS_SYMBOL}1`);
        return;
      }
      if (!predictionBuyCalculation) {
        toast.error('Unable to calculate buy quote.');
        return;
      }
    } else {
      if (!sellPosition) {
        toast.error('No sellable position for this side.');
        return;
      }
      if (clampedSellShares < 0.01) {
        toast.error('Minimum sell is 0.01 shares');
        return;
      }
      if (!predictionSellCalculation) {
        toast.error('Unable to calculate sell quote.');
        return;
      }
    }
    setConfirmDialogOpen(true);
  };

  const handleConfirmPredictionTrade = async () => {
    if (!predictionState) return;
    if (predictionTradeMode === 'buy' && !predictionBuyCalculation) {
      toast.error('Invalid buy amount.');
      return;
    }
    if (predictionTradeMode === 'sell') {
      if (!sellPosition) {
        toast.error('No sellable position for this side.');
        return;
      }
      if (clampedSellShares < 0.01) {
        toast.error('Minimum sell is 0.01 shares');
        return;
      }
      if (!predictionSellCalculation) {
        toast.error('Unable to calculate sell quote.');
        return;
      }
    }

    setPredictionSubmitting(true);
    setConfirmDialogOpen(false);

    try {
      const token = await getAccessToken();
      if (!token) {
        toast.error('Authentication required. Please log in.');
        return;
      }

      const url =
        predictionTradeMode === 'buy'
          ? `/api/markets/predictions/${encodeURIComponent(predictionState.id.toString())}/buy`
          : `/api/markets/predictions/${encodeURIComponent(predictionState.id.toString())}/sell`;

      // Note: sellPosition is validated earlier in this function for sell mode
      const body =
        predictionTradeMode === 'buy'
          ? { side: predictionSide, amount: predictionAmountNum }
          : { shares: clampedSellShares, positionId: sellPosition!.id };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      let data: unknown = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (!response.ok) {
        const maybeError = data as {
          error?: unknown;
          message?: unknown;
        } | null;
        const errorMessage =
          typeof maybeError?.error === 'object'
            ? ((maybeError.error as { message?: unknown })
                ?.message as string) ||
              (predictionTradeMode === 'sell'
                ? 'Failed to sell shares'
                : 'Failed to buy shares')
            : (maybeError?.error as string) ||
              (maybeError?.message as string) ||
              (predictionTradeMode === 'sell'
                ? 'Failed to sell shares'
                : 'Failed to buy shares');
        toast.error(errorMessage);
        return;
      }

      if (predictionTradeMode === 'buy') {
        toast.success(`Bought ${predictionSide.toUpperCase()} shares!`, {
          description: predictionBuyCalculation
            ? `${predictionBuyCalculation.sharesBought.toFixed(2)} shares at ${predictionBuyCalculation.avgPrice.toFixed(3)} each`
            : undefined,
        });
      } else {
        toast.success(`Sold ${predictionSide.toUpperCase()} shares!`, {
          description: `${clampedSellShares.toFixed(2)} shares sold`,
        });
      }

      invalidateUserPositions();
      invalidateWalletBalance();
      await Promise.all([
        refreshPredictionPositions(),
        refreshPerpPositions(),
        refreshWalletBalance(),
        refreshPredictionHistory(),
      ]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to trade';
      toast.error(message);
    } finally {
      setPredictionSubmitting(false);
    }
  };

  const desktopTradesContainerRef = useRef<HTMLDivElement | null>(null);
  const mobileTradesContainerRef = useRef<HTMLDivElement | null>(null);

  const terminalHeader = (
    <div className="flex h-11 shrink-0 items-center justify-between border-white/5 border-b bg-background/40 px-3 backdrop-blur-md">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="truncate font-semibold text-muted-foreground text-xs uppercase tracking-wider">
          Terminal
        </div>
      </div>

      <div className="ml-3 flex items-center gap-2 text-xs">
        {!authenticated && (
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
      <div
        ref={marketsMenuRef}
        className="shrink-0 space-y-3 border-white/5 border-b p-3"
      >
        <div className="flex items-center justify-between">
          <div className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
            Markets
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowMarketsMenu((v) => !v)}
              aria-expanded={showMarketsMenu}
              aria-controls="markets-filter-sort"
              className={cn(
                'rounded p-1.5 transition-colors hover:bg-muted/20',
                showMarketsMenu ||
                  filter !== 'all' ||
                  sortBy !== 'volume' ||
                  sortDesc !== true
                  ? 'bg-muted/20 text-primary'
                  : 'text-muted-foreground'
              )}
              aria-label="Filter and sort markets"
              title="Filter & Sort"
            >
              <Filter size={14} />
            </button>

            <button
              type="button"
              onClick={() => setLeftCollapsed(true)}
              className="hidden rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted/20 hover:text-foreground md:inline-flex"
              aria-label="Collapse markets panel"
            >
              ◀
            </button>
          </div>
        </div>

        {showMarketsMenu && (
          <div
            id="markets-filter-sort"
            className="fade-in-0 animate-in rounded-md border border-white/10 bg-background/40 py-1 shadow-sm duration-150"
          >
            <div className="px-3 py-2 font-bold text-[10px] text-muted-foreground uppercase tracking-wider">
              Type
            </div>
            {(
              [
                { id: 'all', label: 'All Markets' },
                { id: 'favorites', label: 'Favorites' },
                { id: 'perp', label: 'Perps' },
                { id: 'prediction', label: 'Prediction' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-muted/20"
                onClick={() => {
                  handleFilterChange(opt.id);
                  setShowMarketsMenu(false);
                }}
              >
                <span
                  className={cn(
                    opt.id === filter
                      ? 'font-medium text-primary'
                      : 'text-foreground'
                  )}
                >
                  {opt.label}
                </span>
                {opt.id === filter && (
                  <Check size={12} className="text-primary" />
                )}
              </button>
            ))}

            <div className="my-1 border-white/10 border-t" />

            <div className="px-3 py-2 font-bold text-[10px] text-muted-foreground uppercase tracking-wider">
              Sort By
            </div>
            {(
              [
                { id: 'volume', label: 'Volume' },
                { id: 'change', label: '24h Change' },
                { id: 'openInterest', label: 'Open Interest' },
                { id: 'name', label: 'Name' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-muted/20"
                onClick={() => handleSortChange(opt.id)}
              >
                <span
                  className={cn(
                    opt.id === sortBy
                      ? 'font-medium text-primary'
                      : 'text-foreground'
                  )}
                >
                  {opt.label}
                </span>
                {opt.id === sortBy && (
                  <ArrowUpDown
                    size={12}
                    className={cn(
                      'text-primary transition-transform',
                      sortDesc ? 'rotate-0' : 'rotate-180'
                    )}
                  />
                )}
              </button>
            ))}
          </div>
        )}

        <div className="relative">
          <Search
            className="-translate-y-1/2 absolute top-1/2 left-2 text-muted-foreground"
            size={14}
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="w-full rounded border border-white/10 bg-background/40 py-2 pr-3 pl-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
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
            <thead className="sr-only">
              <tr className="border-white/5 border-b">
                <th className="w-10 px-3 py-2">Favorite</th>
                <th className="px-2 py-2">Market</th>
                <th className="px-2 py-2 text-right">Value</th>
                <th className="px-3 py-2 text-right">24h</th>
              </tr>
            </thead>
            <tbody className="border-white/5 border-t">
              {rows.map((row) => {
                const active =
                  selected?.kind === row.key.kind &&
                  selected.id.toString() === row.key.id.toString();
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
                        <Star
                          size={14}
                          fill={isFavorite(row.key) ? 'currentColor' : 'none'}
                        />
                      </button>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex min-w-0 flex-col">
                        <div className="truncate font-bold text-foreground">
                          {row.title}
                        </div>
                        <div className="truncate text-[10px] text-muted-foreground">
                          {row.subtitle}
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
                            change >= 0
                              ? 'bg-green-500/10 text-green-500'
                              : 'bg-red-500/10 text-red-500'
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
                  <td
                    colSpan={4}
                    className="p-6 text-center text-muted-foreground"
                  >
                    No markets found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {favoritesSet.size > 0 && (
        <div className="border-white/5 border-t p-2 text-[10px] text-muted-foreground">
          Favorites: {favoritesSet.size}
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
          <div className="shrink-0 border-white/5 border-b px-4 py-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="whitespace-normal break-words font-bold text-foreground text-lg leading-snug">
                  {predictionState?.text ?? 'Prediction market'}
                </div>
                <div className="mt-1 whitespace-normal break-words text-muted-foreground text-xs">
                  {predictionState?.resolutionDescription?.trim()
                    ? predictionState.resolutionDescription
                    : `Scenario ${predictionState?.scenario ?? ''}${
                        formatDate(
                          predictionState?.endDate ??
                            predictionState?.resolutionDate
                        )
                          ? ` • Ends ${formatDate(predictionState?.endDate ?? predictionState?.resolutionDate)}`
                          : ''
                      }`}
                </div>
              </div>

              <div className="flex flex-col gap-2 lg:items-end">
                <div className="flex items-center gap-2">
                  <div className="rounded-full bg-blue-500/10 px-2 py-1 font-bold text-[10px] text-blue-400 tabular-nums">
                    YES {formatYesPct(predictionYesPct)}
                  </div>
                  <div className="rounded-full bg-violet-500/10 px-2 py-1 font-bold text-[10px] text-violet-400 tabular-nums">
                    NO {formatYesPct(100 - predictionYesPct)}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPredictionDetailsOpen(true)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded border border-white/10 bg-background/30 text-muted-foreground transition-colors hover:bg-muted/20 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                    aria-label="View market details"
                    title="Details"
                  >
                    <Info size={14} />
                  </button>
                </div>

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
          </div>

          <div className="min-h-0 flex-1 p-4">
            <PredictionProbabilityChart
              data={predictionHistory}
              marketId={selectedPredictionId ?? 'unknown'}
              timeRange={predictionTimeRange}
              onTimeRangeChange={setPredictionTimeRange}
              showHeader={false}
              height="fill"
            />
          </div>
        </>
      ) : selectedPerp ? (
        <>
          <div className="flex shrink-0 items-start justify-between gap-3 border-white/5 border-b px-4 py-3">
            <div className="min-w-0">
              <div className="font-bold text-foreground text-lg">
                ${selectedPerp.ticker}
              </div>
              <div className="truncate text-muted-foreground text-xs">
                {selectedPerp.name}
              </div>
            </div>
            <div className="flex items-center gap-1 rounded-md bg-muted/20 p-1 font-semibold text-xs">
              {MARKET_TIME_RANGES.map((range) => (
                <button
                  key={range}
                  type="button"
                  onClick={() => setPerpTimeRange(range)}
                  className={cn(
                    'rounded px-2 py-1 transition-colors',
                    perpTimeRange === range
                      ? 'bg-foreground text-background'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {range}
                </button>
              ))}
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
      </div>

      {selected?.kind === 'prediction' ? (
        <div className="flex h-full min-h-0 flex-col bg-background/10">
          <div className="border-white/5 border-b bg-muted/10 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Available Balance
                </div>
                <div className="flex items-center gap-2 font-mono text-foreground text-lg tabular-nums">
                  <Wallet size={14} className="text-muted-foreground" />
                  {balanceLoading ? (
                    <Skeleton className="h-5 w-20" />
                  ) : (
                    formatBalance(balance)
                  )}
                  {onRequestBuyPoints && (
                    <button
                      type="button"
                      onClick={onRequestBuyPoints}
                      className="ml-2 rounded bg-muted/20 px-2 py-1 font-sans text-[10px] text-muted-foreground uppercase tracking-wider transition-colors hover:bg-muted/30 hover:text-foreground"
                    >
                      Buy
                    </button>
                  )}
                </div>
              </div>
              {selectedPredictionPositions.length > 0 && (
                <div className="text-right">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    Open Position
                  </div>
                  <div className="text-xs">
                    {(['YES', 'NO'] as const)
                      .map((side) => {
                        const total = selectedPredictionPositions
                          .filter((p) => p.side === side)
                          .reduce((sum, p) => sum + p.shares, 0);
                        return total > 0 ? `${side} ${total.toFixed(2)}` : null;
                      })
                      .filter(Boolean)
                      .join(' • ')}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-4 pb-[calc(env(safe-area-inset-bottom)+24px)]">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-sm">Place Order</div>
              <div className="rounded bg-muted/20 px-2 py-1 text-[10px] text-muted-foreground uppercase tracking-wider">
                Standard
              </div>
            </div>

            <div className="mt-3 flex rounded-md bg-muted/20 p-1">
              <button
                type="button"
                onClick={() => setPredictionSide('yes')}
                disabled={
                  predictionTradeMode === 'sell' &&
                  canSellPrediction &&
                  selectedPredictionShares.yesShares < 0.01
                }
                className={cn(
                  'flex-1 rounded-sm py-2 font-bold text-xs transition-colors',
                  predictionTradeMode === 'sell' &&
                    canSellPrediction &&
                    selectedPredictionShares.yesShares < 0.01 &&
                    'cursor-not-allowed opacity-50 hover:text-muted-foreground',
                  predictionSide === 'yes'
                    ? 'bg-blue-500 text-white'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                YES
              </button>
              <button
                type="button"
                onClick={() => setPredictionSide('no')}
                disabled={
                  predictionTradeMode === 'sell' &&
                  canSellPrediction &&
                  selectedPredictionShares.noShares < 0.01
                }
                className={cn(
                  'flex-1 rounded-sm py-2 font-bold text-xs transition-colors',
                  predictionTradeMode === 'sell' &&
                    canSellPrediction &&
                    selectedPredictionShares.noShares < 0.01 &&
                    'cursor-not-allowed opacity-50 hover:text-muted-foreground',
                  predictionSide === 'no'
                    ? 'bg-violet-500 text-white'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                NO
              </button>
            </div>

            {canSellPrediction && (
              <div className="mt-3 flex rounded-md bg-muted/20 p-1">
                <button
                  type="button"
                  onClick={() => setPredictionTradeMode('buy')}
                  className={cn(
                    'flex-1 rounded-sm py-2 font-bold text-xs transition-colors',
                    predictionTradeMode === 'buy'
                      ? 'bg-green-600 text-white'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  BUY
                </button>
                <button
                  type="button"
                  onClick={() => setPredictionTradeMode('sell')}
                  className={cn(
                    'flex-1 rounded-sm py-2 font-bold text-xs transition-colors',
                    predictionTradeMode === 'sell'
                      ? 'bg-red-600 text-white'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  SELL
                </button>
              </div>
            )}

            {predictionTradeMode === 'buy' ? (
              <div className={cn('mt-4', !canSellPrediction && 'mt-3')}>
                <div className="mb-1 flex items-center justify-between">
                  <label className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                    Amount
                  </label>
                  <span className="text-[10px] text-muted-foreground">
                    Min {BABYLON_POINTS_SYMBOL}1
                  </span>
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
            ) : (
              <div className={cn('mt-4', !canSellPrediction && 'mt-3')}>
                <div className="mb-1 flex items-center justify-between">
                  <label className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                    Shares
                  </label>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span>Min 0.01</span>
                    <button
                      type="button"
                      onClick={() =>
                        setPredictionSellShares(
                          maxSellShares > 0 ? maxSellShares.toFixed(2) : ''
                        )
                      }
                      className="rounded bg-muted/20 px-2 py-0.5 hover:bg-muted/30"
                      disabled={maxSellShares <= 0}
                    >
                      Max
                    </button>
                  </div>
                </div>
                <input
                  type="number"
                  value={predictionSellShares}
                  onChange={(e) => setPredictionSellShares(e.target.value)}
                  min={0.01}
                  step="0.01"
                  className="w-full rounded border border-white/10 bg-background/30 px-3 py-2 font-mono text-sm tabular-nums focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder={
                    maxSellShares > 0 ? maxSellShares.toFixed(2) : '0.00'
                  }
                  disabled={maxSellShares <= 0}
                />
                {maxSellShares <= 0 && (
                  <div className="mt-2 text-[10px] text-muted-foreground">
                    No sellable position for this side.
                  </div>
                )}
              </div>
            )}

            {predictionTradeMode === 'buy' && predictionBuyCalculation && (
              <div className="mt-4 rounded border border-white/10 bg-muted/10 p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Shares</span>
                  <span className="font-mono text-foreground tabular-nums">
                    {predictionBuyCalculation.sharesBought.toFixed(2)}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-muted-foreground">Avg price</span>
                  <span className="font-mono text-foreground tabular-nums">
                    ${predictionBuyCalculation.avgPrice.toFixed(3)}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-muted-foreground">Fee</span>
                  <span className="font-mono text-muted-foreground tabular-nums">
                    {BABYLON_POINTS_SYMBOL}
                    {predictionBuyCalculation.fee?.toFixed(2) ?? '0.00'}
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

            {predictionTradeMode === 'sell' && predictionSellCalculation && (
              <div className="mt-4 rounded border border-white/10 bg-muted/10 p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Gross proceeds</span>
                  <span className="font-mono text-foreground tabular-nums">
                    {BABYLON_POINTS_SYMBOL}
                    {predictionSellCalculation.totalCost.toFixed(2)}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-muted-foreground">Fee</span>
                  <span className="font-mono text-muted-foreground tabular-nums">
                    {BABYLON_POINTS_SYMBOL}
                    {predictionSellCalculation.fee?.toFixed(2) ?? '0.00'}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between font-semibold">
                  <span className="text-muted-foreground">Net proceeds</span>
                  <span className="font-mono text-foreground tabular-nums">
                    {BABYLON_POINTS_SYMBOL}
                    {(
                      predictionSellCalculation.netProceeds ??
                      predictionSellCalculation.netAmount ??
                      predictionSellCalculation.totalCost
                    ).toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={handlePredictionSubmit}
              disabled={
                predictionSubmitting ||
                (predictionTradeMode === 'buy' &&
                  authenticated &&
                  (predictionAmountNum < 1 || !predictionBuyCalculation)) ||
                (predictionTradeMode === 'sell' &&
                  authenticated &&
                  (maxSellShares <= 0 ||
                    clampedSellShares < 0.01 ||
                    !predictionSellCalculation))
              }
              className={cn(
                'mt-5 w-full rounded py-3 font-bold text-sm text-white shadow transition-all',
                predictionTradeMode === 'buy'
                  ? 'bg-green-600 hover:brightness-110'
                  : 'bg-red-600 hover:brightness-110',
                (predictionSubmitting ||
                  (predictionTradeMode === 'buy' &&
                    authenticated &&
                    (predictionAmountNum < 1 || !predictionBuyCalculation)) ||
                  (predictionTradeMode === 'sell' &&
                    authenticated &&
                    (maxSellShares <= 0 ||
                      clampedSellShares < 0.01 ||
                      !predictionSellCalculation))) &&
                  'cursor-not-allowed opacity-50'
              )}
            >
              {predictionSubmitting
                ? 'Processing…'
                : !authenticated
                  ? 'Log In to Trade'
                  : predictionTradeMode === 'buy'
                    ? `BUY ${predictionSide.toUpperCase()} · ${BABYLON_POINTS_SYMBOL}${predictionAmountNum.toFixed(0)}`
                    : `SELL ${predictionSide.toUpperCase()} · ${clampedSellShares.toFixed(2)} shares`}
            </button>
          </div>
        </div>
      ) : selectedPerp ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <PerpsOrderEntryPanel
            market={selectedPerp}
            initialSide={perpSideFromUrl ?? undefined}
            onRequestBuyPoints={onRequestBuyPoints}
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
        <div className="flex min-w-0 flex-1">
          <TabButton
            active={bottomTab === 'agent'}
            onClick={() => setBottomTab('agent')}
          >
            Agents
          </TabButton>
          <TabButton
            active={bottomTab === 'social'}
            onClick={() => setBottomTab('social')}
          >
            Social
          </TabButton>
          <TabButton
            active={bottomTab === 'portfolio'}
            onClick={() => setBottomTab('portfolio')}
          >
            Portfolio
          </TabButton>
          <TabButton
            active={bottomTab === 'positions'}
            onClick={() => setBottomTab('positions')}
          >
            Positions
          </TabButton>
          <TabButton
            active={bottomTab === 'trades'}
            onClick={() => setBottomTab('trades')}
          >
            Trades
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
        {bottomTab === 'agent' ? (
          <TerminalAgentsChat />
        ) : bottomTab === 'social' ? (
          <TerminalSocialFeed
            perpTicker={
              selected?.kind === 'perp' ? (selectedPerp?.ticker ?? null) : null
            }
          />
        ) : bottomTab === 'portfolio' ? (
          <TerminalPortfolio
            authenticated={authenticated}
            onLogin={login}
            onRequestBuyPoints={onRequestBuyPoints ?? null}
            balance={balance}
            balanceLoading={balanceLoading}
            portfolio={portfolioPnL}
            portfolioLoading={portfolioLoading}
            portfolioError={portfolioError}
            onRefresh={() => {
              invalidateUserPositions();
              invalidateWalletBalance();
              void Promise.allSettled([
                refreshPortfolio(),
                refreshPredictionPositions(),
                refreshPerpPositions(),
                refreshWalletBalance(),
              ]);
            }}
            perpPositions={perpPositions}
            predictionPositions={predictionPositions}
            onPerpPositionClosed={async () => {
              invalidateUserPositions();
              invalidateWalletBalance();
              await Promise.all([
                refreshPerpPositions(),
                refreshPredictionPositions(),
                refreshWalletBalance(),
                refreshPortfolio(),
              ]);
            }}
            onPredictionPositionSold={async () => {
              invalidateUserPositions();
              invalidateWalletBalance();
              await Promise.all([
                refreshPredictionPositions(),
                refreshPerpPositions(),
                refreshWalletBalance(),
                refreshPortfolio(),
              ]);
            }}
          />
        ) : bottomTab === 'positions' ? (
          !authenticated ? (
            <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
              Log in to view positions.
            </div>
          ) : selected?.kind === 'prediction' ? (
            <div className="h-full overflow-auto">
              {selectedPredictionPositions.length > 0 ? (
                <PredictionPositionsList
                  positions={selectedPredictionPositions}
                  density="compact"
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
                  density="compact"
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
        ) : bottomTab === 'trades' ? (
          selected?.kind === 'prediction' ? (
            <div
              ref={desktopTradesContainerRef}
              className="h-full overflow-auto"
            >
              <AssetTradesFeed
                marketType="prediction"
                assetId={selected.id}
                containerRef={desktopTradesContainerRef}
                density="compact"
              />
            </div>
          ) : selectedPerp ? (
            <div
              ref={desktopTradesContainerRef}
              className="h-full overflow-auto"
            >
              <AssetTradesFeed
                marketType="perp"
                assetId={selectedPerp.ticker}
                containerRef={desktopTradesContainerRef}
                density="compact"
              />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
              Select a market to see trades.
            </div>
          )
        ) : null}
      </div>
    </div>
  );

  return (
    <div
      ref={terminalRootRef}
      className={cn(
        'relative flex h-full w-full flex-col overflow-hidden bg-background text-foreground',
        isFullscreen && 'fixed inset-0 z-[45] h-[100dvh] w-[100dvw] pt-safe'
      )}
    >
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
              <Panel
                defaultSize={bottomCollapsed ? 100 : 70}
                minSize={35}
                className="min-h-0"
              >
                <PanelGroup direction="horizontal" className="min-h-0">
                  {!leftCollapsed && (
                    <>
                      <Panel
                        defaultSize={22}
                        minSize={15}
                        maxSize={32}
                        className="min-h-0 border-white/5 border-r"
                      >
                        {listPanel}
                      </Panel>
                      <PanelResizeHandle className="w-1 bg-white/5 hover:bg-primary/40" />
                    </>
                  )}

                  <Panel
                    defaultSize={leftCollapsed ? 72 : 56}
                    minSize={40}
                    className="min-h-0"
                  >
                    {centerPanel}
                  </Panel>

                  <PanelResizeHandle className="w-1 bg-white/5 hover:bg-primary/40" />
                  <Panel
                    defaultSize={22}
                    minSize={18}
                    maxSize={32}
                    className="min-h-0 border-white/5 border-l bg-background/20"
                  >
                    {rightPanel}
                  </Panel>
                </PanelGroup>
              </Panel>

              {!bottomCollapsed && (
                <>
                  <PanelResizeHandle className="h-1 bg-white/5 hover:bg-primary/40" />
                  <Panel
                    defaultSize={30}
                    minSize={12}
                    className="min-h-0 border-white/5 border-t bg-background/20"
                  >
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
                <span className="font-semibold text-[10px] tracking-widest">
                  {bottomTab === 'agent'
                    ? 'AGENTS'
                    : bottomTab === 'social'
                      ? 'SOCIAL'
                      : bottomTab === 'portfolio'
                        ? 'PORTFOLIO'
                        : bottomTab === 'positions'
                          ? 'POSITIONS'
                          : 'TRADES'}
                </span>
                <span className="text-[10px]">▲</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={toggleFullscreen}
        aria-pressed={isFullscreen}
        aria-label={
          isFullscreen
            ? 'Exit fullscreen terminal view'
            : 'Enter fullscreen terminal view'
        }
        title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        className={cn(
          'absolute z-40 hidden h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-background/70 text-muted-foreground shadow-lg backdrop-blur-md md:inline-flex',
          'right-[calc(16px+env(safe-area-inset-right))] bottom-[calc(16px+env(safe-area-inset-bottom))]',
          'transition-colors hover:bg-muted/40 hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'
        )}
      >
        {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
      </button>

      {/* Mobile */}
      <div className="relative flex h-full flex-col overflow-hidden overscroll-none md:hidden">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="contents">
              <div className="relative flex min-h-0 w-full flex-1 flex-col border-white/5 border-b">
                {selected?.kind === 'prediction' ? (
                  <>
                    <PredictionMarketHeader
                      predictionState={predictionState}
                      yesPct={predictionYesPct}
                      timeRange={predictionTimeRange}
                      onTimeRangeChange={setPredictionTimeRange}
                      onDetailsClick={() => setPredictionDetailsOpen(true)}
                      variant="compact"
                    />
                    <div className="min-h-0 flex-1 p-2">
                      <PredictionProbabilityChart
                        data={predictionHistory}
                        marketId={selectedPredictionId ?? 'unknown'}
                        timeRange={predictionTimeRange}
                        onTimeRangeChange={setPredictionTimeRange}
                        showHeader={false}
                        height="fill"
                      />
                    </div>
                  </>
                ) : selectedPerp ? (
                  <>
                    <PerpMarketHeader
                      selectedPerp={selectedPerp}
                      timeRange={perpTimeRange}
                      onTimeRangeChange={setPerpTimeRange}
                      variant="compact"
                    />
                    <div className="min-h-0 flex-1 p-2">
                      <PerpPriceChart
                        data={perpHistory.map((p) => ({
                          time: p.time,
                          price: p.price,
                        }))}
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

                {selected && (
                  <button
                    type="button"
                    onClick={() => setIsMobileChartFullscreen(true)}
                    className={cn(
                      'absolute right-3 bottom-3 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full',
                      'border border-white/10 bg-background/70 text-muted-foreground shadow-sm backdrop-blur-md',
                      'transition-colors hover:bg-muted/40 hover:text-foreground',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'
                    )}
                    aria-label="Open chart fullscreen"
                    title="Fullscreen chart"
                  >
                    <Maximize2 size={18} />
                  </button>
                )}
              </div>

              <div className="shrink-0 border-white/5 border-t bg-background/70 px-2 py-2 shadow-sm backdrop-blur-md">
                <div className="flex items-center gap-1 rounded-2xl border border-white/10 bg-background/40 p-1">
                  <div className="flex min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => openMobilePanel('agent')}
                      className={cn(
                        'relative flex h-9 min-w-0 flex-1 items-center justify-center px-2 font-bold text-[11px] transition-colors',
                        bottomTab === 'agent'
                          ? 'text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                      aria-label="Open Agents panel"
                    >
                      Agents
                      {bottomTab === 'agent' && (
                        <div className="absolute right-2 bottom-0 left-2 h-0.5 rounded-full bg-foreground" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => openMobilePanel('social')}
                      className={cn(
                        'relative flex h-9 min-w-0 flex-1 items-center justify-center px-2 font-bold text-[11px] transition-colors',
                        bottomTab === 'social'
                          ? 'text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                      aria-label="Open Social panel"
                    >
                      Social
                      {bottomTab === 'social' && (
                        <div className="absolute right-2 bottom-0 left-2 h-0.5 rounded-full bg-foreground" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => openMobilePanel('portfolio')}
                      className={cn(
                        'relative flex h-9 min-w-0 flex-1 items-center justify-center px-2 font-bold text-[11px] transition-colors',
                        bottomTab === 'portfolio'
                          ? 'text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                      aria-label="Open Portfolio panel"
                    >
                      Portf.
                      {bottomTab === 'portfolio' && (
                        <div className="absolute right-2 bottom-0 left-2 h-0.5 rounded-full bg-foreground" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => openMobilePanel('positions')}
                      className={cn(
                        'relative flex h-9 min-w-0 flex-1 items-center justify-center px-2 font-bold text-[11px] transition-colors',
                        bottomTab === 'positions'
                          ? 'text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                      aria-label="Open Positions panel"
                    >
                      Pos.
                      {bottomTab === 'positions' && (
                        <div className="absolute right-2 bottom-0 left-2 h-0.5 rounded-full bg-foreground" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => openMobilePanel('trades')}
                      className={cn(
                        'relative flex h-9 min-w-0 flex-1 items-center justify-center px-2 font-bold text-[11px] transition-colors',
                        bottomTab === 'trades'
                          ? 'text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                      aria-label="Open Trades panel"
                    >
                      Trades
                      {bottomTab === 'trades' && (
                        <div className="absolute right-2 bottom-0 left-2 h-0.5 rounded-full bg-foreground" />
                      )}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => openMobilePanel()}
                    className={cn(
                      'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                      'text-muted-foreground transition-colors hover:bg-muted/20 hover:text-foreground',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'
                    )}
                    aria-label="Open panel"
                    title="Open panel"
                  >
                    <ChevronUp size={18} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="sticky bottom-[calc(56px+env(safe-area-inset-bottom))] z-40 flex h-[72px] w-full select-none items-center justify-between rounded-t-[20px] border-white/5 border-t bg-background px-2 pb-2 font-medium text-[10px] text-muted-foreground shadow-[0_-5px_15px_rgba(0,0,0,0.12)]">
            {/* Minimal bottom nav */}
            <button
              type="button"
              onClick={() => {
                setIsMobilePanelOpen(false);
                setIsMobileTradeSheetOpen(false);
                setIsMobileMarketListOpen(true);
              }}
              className="flex flex-1 flex-col items-center justify-center gap-1 py-1 font-bold text-foreground"
            >
              Markets
            </button>
            <button
              type="button"
              onClick={() => {
                setIsMobilePanelOpen(false);
                setIsMobileMarketListOpen(false);
                setIsMobileTradeSheetOpen(true);
              }}
              disabled={!selected}
              className={cn(
                'mx-2 inline-flex h-10 flex-[1.5] items-center justify-center rounded-full px-4 font-bold text-sm transition-all',
                selected
                  ? 'bg-foreground text-background active:scale-95'
                  : 'cursor-not-allowed bg-muted/40 text-muted-foreground'
              )}
            >
              Trade
            </button>
            <button
              type="button"
              onClick={authenticated ? onRequestBuyPoints : login}
              className="flex flex-1 flex-col items-center justify-center gap-1 py-1 transition-colors hover:text-foreground"
            >
              {authenticated ? (
                <>
                  <span className="font-semibold">Balance</span>
                  <span className="font-mono text-[11px] tabular-nums">
                    {balanceLoading ? '—' : formatBalance(balance)}
                  </span>
                </>
              ) : (
                'Log in'
              )}
            </button>
          </div>

          {isMobilePanelOpen && (
            <div className="fade-in slide-in-from-bottom-2 absolute inset-0 z-[70] flex animate-in flex-col bg-background pt-safe pb-safe duration-200">
              <div className="flex items-center justify-between border-white/5 border-b p-4">
                <h2 className="font-bold text-lg">Panel</h2>
                <button
                  type="button"
                  onClick={() => setIsMobilePanelOpen(false)}
                  className="rounded-full p-2 transition-colors hover:bg-muted/20"
                  aria-label="Close panel"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex h-11 shrink-0 items-center border-white/5 border-b bg-background px-2 shadow-sm">
                <div className="flex min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => setBottomTab('agent')}
                    className={cn(
                      'relative flex h-full min-w-0 flex-1 items-center justify-center px-2 py-2 font-bold text-xs capitalize transition-colors',
                      bottomTab === 'agent'
                        ? 'text-foreground'
                        : 'text-muted-foreground'
                    )}
                  >
                    Agents
                    {bottomTab === 'agent' && (
                      <div className="absolute bottom-0 left-0 h-0.5 w-full rounded-t-full bg-foreground" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBottomTab('social')}
                    className={cn(
                      'relative flex h-full min-w-0 flex-1 items-center justify-center px-2 py-2 font-bold text-xs capitalize transition-colors',
                      bottomTab === 'social'
                        ? 'text-foreground'
                        : 'text-muted-foreground'
                    )}
                  >
                    Social
                    {bottomTab === 'social' && (
                      <div className="absolute bottom-0 left-0 h-0.5 w-full rounded-t-full bg-foreground" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBottomTab('portfolio')}
                    className={cn(
                      'relative flex h-full min-w-0 flex-1 items-center justify-center px-2 py-2 font-bold text-xs capitalize transition-colors',
                      bottomTab === 'portfolio'
                        ? 'text-foreground'
                        : 'text-muted-foreground'
                    )}
                  >
                    Portfolio
                    {bottomTab === 'portfolio' && (
                      <div className="absolute bottom-0 left-0 h-0.5 w-full rounded-t-full bg-foreground" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBottomTab('positions')}
                    className={cn(
                      'relative flex h-full min-w-0 flex-1 items-center justify-center px-2 py-2 font-bold text-xs capitalize transition-colors',
                      bottomTab === 'positions'
                        ? 'text-foreground'
                        : 'text-muted-foreground'
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
                      'relative flex h-full min-w-0 flex-1 items-center justify-center px-2 py-2 font-bold text-xs capitalize transition-colors',
                      bottomTab === 'trades'
                        ? 'text-foreground'
                        : 'text-muted-foreground'
                    )}
                  >
                    Trades
                    {bottomTab === 'trades' && (
                      <div className="absolute bottom-0 left-0 h-0.5 w-full rounded-t-full bg-foreground" />
                    )}
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden">
                {bottomTab === 'agent' ? (
                  <TerminalAgentsChat />
                ) : bottomTab === 'social' ? (
                  <TerminalSocialFeed
                    perpTicker={
                      selected?.kind === 'perp'
                        ? (selectedPerp?.ticker ?? null)
                        : null
                    }
                  />
                ) : bottomTab === 'portfolio' ? (
                  <TerminalPortfolio
                    authenticated={authenticated}
                    onLogin={login}
                    onRequestBuyPoints={onRequestBuyPoints ?? null}
                    balance={balance}
                    balanceLoading={balanceLoading}
                    portfolio={portfolioPnL}
                    portfolioLoading={portfolioLoading}
                    portfolioError={portfolioError}
                    onRefresh={() => {
                      invalidateUserPositions();
                      invalidateWalletBalance();
                      void Promise.allSettled([
                        refreshPortfolio(),
                        refreshPredictionPositions(),
                        refreshPerpPositions(),
                        refreshWalletBalance(),
                      ]);
                    }}
                    perpPositions={perpPositions}
                    predictionPositions={predictionPositions}
                    onPerpPositionClosed={async () => {
                      invalidateUserPositions();
                      invalidateWalletBalance();
                      await Promise.all([
                        refreshPerpPositions(),
                        refreshPredictionPositions(),
                        refreshWalletBalance(),
                        refreshPortfolio(),
                      ]);
                    }}
                    onPredictionPositionSold={async () => {
                      invalidateUserPositions();
                      invalidateWalletBalance();
                      await Promise.all([
                        refreshPredictionPositions(),
                        refreshPerpPositions(),
                        refreshWalletBalance(),
                        refreshPortfolio(),
                      ]);
                    }}
                  />
                ) : bottomTab === 'positions' ? (
                  !authenticated ? (
                    <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                      Log in to view positions.
                    </div>
                  ) : selected?.kind === 'prediction' ? (
                    <div className="h-full overflow-auto overscroll-contain">
                      <PredictionPositionsList
                        positions={selectedPredictionPositions}
                        density="compact"
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
                    </div>
                  ) : (
                    <div className="h-full overflow-auto overscroll-contain">
                      <PerpPositionsList
                        positions={selectedPerpPositions}
                        density="compact"
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
                    </div>
                  )
                ) : bottomTab === 'trades' ? (
                  selected?.kind === 'prediction' ? (
                    <div
                      ref={mobileTradesContainerRef}
                      className="h-full overflow-auto overscroll-contain"
                    >
                      <AssetTradesFeed
                        marketType="prediction"
                        assetId={selected.id}
                        containerRef={mobileTradesContainerRef}
                        density="compact"
                      />
                    </div>
                  ) : selectedPerp ? (
                    <div
                      ref={mobileTradesContainerRef}
                      className="h-full overflow-auto overscroll-contain"
                    >
                      <AssetTradesFeed
                        marketType="perp"
                        assetId={selectedPerp.ticker}
                        containerRef={mobileTradesContainerRef}
                        density="compact"
                      />
                    </div>
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                      Select a market to see trades.
                    </div>
                  )
                ) : null}
              </div>
            </div>
          )}

          {isMobileMarketListOpen && (
            <div className="fade-in slide-in-from-bottom-2 absolute inset-0 z-[70] flex animate-in flex-col bg-background duration-200">
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
            <div className="fixed inset-0 z-[70] flex flex-col justify-end">
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

          {isMobileChartFullscreen && (
            <div className="fixed inset-0 z-[80] bg-background">
              <button
                type="button"
                aria-label="Close fullscreen chart"
                onClick={() => setIsMobileChartFullscreen(false)}
                className={cn(
                  'absolute top-[calc(12px+env(safe-area-inset-top))] right-[calc(12px+env(safe-area-inset-right))] z-20 inline-flex h-10 w-10 items-center justify-center rounded-full',
                  'border border-white/10 bg-background/70 text-muted-foreground shadow-sm backdrop-blur-md',
                  'transition-colors hover:bg-muted/40 hover:text-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'
                )}
              >
                <X size={18} />
              </button>

              <div className="flex h-full flex-col pt-safe pb-safe">
                {selected?.kind === 'prediction' ? (
                  <>
                    <PredictionMarketHeader
                      predictionState={predictionState}
                      yesPct={predictionYesPct}
                      timeRange={predictionTimeRange}
                      onTimeRangeChange={setPredictionTimeRange}
                      onDetailsClick={() => setPredictionDetailsOpen(true)}
                      variant="compact"
                    />
                    <div className="min-h-0 flex-1 p-2">
                      <PredictionProbabilityChart
                        data={predictionHistory}
                        marketId={selectedPredictionId ?? 'unknown'}
                        timeRange={predictionTimeRange}
                        onTimeRangeChange={setPredictionTimeRange}
                        showHeader={false}
                        height="fill"
                      />
                    </div>
                  </>
                ) : selectedPerp ? (
                  <>
                    <PerpMarketHeader
                      selectedPerp={selectedPerp}
                      timeRange={perpTimeRange}
                      onTimeRangeChange={setPerpTimeRange}
                      variant="compact"
                    />
                    <div className="min-h-0 flex-1 p-2">
                      <PerpPriceChart
                        data={perpHistory.map((p) => ({
                          time: p.time,
                          price: p.price,
                        }))}
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
            </div>
          )}
        </div>
      </div>

      <AlertDialog
        open={predictionDetailsOpen}
        onOpenChange={setPredictionDetailsOpen}
      >
        <AlertDialogContent className="max-w-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Market details</AlertDialogTitle>
            <AlertDialogDescription>
              {predictionState?.text ?? 'Prediction market'}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="mt-4 space-y-3 text-sm">
            {predictionState?.resolutionDescription?.trim() && (
              <div className="rounded border border-white/10 bg-muted/10 p-3">
                <div className="mb-1 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                  Conditions
                </div>
                <div className="whitespace-pre-wrap break-words text-foreground">
                  {predictionState.resolutionDescription}
                </div>
              </div>
            )}

            <div className="rounded border border-white/10 bg-muted/10 p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Scenario</span>
                <span className="font-mono text-foreground tabular-nums">
                  {predictionState?.scenario ?? '—'}
                </span>
              </div>
              {formatDate(
                predictionState?.endDate ?? predictionState?.resolutionDate
              ) && (
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-muted-foreground">Ends</span>
                  <span className="font-mono text-foreground tabular-nums">
                    {formatDate(
                      predictionState?.endDate ??
                        predictionState?.resolutionDate
                    )}
                  </span>
                </div>
              )}
            </div>

            {predictionState?.resolutionProofUrl && (
              <a
                className="text-primary text-sm hover:underline"
                href={predictionState.resolutionProofUrl}
                target="_blank"
                rel="noreferrer"
              >
                View proof / source
              </a>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPredictionDetailsOpen(false)}>
              Close
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => setPredictionDetailsOpen(false)}>
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TradeConfirmationDialog
        open={confirmDialogOpen}
        onOpenChange={setConfirmDialogOpen}
        onConfirm={handleConfirmPredictionTrade}
        isSubmitting={predictionSubmitting}
        tradeDetails={
          predictionState &&
          predictionTradeMode === 'buy' &&
          predictionBuyCalculation
            ? ({
                type: 'buy-prediction',
                question: predictionState.text,
                side: predictionSide.toUpperCase() as 'YES' | 'NO',
                amount: predictionAmountNum,
                sharesBought: predictionBuyCalculation.sharesBought,
                avgPrice: predictionBuyCalculation.avgPrice,
                newPrice:
                  predictionSide === 'yes'
                    ? predictionBuyCalculation.newYesPrice
                    : predictionBuyCalculation.newNoPrice,
                priceImpact: predictionBuyCalculation.priceImpact,
                expectedPayout,
                expectedProfit,
              } satisfies BuyPredictionDetails)
            : predictionState &&
                predictionTradeMode === 'sell' &&
                predictionSellCalculation &&
                sellPosition
              ? (() => {
                  const expectedValue =
                    predictionSellCalculation.netProceeds ??
                    predictionSellCalculation.netAmount ??
                    predictionSellCalculation.totalCost;
                  const costBasis =
                    typeof sellPosition.costBasis === 'number' &&
                    sellPosition.shares > 0
                      ? sellPosition.costBasis *
                        (clampedSellShares / sellPosition.shares)
                      : clampedSellShares * sellPosition.avgPrice;
                  const unrealizedPnL = expectedValue - costBasis;
                  const unrealizedPnLPercent =
                    costBasis !== 0 ? (unrealizedPnL / costBasis) * 100 : 0;
                  const currentPrice =
                    sellPosition.currentPrice ??
                    (clampedSellShares > 0
                      ? expectedValue / clampedSellShares
                      : 0);

                  return {
                    type: 'sell-prediction',
                    question: predictionState.text,
                    side: predictionSide.toUpperCase() as 'YES' | 'NO',
                    shares: clampedSellShares,
                    avgPrice: sellPosition.avgPrice,
                    currentPrice,
                    expectedValue,
                    unrealizedPnL,
                    unrealizedPnLPercent,
                  } satisfies SellPredictionDetails;
                })()
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
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground',
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
