/**
 * Growth Metrics Tab Component
 *
 * Displays key growth and engagement metrics for the admin dashboard:
 * - WAU (Weekly Active Users) with trend
 * - Trader vs Commander user segmentation
 * - Engagement depth (trades per trader, actions per commander)
 * - Activation rate with funnel visualization
 *
 * @module GrowthMetricsTab
 */
'use client';

import { cn } from '@babylon/shared';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Bot,
  Minus,
  RefreshCw,
  Target,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useState, useTransition } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Skeleton } from '@/components/shared/Skeleton';

type Period = 'day' | 'week' | 'month';

interface GrowthData {
  wau: {
    current: number;
    previous: number;
    change: number;
    trend: 'up' | 'down' | 'stable';
  };
  userBalance: {
    tradersOnly: number;
    commandersOnly: number;
    hybrid: number;
    total: number;
    tradersOnlyPct: number;
    commandersOnlyPct: number;
    hybridPct: number;
  };
  engagement: {
    tradesPerTrader: number;
    totalTrades: number;
    uniqueTraders: number;
    actionsPerCommander: number;
    totalActions: number;
    uniqueCommanders: number;
  };
  activation: {
    rate: number;
    totalSignups: number;
    activatedUsers: number;
    tradedWithin24h: number;
    commandedWithin24h: number;
    funnel: {
      signups: number;
      tradedWithin24h: number;
      commandedWithin24h: number;
      activated: number;
    };
  };
  timeSeries: Array<{ date: string; wau: number }>;
  metadata: {
    computedAt: string;
    period: string;
    periodStart: string;
    periodEnd: string;
  };
}

const COLORS = {
  traders: '#3b82f6', // blue
  commanders: '#a855f7', // purple
  hybrid: '#22c55e', // green
};

