'use client';

import { cn } from '@babylon/shared';
import type { ISeriesApi, Time } from 'lightweight-charts';
import { AreaSeries, LineSeries } from 'lightweight-charts';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AREA_STYLES,
  formatChartTime,
  LINE_STYLES,
  useLightweightChart,
} from '@/components/charts/LightweightChartBase';
import { MARKET_TIME_RANGES, type MarketTimeRange } from '@/types/markets';

/**
 * Price point structure for prediction chart data.
 */
interface PricePoint {
  /** Timestamp in milliseconds */
  time: number;
  /** YES outcome price (0-1) */
  yesPrice: number;
  /** NO outcome price (0-1) */
  noPrice: number;
  /** Trading volume */
  volume: number;
}

/**
 * Chart data point for Lightweight Charts series.
 */
interface ChartDataPoint {
  time: Time;
  value: number;
}

/**
 * Props for PredictionProbabilityChart component.
 */
interface PredictionProbabilityChartProps {
  /** Array of price history points */
  data: PricePoint[];
  /** Market identifier for keying */
  marketId: string;
  /** Selected time range */
  timeRange: MarketTimeRange;
  /** Time range selection handler */
  onTimeRangeChange: (range: MarketTimeRange) => void;
  /** Whether to show brush selector (unused, for future) */
  showBrush?: boolean;
  /** Whether to show the built-in header (probabilities + range controls). Defaults to true. */
  showHeader?: boolean;
  /**
   * Chart sizing behavior.
   * - fixed: uses a fixed-height chart (good for pages)
   * - fill: stretches to the available parent height (good for flex layouts like the terminal)
   */
  height?: 'fixed' | 'fill';
}

/**
 * Prediction probability chart using TradingView Lightweight Charts.
 *
 * Displays YES/NO probability history with area chart for YES and
 * line chart for NO. Includes time range filtering and current
 * probability display.
 *
 * Features:
 * - Area chart for YES probability (filled green)
 * - Line chart for NO probability (red line)
 * - Time range filtering (1H, 4H, 1D, 1W, ALL)
 * - Current probability percentages display
 * - Interactive crosshair with tooltips
 * - Auto-resize to container
 *
 * @param props - PredictionProbabilityChart component props
 * @returns Prediction probability chart element
 */
