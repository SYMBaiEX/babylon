/**
 * Market Oversight tab for managing prediction markets.
 *
 * Displays market statistics, list of active/expired/resolved markets,
 * and provides actions to resolve, extend, or void markets.
 *
 * Features:
 * - Market statistics overview
 * - Status filtering (active, expired, resolved)
 * - Market list with price/volume info
 * - Resolve market action (YES/NO)
 * - Extend market end date
 * - Void market action
 * - Market detail modal
 * - Loading states
 *
 * @returns Market oversight tab element
 */
'use client';

import { cn } from '@babylon/shared';
import {
  AlertTriangle,
  BarChart2,
  Calendar,
  Check,
  Clock,
  DollarSign,
  RefreshCw,
  TrendingUp,
  X,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/shared/Skeleton';

type MarketStatus = 'all' | 'active' | 'expired' | 'resolved';

interface Market {
  id: string;
  question: string;
  description: string | null;
  yesShares: string;
  noShares: string;
  liquidity: string;
  resolved: boolean;
  resolution: boolean | null;
  endDate: string;
  createdAt: string;
  onChainMarketId: string | null;
  positionCount: number;
  tradeCount: number;
  totalVolume: number;
  yesPrice: number;
  noPrice: number;
  status: 'active' | 'expired' | 'resolved';
}

interface MarketStats {
  total: number;
  active: number;
  expired: number;
  resolved: number;
  totalLiquidity: number;
  totalPositions: number;
  activePositions: number;
  totalPositionValue: number;
}

interface MarketsData {
  stats: MarketStats;
  markets: Market[];
}

export function MarketOversightTab() {
  const [data, setData] = useState<MarketsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<MarketStatus>('all');
  const [isRefreshing, startRefresh] = useTransition();
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  const [showActionModal, setShowActionModal] = useState(false);
  const [actionType, setActionType] = useState<'resolve' | 'extend' | 'void'>('resolve');
  const [resolution, setResolution] = useState<boolean>(true);
  const [extendDate, setExtendDate] = useState('');
  const [actionReason, setActionReason] = useState('');
  const [isActioning, startActioning] = useTransition();

  const fetchMarkets = useCallback((showRefreshing = false) => {
    const fetchLogic = async () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const response = await fetch(`/api/admin/markets?${params}`);
      if (!response.ok) {
        setLoading(false);
        return;
      }
      const result = await response.json();
      setData(result);
      setLoading(false);
    };

    if (showRefreshing) {
      startRefresh(fetchLogic);
    } else {
      fetchLogic();
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchMarkets();
  }, [fetchMarkets]);

  const handleAction = (market: Market, action: 'resolve' | 'extend' | 'void') => {
    setSelectedMarket(market);
    setActionType(action);
    setResolution(true);
    setExtendDate('');
    setActionReason('');
    setShowActionModal(true);
  };

  const executeAction = () => {
    if (!selectedMarket) return;

    startActioning(async () => {
      const body: Record<string, unknown> = {
        action: actionType,
        reason: actionReason || undefined,
      };

      if (actionType === 'resolve') {
        body.resolution = resolution;
      } else if (actionType === 'extend') {
        if (!extendDate) {
          toast.error('Please select a new end date');
          return;
        }
        body.newEndDate = extendDate;
      }

      const response = await fetch(`/api/admin/markets/${selectedMarket.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const result = await response.json();
        toast.error(result.error || 'Failed to perform action');
        return;
      }

      toast.success(
        actionType === 'resolve'
          ? `Market resolved as ${resolution ? 'YES' : 'NO'}`
          : actionType === 'extend'
            ? 'Market end date extended'
            : 'Market voided'
      );
      setShowActionModal(false);
      setSelectedMarket(null);
      fetchMarkets(true);
    });
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
    return `$${value.toFixed(2)}`;
  };

  const getStatusBadge = (status: Market['status']) => {
    switch (status) {
      case 'active':
        return (
          <span className="flex items-center gap-1 rounded bg-green-500/20 px-2 py-1 text-green-500 text-xs font-medium">
            <Check className="h-3 w-3" /> Active
          </span>
        );
      case 'expired':
        return (
          <span className="flex items-center gap-1 rounded bg-yellow-500/20 px-2 py-1 text-yellow-500 text-xs font-medium">
            <Clock className="h-3 w-3" /> Expired
          </span>
        );
      case 'resolved':
        return (
          <span className="flex items-center gap-1 rounded bg-blue-500/20 px-2 py-1 text-blue-500 text-xs font-medium">
            <Check className="h-3 w-3" /> Resolved
          </span>
        );
    }
  };

  const MarketCard = ({ market }: { market: Market }) => (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5 transition-shadow hover:shadow-md">
      {/* Header */}
      <div className="mb-2 sm:mb-3 flex flex-wrap items-start justify-between gap-2 sm:gap-4">
        <div className="flex-1 min-w-0">
          <h4 className="line-clamp-2 font-medium text-sm sm:text-base">{market.question}</h4>
          <div className="mt-1 flex items-center gap-1.5 sm:gap-2 text-muted-foreground text-[10px] sm:text-xs">
            <Calendar className="h-3 w-3 flex-shrink-0" />
            Ends {formatDate(market.endDate)}
          </div>
        </div>
        {getStatusBadge(market.status)}
      </div>

      {/* Price Bar */}
      <div className="mb-4">
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="text-green-500">YES {market.yesPrice}%</span>
          <span className="text-red-500">NO {market.noPrice}%</span>
        </div>
        <div className="flex h-2 overflow-hidden rounded-full">
          <div
            className="bg-green-500 transition-all"
            style={{ width: `${market.yesPrice}%` }}
          />
          <div
            className="bg-red-500 transition-all"
            style={{ width: `${market.noPrice}%` }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="mb-3 sm:mb-4 grid grid-cols-3 gap-2 sm:gap-4">
        <div className="rounded-lg bg-muted/50 p-1.5 sm:p-2 text-center">
          <div className="font-semibold text-sm sm:text-base">{market.positionCount}</div>
          <div className="text-muted-foreground text-[10px] sm:text-xs">Positions</div>
        </div>
        <div className="rounded-lg bg-muted/50 p-1.5 sm:p-2 text-center">
          <div className="font-semibold text-sm sm:text-base">{market.tradeCount}</div>
          <div className="text-muted-foreground text-[10px] sm:text-xs">Trades</div>
        </div>
        <div className="rounded-lg bg-muted/50 p-1.5 sm:p-2 text-center">
          <div className="font-semibold text-sm sm:text-base">{formatCurrency(market.totalVolume)}</div>
          <div className="text-muted-foreground text-[10px] sm:text-xs">Volume</div>
        </div>
      </div>

      {/* Resolution Result */}
      {market.resolved && market.resolution !== null && (
        <div className="mb-4 rounded-lg bg-blue-500/10 p-3 text-center">
          <span className="font-medium">
            Resolved: {market.resolution ? 'YES ✓' : 'NO ✗'}
          </span>
        </div>
      )}

      {/* Actions */}
      {!market.resolved && (
        <div className="flex flex-col gap-1.5 sm:flex-row sm:gap-2">
          <button
            onClick={() => handleAction(market, 'resolve')}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-blue-500/20 px-2.5 py-1.5 sm:px-3 sm:py-2 text-blue-500 text-xs sm:text-sm font-medium transition-colors hover:bg-blue-500/30"
          >
            <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Resolve
          </button>
          <button
            onClick={() => handleAction(market, 'extend')}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-purple-500/20 px-2.5 py-1.5 sm:px-3 sm:py-2 text-purple-500 text-xs sm:text-sm font-medium transition-colors hover:bg-purple-500/30"
          >
            <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Extend
          </button>
          <button
            onClick={() => handleAction(market, 'void')}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-red-500/20 px-2.5 py-1.5 sm:px-3 sm:py-2 text-red-500 text-xs sm:text-sm font-medium transition-colors hover:bg-red-500/30"
          >
            <XCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Void
          </button>
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-20 sm:h-24" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-56 sm:h-64" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <BarChart2 className="mx-auto mb-3 h-12 w-12 opacity-50" />
        <p>Failed to load market data</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 font-bold text-2xl">
            <TrendingUp className="h-6 w-6 text-green-500" />
            Market Oversight
          </h2>
          <p className="mt-1 text-muted-foreground">
            Manage prediction markets
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Status Filter */}
          <div className="flex rounded-lg border border-border bg-card overflow-x-auto">
            {(['all', 'active', 'expired', 'resolved'] as const).map((s) => (
              <button
                key={s}
                onClick={() => {
                  setStatusFilter(s);
                  setLoading(true);
                }}
                className={cn(
                  'px-2 py-1.5 text-xs sm:px-3 sm:py-2 sm:text-sm font-medium transition-colors first:rounded-l-lg last:rounded-r-lg whitespace-nowrap',
                  statusFilter === s
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                )}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          <button
            onClick={() => fetchMarkets(true)}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 sm:gap-2 rounded-lg bg-muted px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm font-medium transition-colors hover:bg-muted/80 disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3.5 w-3.5 sm:h-4 sm:w-4', isRefreshing && 'animate-spin')} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-3 sm:p-5">
          <div className="mb-1.5 sm:mb-2 flex items-center gap-1.5 sm:gap-2">
            <BarChart2 className="h-4 w-4 sm:h-5 sm:w-5 text-blue-500" />
            <span className="text-muted-foreground text-xs sm:text-sm">Total Markets</span>
          </div>
          <div className="font-bold text-xl sm:text-2xl">{data.stats.total}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 sm:p-5">
          <div className="mb-1.5 sm:mb-2 flex items-center gap-1.5 sm:gap-2">
            <Check className="h-4 w-4 sm:h-5 sm:w-5 text-green-500" />
            <span className="text-muted-foreground text-xs sm:text-sm">Active</span>
          </div>
          <div className="font-bold text-xl sm:text-2xl text-green-500">{data.stats.active}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 sm:p-5">
          <div className="mb-1.5 sm:mb-2 flex items-center gap-1.5 sm:gap-2">
            <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-500" />
            <span className="text-muted-foreground text-xs sm:text-sm truncate">Needs Resolution</span>
          </div>
          <div className="font-bold text-xl sm:text-2xl text-yellow-500">{data.stats.expired}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 sm:p-5">
          <div className="mb-1.5 sm:mb-2 flex items-center gap-1.5 sm:gap-2">
            <DollarSign className="h-4 w-4 sm:h-5 sm:w-5 text-purple-500" />
            <span className="text-muted-foreground text-xs sm:text-sm">Total Liquidity</span>
          </div>
          <div className="font-bold text-xl sm:text-2xl">{formatCurrency(data.stats.totalLiquidity)}</div>
        </div>
      </div>

      {/* Expired Warning */}
      {data.stats.expired > 0 && (
        <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-4">
          <div className="flex items-center gap-2 font-semibold text-yellow-500">
            <AlertTriangle className="h-5 w-5" />
            {data.stats.expired} market{data.stats.expired > 1 ? 's' : ''} need
            {data.stats.expired === 1 ? 's' : ''} resolution
          </div>
          <p className="mt-1 text-muted-foreground text-sm">
            These markets have passed their end date and require admin action.
          </p>
        </div>
      )}

      {/* Markets Grid */}
      {data.markets.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-8 sm:py-12 text-center">
          <BarChart2 className="mx-auto mb-3 h-10 w-10 sm:h-12 sm:w-12 opacity-50" />
          <p className="text-muted-foreground text-sm sm:text-base">No markets found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.markets.map((market) => (
            <MarketCard key={market.id} market={market} />
          ))}
        </div>
      )}

      {/* Action Modal */}
      {showActionModal && selectedMarket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6">
            <h3 className="mb-4 font-bold text-xl">
              {actionType === 'resolve'
                ? 'Resolve Market'
                : actionType === 'extend'
                  ? 'Extend Market'
                  : 'Void Market'}
            </h3>

            <div className="mb-4 rounded-lg bg-muted/50 p-3">
              <p className="line-clamp-2 font-medium">{selectedMarket.question}</p>
            </div>

            {actionType === 'resolve' && (
              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium">Resolution</label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setResolution(true)}
                    className={cn(
                      'flex-1 rounded-lg border-2 p-4 text-center transition-colors',
                      resolution
                        ? 'border-green-500 bg-green-500/20 text-green-500'
                        : 'border-border hover:border-green-500/50'
                    )}
                  >
                    <Check className="mx-auto mb-1 h-6 w-6" />
                    YES
                  </button>
                  <button
                    onClick={() => setResolution(false)}
                    className={cn(
                      'flex-1 rounded-lg border-2 p-4 text-center transition-colors',
                      !resolution
                        ? 'border-red-500 bg-red-500/20 text-red-500'
                        : 'border-border hover:border-red-500/50'
                    )}
                  >
                    <X className="mx-auto mb-1 h-6 w-6" />
                    NO
                  </button>
                </div>
              </div>
            )}

            {actionType === 'extend' && (
              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium">
                  New End Date
                </label>
                <input
                  type="datetime-local"
                  value={extendDate}
                  onChange={(e) => setExtendDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2"
                />
              </div>
            )}

            {actionType === 'void' && (
              <div className="mb-4 rounded-lg bg-red-500/10 p-3 text-red-500">
                <AlertTriangle className="mb-1 h-5 w-5" />
                <p className="text-sm">
                  Voiding a market will refund all positions. This action cannot be
                  undone.
                </p>
              </div>
            )}

            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium">
                Reason {actionType !== 'extend' && '(optional)'}
              </label>
              <textarea
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                placeholder="Enter reason..."
                className="w-full rounded-lg border border-border bg-background px-3 py-2 resize-none"
                rows={2}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowActionModal(false)}
                disabled={isActioning}
                className="flex-1 rounded-lg bg-muted px-4 py-2 font-medium transition-colors hover:bg-muted/80 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={executeAction}
                disabled={isActioning}
                className={cn(
                  'flex-1 rounded-lg px-4 py-2 font-medium transition-colors disabled:opacity-50',
                  actionType === 'resolve'
                    ? 'bg-blue-500 text-white hover:bg-blue-600'
                    : actionType === 'extend'
                      ? 'bg-purple-500 text-white hover:bg-purple-600'
                      : 'bg-red-500 text-white hover:bg-red-600'
                )}
              >
                {isActioning ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