export function GrowthMetricsTab() {
  const [data, setData] = useState<GrowthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('week');
  const [isRefreshing, startRefresh] = useTransition();

  const fetchData = useCallback(
    (showRefreshing = false) => {
      const fetchLogic = async () => {
        const response = await fetch(
          `/api/admin/stats/growth?period=${period}&includeTimeSeries=true`
        );
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
        void fetchLogic();
      }
    },
    [period]
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => fetchData(), 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const formatNumber = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toLocaleString();
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 sm:h-32" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
          <Skeleton className="h-64 sm:h-80" />
          <Skeleton className="h-64 sm:h-80" />
        </div>
        <Skeleton className="h-64 sm:h-80" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <BarChart3 className="mx-auto mb-3 h-12 w-12 opacity-50" />
        <p>Failed to load growth metrics</p>
        <button
          onClick={() => {
            setLoading(true);
            fetchData();
          }}
          className="mt-4 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground"
        >
          Retry
        </button>
      </div>
    );
  }

  // Prepare pie chart data
  const pieData = [
    {
      name: 'Traders Only',
      value: data.userBalance.tradersOnly,
      color: COLORS.traders,
    },
    {
      name: 'Commanders Only',
      value: data.userBalance.commandersOnly,
      color: COLORS.commanders,
    },
    { name: 'Hybrid', value: data.userBalance.hybrid, color: COLORS.hybrid },
  ].filter((item) => item.value > 0);

  // Prepare funnel data
  const funnelStages = [
    {
      label: 'Signups (30d)',
      value: data.activation.funnel.signups,
      pct: 100,
    },
    {
      label: 'First Trade',
      value: data.activation.funnel.tradedWithin24h,
      pct:
        data.activation.funnel.signups > 0
          ? Math.round(
              (data.activation.funnel.tradedWithin24h /
                data.activation.funnel.signups) *
                100
            )
          : 0,
    },
    {
      label: 'First Command',
      value: data.activation.funnel.commandedWithin24h,
      pct:
        data.activation.funnel.signups > 0
          ? Math.round(
              (data.activation.funnel.commandedWithin24h /
                data.activation.funnel.signups) *
                100
            )
          : 0,
    },
    {
      label: 'Activated',
      value: data.activation.funnel.activated,
      pct:
        data.activation.funnel.signups > 0
          ? Math.round(
              (data.activation.funnel.activated /
                data.activation.funnel.signups) *
                100
            )
          : 0,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 font-bold text-2xl">
            <TrendingUp className="h-6 w-6 text-green-500" />
            Growth Metrics
          </h2>
          <p className="mt-1 text-muted-foreground">
            Week of {formatDate(data.metadata.periodStart)} -{' '}
            {formatDate(data.metadata.periodEnd)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Period Selector */}
          <div className="flex rounded-lg border border-border bg-card">
            {(['day', 'week', 'month'] as const).map((p) => (
              <button
                key={p}
                onClick={() => {
                  setPeriod(p);
                  setLoading(true);
                }}
                className={cn(
                  'px-2.5 py-1.5 font-medium text-xs transition-colors first:rounded-l-lg last:rounded-r-lg sm:px-4 sm:py-2 sm:text-sm',
                  period === p
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                )}
              >
                {p === 'day' ? '7D' : p === 'week' ? '4W' : '3M'}
              </button>
            ))}
          </div>

          <button
            onClick={() => fetchData(true)}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 font-medium text-xs transition-colors hover:bg-muted/80 disabled:opacity-50 sm:gap-2 sm:px-3 sm:py-2 sm:text-sm"
          >
            <RefreshCw
              className={cn(
                'h-3.5 w-3.5 sm:h-4 sm:w-4',
                isRefreshing && 'animate-spin'
              )}
            />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* WAU Card */}
        <div className="rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-md">
          <div className="mb-3 flex items-center justify-between">
            <div className="rounded-lg bg-blue-500/10 p-2">
              <Users className="h-5 w-5 text-blue-500" />
            </div>
            {data.wau.trend !== 'stable' && (
              <div
                className={cn(
                  'flex items-center gap-1 rounded-full px-2 py-1 font-medium text-xs',
                  data.wau.trend === 'up'
                    ? 'bg-green-500/10 text-green-500'
                    : 'bg-red-500/10 text-red-500'
                )}
              >
                {data.wau.trend === 'up' ? (
                  <ArrowUp className="h-3 w-3" />
                ) : (
                  <ArrowDown className="h-3 w-3" />
                )}
                {Math.abs(data.wau.change).toFixed(1)}%
              </div>
            )}
            {data.wau.trend === 'stable' && (
              <div className="flex items-center gap-1 rounded-full bg-muted px-2 py-1 font-medium text-muted-foreground text-xs">
                <Minus className="h-3 w-3" />
                Stable
              </div>
            )}
          </div>
          <div className="font-bold text-3xl">
            {formatNumber(data.wau.current)}
          </div>
          <div className="mt-1 text-muted-foreground text-sm">
            Weekly Active Users
          </div>
          <div className="mt-2 text-muted-foreground text-xs">
            vs {formatNumber(data.wau.previous)} last week
          </div>
        </div>

        {/* Activation Rate Card */}
        <div className="rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-md">
          <div className="mb-3 flex items-center justify-between">
            <div className="rounded-lg bg-green-500/10 p-2">
              <Target className="h-5 w-5 text-green-500" />
            </div>
          </div>
          <div className="font-bold text-3xl">{data.activation.rate}%</div>
          <div className="mt-1 text-muted-foreground text-sm">
            Activation Rate (24h)
          </div>
          <div className="mt-2 text-muted-foreground text-xs">
            {data.activation.activatedUsers} of {data.activation.totalSignups}{' '}
            signups
          </div>
        </div>

        {/* Trades per Trader Card */}
        <div className="rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-md">
          <div className="mb-3 flex items-center justify-between">
            <div className="rounded-lg bg-purple-500/10 p-2">
              <Activity className="h-5 w-5 text-purple-500" />
            </div>
          </div>
          <div className="font-bold text-3xl">
            {data.engagement.tradesPerTrader}
          </div>
          <div className="mt-1 text-muted-foreground text-sm">
            Trades per Trader
          </div>
          <div className="mt-2 text-muted-foreground text-xs">
            {formatNumber(data.engagement.totalTrades)} trades by{' '}
            {formatNumber(data.engagement.uniqueTraders)} traders
          </div>
        </div>

        {/* Actions per Commander Card */}
        <div className="rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-md">
          <div className="mb-3 flex items-center justify-between">
            <div className="rounded-lg bg-orange-500/10 p-2">
              <Bot className="h-5 w-5 text-orange-500" />
            </div>
          </div>
          <div className="font-bold text-3xl">
            {data.engagement.actionsPerCommander}
          </div>
          <div className="mt-1 text-muted-foreground text-sm">
            Actions per Commander
          </div>
          <div className="mt-2 text-muted-foreground text-xs">
            {formatNumber(data.engagement.totalActions)} actions by{' '}
            {formatNumber(data.engagement.uniqueCommanders)} commanders
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
        {/* WAU Trend Chart */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="mb-4 flex items-center gap-2 font-semibold text-lg">
            <TrendingUp className="h-5 w-5 text-blue-500" />
            WAU Trend
          </h3>
          {data.timeSeries.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={data.timeSeries}>
                <defs>
                  <linearGradient id="wauGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis
                  dataKey="date"
                  stroke="#888"
                  fontSize={12}
                  tickFormatter={formatDate}
                />
                <YAxis stroke="#888" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1a1a1a',
                    border: '1px solid #333',
                    borderRadius: '8px',
                  }}
                  labelFormatter={(label) => formatDate(String(label))}
                  formatter={(value: number) => [formatNumber(value), 'WAU']}
                />
                <Area
                  type="monotone"
                  dataKey="wau"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="url(#wauGradient)"
                  name="WAU"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[280px] items-center justify-center text-muted-foreground">
              No time series data available
            </div>
          )}
        </div>

        {/* Trader vs Commander Pie Chart */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="mb-4 flex items-center gap-2 font-semibold text-lg">
            <Zap className="h-5 w-5 text-purple-500" />
            User Segmentation
          </h3>
          {pieData.length > 0 ? (
            <div className="flex flex-col items-center">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1a1a1a',
                      border: '1px solid #333',
                      borderRadius: '8px',
                    }}
                    formatter={(value: number, name: string) => [
                      `${formatNumber(value)} (${Math.round((value / data.userBalance.total) * 100)}%)`,
                      name,
                    ]}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>

              {/* Legend with percentages */}
              <div className="mt-4 grid w-full grid-cols-3 gap-2 text-center text-sm">
                <div>
                  <div className="font-bold text-blue-500">
                    {data.userBalance.tradersOnlyPct}%
                  </div>
                  <div className="text-muted-foreground text-xs">
                    Traders Only
                  </div>
                </div>
                <div>
                  <div className="font-bold text-purple-500">
                    {data.userBalance.commandersOnlyPct}%
                  </div>
                  <div className="text-muted-foreground text-xs">
                    Commanders Only
                  </div>
                </div>
                <div>
                  <div className="font-bold text-green-500">
                    {data.userBalance.hybridPct}%
                  </div>
                  <div className="text-muted-foreground text-xs">Hybrid</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-[280px] items-center justify-center text-muted-foreground">
              No user activity data
            </div>
          )}
        </div>
      </div>

      {/* Activation Funnel */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="mb-4 flex items-center gap-2 font-semibold text-lg">
          <Target className="h-5 w-5 text-green-500" />
          Activation Funnel (24h)
        </h3>
        <p className="mb-6 text-muted-foreground text-sm">
          Users who take a meaningful action within 24 hours of signup (last 30
          days)
        </p>

        <div className="space-y-4">
          {funnelStages.map((stage, index) => {
            const isFirst = index === 0;
            const isLast = index === funnelStages.length - 1;
            const width = isFirst ? 100 : stage.pct;

            return (
              <div key={stage.label} className="relative">
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span
                    className={cn(
                      isLast
                        ? 'font-semibold text-green-500'
                        : 'text-foreground'
                    )}
                  >
                    {stage.label}
                  </span>
                  <span className="font-mono">
                    {formatNumber(stage.value)}
                    {!isFirst && (
                      <span className="ml-2 text-muted-foreground">
                        ({stage.pct}%)
                      </span>
                    )}
                  </span>
                </div>
                <div className="h-8 overflow-hidden rounded-lg bg-muted">
                  <div
                    className={cn(
                      'h-full rounded-lg transition-all duration-500',
                      isLast
                        ? 'bg-green-500'
                        : index === 1
                          ? 'bg-blue-500'
                          : index === 2
                            ? 'bg-purple-500'
                            : 'bg-muted-foreground/30'
                    )}
                    style={{ width: `${width}%` }}
                  />
                </div>
                {index === 1 && (
                  <div className="absolute top-0 right-0 text-blue-500 text-xs">
                    Trade Path
                  </div>
                )}
                {index === 2 && (
                  <div className="absolute top-0 right-0 text-purple-500 text-xs">
                    Command Path
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Funnel insights */}
        <div className="mt-6 grid grid-cols-2 gap-4 rounded-lg bg-muted/50 p-4">
          <div>
            <div className="font-medium text-sm">Trade Conversion</div>
            <div className="font-bold text-2xl text-blue-500">
              {data.activation.funnel.signups > 0
                ? Math.round(
                    (data.activation.funnel.tradedWithin24h /
                      data.activation.funnel.signups) *
                      100
                  )
                : 0}
              %
            </div>
            <div className="text-muted-foreground text-xs">
              signup → first trade
            </div>
          </div>
          <div>
            <div className="font-medium text-sm">Command Conversion</div>
            <div className="font-bold text-2xl text-purple-500">
              {data.activation.funnel.signups > 0
                ? Math.round(
                    (data.activation.funnel.commandedWithin24h /
                      data.activation.funnel.signups) *
                      100
                  )
                : 0}
              %
            </div>
            <div className="text-muted-foreground text-xs">
              signup → first command
            </div>
          </div>
        </div>
      </div>

      {/* Summary Stats Table */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="mb-4 font-semibold text-lg">Detailed Breakdown</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-border border-b text-muted-foreground">
              <tr>
                <th className="pb-3 font-medium">Metric</th>
                <th className="pb-3 text-right font-medium">Value</th>
                <th className="pb-3 text-right font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-border/50 border-b">
                <td className="py-3 font-medium">Weekly Active Users</td>
                <td className="py-3 text-right font-mono text-blue-500">
                  {formatNumber(data.wau.current)}
                </td>
                <td className="py-3 text-right text-muted-foreground">
                  {data.wau.change >= 0 ? '+' : ''}
                  {data.wau.change.toFixed(1)}% vs last week
                </td>
              </tr>
              <tr className="border-border/50 border-b">
                <td className="py-3 font-medium">Traders Only</td>
                <td className="py-3 text-right font-mono text-blue-500">
                  {formatNumber(data.userBalance.tradersOnly)}
                </td>
                <td className="py-3 text-right text-muted-foreground">
                  {data.userBalance.tradersOnlyPct}% of WAU
                </td>
              </tr>
              <tr className="border-border/50 border-b">
                <td className="py-3 font-medium">Commanders Only</td>
                <td className="py-3 text-right font-mono text-purple-500">
                  {formatNumber(data.userBalance.commandersOnly)}
                </td>
                <td className="py-3 text-right text-muted-foreground">
                  {data.userBalance.commandersOnlyPct}% of WAU
                </td>
              </tr>
              <tr className="border-border/50 border-b">
                <td className="py-3 font-medium">Hybrid Users</td>
                <td className="py-3 text-right font-mono text-green-500">
                  {formatNumber(data.userBalance.hybrid)}
                </td>
                <td className="py-3 text-right text-muted-foreground">
                  {data.userBalance.hybridPct}% of WAU
                </td>
              </tr>
              <tr className="border-border/50 border-b">
                <td className="py-3 font-medium">Trades per Trader</td>
                <td className="py-3 text-right font-mono">
                  {data.engagement.tradesPerTrader}
                </td>
                <td className="py-3 text-right text-muted-foreground">
                  {formatNumber(data.engagement.totalTrades)} total trades
                </td>
              </tr>
              <tr className="border-border/50 border-b">
                <td className="py-3 font-medium">Actions per Commander</td>
                <td className="py-3 text-right font-mono">
                  {data.engagement.actionsPerCommander}
                </td>
                <td className="py-3 text-right text-muted-foreground">
                  {formatNumber(data.engagement.totalActions)} total actions
                </td>
              </tr>
              <tr>
                <td className="py-3 font-medium">Activation Rate</td>
                <td className="py-3 text-right font-mono text-green-500">
                  {data.activation.rate}%
                </td>
                <td className="py-3 text-right text-muted-foreground">
                  {formatNumber(data.activation.activatedUsers)} activated in
                  24h
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