export function PredictionProbabilityChart({
  data,
  marketId,
  timeRange,
  onTimeRangeChange,
  showHeader = true,
  height = 'fixed',
}: PredictionProbabilityChartProps) {
  const [chartInitError, setChartInitError] = useState<string | null>(null);
  const yesSeries = useRef<ISeriesApi<'Area'> | null>(null);
  const noSeries = useRef<ISeriesApi<'Line'> | null>(null);
  const seriesInitialized = useRef(false);
  const fillHeight = height === 'fill';

  const {
    chartContainerRef,
    chart,
    error: chartBaseError,
  } = useLightweightChart({
    rightPriceScale: {
      scaleMargins: { top: 0.1, bottom: 0.1 },
      autoScale: true,
    },
    localization: {
      priceFormatter: (price: number) => `${price.toFixed(0)}%`,
    },
  });

  // Filter and prepare data based on time range
  const chartData = useMemo(() => {
    if (!data.length) return { yes: [], no: [] };

    // Filter valid data points and sort by time
    const validData = data
      .filter(
        (point) =>
          Number.isFinite(point.time) &&
          Number.isFinite(point.yesPrice) &&
          Number.isFinite(point.noPrice) &&
          point.yesPrice >= 0 &&
          point.noPrice >= 0
      )
      .sort((a, b) => a.time - b.time);

    // Apply time range filter
    let filtered = validData;
    if (timeRange !== 'ALL') {
      const now = Date.now();
      const ranges: Record<MarketTimeRange, number> = {
        '1H': 60 * 60 * 1000,
        '4H': 4 * 60 * 60 * 1000,
        '1D': 24 * 60 * 60 * 1000,
        '1W': 7 * 24 * 60 * 60 * 1000,
        ALL: 0,
      };
      const cutoff = now - ranges[timeRange];
      filtered = validData.filter((d) => d.time >= cutoff);
    }

    // Convert to chart format with deduplication by timestamp
    // Lightweight Charts requires unique, ascending timestamps
    const seenTimes = new Set<number>();
    const yes: ChartDataPoint[] = [];
    const no: ChartDataPoint[] = [];

    for (const point of filtered) {
      const time = formatChartTime(point.time);
      const timeNum = time as number;
      if (seenTimes.has(timeNum)) continue;
      seenTimes.add(timeNum);

      yes.push({ time, value: point.yesPrice * 100 });
      no.push({ time, value: point.noPrice * 100 });
    }

    return { yes, no };
  }, [data, timeRange]);

  // Current probability from latest data point (always use ALL data, not filtered)
  const currentProbability = useMemo(() => {
    if (!data.length) return 50;
    // Get the most recent point from the original data
    const sorted = [...data]
      .filter((p) => Number.isFinite(p.yesPrice) && p.yesPrice >= 0)
      .sort((a, b) => b.time - a.time);
    const latest = sorted[0];
    return latest ? latest.yesPrice * 100 : 50;
  }, [data]);

  const hasData = data.length > 0;
  const unavailableReason = chartInitError ?? chartBaseError;

  // Initialize series when chart is ready
  useEffect(() => {
    if (!chart || seriesInitialized.current) return;

    try {
      setChartInitError(null);

      const yesOptions = {
        ...AREA_STYLES.bluePastel,
        priceFormat: {
          type: 'custom' as const,
          formatter: (price: number) => `${price.toFixed(1)}%`,
          minMove: 0.01,
        },
      };

      const noOptions = {
        ...LINE_STYLES.violetPastel,
        priceFormat: {
          type: 'custom' as const,
          formatter: (price: number) => `${price.toFixed(1)}%`,
          minMove: 0.01,
        },
      };

      // IMPORTANT: do not call extracted methods directly; lightweight-charts relies on `this`.
      const chartAny = chart as unknown as {
        addSeries?: (
          seriesType: unknown,
          options: unknown
        ) => ISeriesApi<'Area'> | ISeriesApi<'Line'>;
        addAreaSeries?: (options: unknown) => ISeriesApi<'Area'>;
        addLineSeries?: (options: unknown) => ISeriesApi<'Line'>;
      };

      if (
        typeof chartAny.addSeries === 'function' &&
        AreaSeries &&
        LineSeries
      ) {
        yesSeries.current = chartAny.addSeries.call(
          chart,
          AreaSeries,
          yesOptions
        ) as ISeriesApi<'Area'>;
        noSeries.current = chartAny.addSeries.call(
          chart,
          LineSeries,
          noOptions
        ) as ISeriesApi<'Line'>;
      } else if (
        typeof chartAny.addAreaSeries === 'function' &&
        typeof chartAny.addLineSeries === 'function'
      ) {
        yesSeries.current = chartAny.addAreaSeries.call(chart, yesOptions);
        noSeries.current = chartAny.addLineSeries.call(chart, noOptions);
      } else {
        throw new Error('Unsupported lightweight-charts API');
      }

      seriesInitialized.current = true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to initialize chart';
      setChartInitError(message);
      yesSeries.current = null;
      noSeries.current = null;
      seriesInitialized.current = false;
      return;
    }

    return () => {
      yesSeries.current = null;
      noSeries.current = null;
      seriesInitialized.current = false;
    };
  }, [chart]);

  // Update data when chart data changes
  useEffect(() => {
    if (!yesSeries.current || !noSeries.current || !chart) return;

    if (!chartData.yes.length || !chartData.no.length) {
      // Clear data when no points in range
      try {
        yesSeries.current.setData([]);
        noSeries.current.setData([]);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to clear chart data';
        setChartInitError(message);
      }
      return;
    }

    try {
      setChartInitError(null);
      yesSeries.current.setData(chartData.yes);
      noSeries.current.setData(chartData.no);
      chart.timeScale().fitContent();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to render chart data';
      setChartInitError(message);
    }
  }, [chart, chartData]);

  return (
    <div
      data-market-id={marketId}
      className={cn(
        'w-full',
        showHeader && !fillHeight && 'space-y-3',
        fillHeight && 'flex h-full min-h-0 flex-col gap-3'
      )}
    >
      {showHeader && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-1">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-blue-400" />
              <span className="font-semibold text-sm">
                YES {currentProbability.toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-violet-500" />
              <span className="font-semibold text-sm">
                NO {(100 - currentProbability).toFixed(1)}%
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 rounded-md bg-muted/30 p-1">
            {MARKET_TIME_RANGES.map((range) => (
              <button
                key={range}
                onClick={() => onTimeRangeChange(range)}
                className={`cursor-pointer rounded px-2 py-1 text-xs transition-colors ${
                  timeRange === range
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chart container */}
      <div className={cn('relative', fillHeight && 'min-h-0 flex-1')}>
        <div
          ref={chartContainerRef}
          className={cn(
            'w-full rounded-lg bg-muted/10',
            fillHeight ? 'h-full min-h-[240px]' : 'h-[400px]'
          )}
        />
        {!chart && !unavailableReason && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="rounded-lg bg-card/90 px-4 py-2 text-muted-foreground text-sm">
              Initializing chart…
            </div>
          </div>
        )}
        {!hasData && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="rounded-lg bg-card/90 px-4 py-2 text-muted-foreground text-sm">
              Loading chart data…
            </div>
          </div>
        )}
        {unavailableReason && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="rounded-lg bg-card/90 px-4 py-2 text-center text-muted-foreground text-sm">
              <div className="font-semibold">Chart unavailable</div>
              <div className="mt-1 text-xs">{unavailableReason}</div>
            </div>
          </div>
        )}
        {chartData.yes.length === 0 && hasData && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="rounded-lg bg-card/90 px-4 py-2 text-muted-foreground text-sm">
              No data in selected time range
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex shrink-0 items-center justify-center gap-6 px-1 text-muted-foreground text-xs">
        <div className="flex items-center gap-2">
          <div
            className="h-0.5 w-4 rounded"
            style={{ backgroundColor: '#60a5fa' }}
          />
          <span>YES Probability</span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="h-0.5 w-4 rounded"
            style={{ backgroundColor: '#8b5cf6' }}
          />
          <span>NO Probability</span>
        </div>
      </div>
    </div>
  );
}
