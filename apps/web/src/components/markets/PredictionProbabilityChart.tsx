'use client';

import type { ISeriesApi, Time } from 'lightweight-charts';
import { AreaSeries, LineSeries } from 'lightweight-charts';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AREA_STYLES,
  formatChartTime,
  LINE_STYLES,
  useLightweightChart,
} from '@/components/charts/LightweightChartBase';

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
  /** Whether to show brush selector (unused, for future) */
  showBrush?: boolean;
}

/**
 * Time range options for chart filtering.
 */
type TimeRange = '1H' | '4H' | '1D' | '1W' | 'ALL';

const TIME_RANGES: TimeRange[] = ['1H', '4H', '1D', '1W', 'ALL'];

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
}: PredictionProbabilityChartProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('ALL');
  const yesSeries = useRef<ISeriesApi<'Area'> | null>(null);
  const noSeries = useRef<ISeriesApi<'Line'> | null>(null);
  const seriesInitialized = useRef(false);

  const { chartContainerRef, chart } = useLightweightChart({
    rightPriceScale: {
      scaleMargins: { top: 0.05, bottom: 0.05 },
    },
    localization: {
      priceFormatter: (price: number) => `${price.toFixed(1)}%`,
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
      const ranges: Record<TimeRange, number> = {
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

  // Current probability from latest data point
  const currentProbability = useMemo(() => {
    if (!chartData.yes.length) return 50;
    return chartData.yes[chartData.yes.length - 1]?.value ?? 50;
  }, [chartData.yes]);

  const isYesFavored = currentProbability >= 50;

  // Initialize series when chart is ready
  useEffect(() => {
    if (!chart || seriesInitialized.current) return;

    // Add YES area series (green filled area)
    yesSeries.current = chart.addSeries(AreaSeries, {
      ...AREA_STYLES.green,
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => `${price.toFixed(1)}%`,
        minMove: 0.01,
      },
    });

    // Add NO line series (red line overlay)
    noSeries.current = chart.addSeries(LineSeries, {
      ...LINE_STYLES.red,
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => `${price.toFixed(1)}%`,
        minMove: 0.01,
      },
    });

    seriesInitialized.current = true;

    return () => {
      yesSeries.current = null;
      noSeries.current = null;
      seriesInitialized.current = false;
    };
  }, [chart]);

  // Update data when chart data changes
  useEffect(() => {
    if (!yesSeries.current || !noSeries.current) return;
    if (!chartData.yes.length || !chartData.no.length) return;

    yesSeries.current.setData(chartData.yes);
    noSeries.current.setData(chartData.no);
    chart?.timeScale().fitContent();
  }, [chart, chartData]);

  // Update series colors based on YES/NO favorability
  useEffect(() => {
    if (!yesSeries.current) return;
    const style = isYesFavored ? AREA_STYLES.green : AREA_STYLES.red;
    yesSeries.current.applyOptions(style);
  }, [isYesFavored]);

  // Loading state when no data
  if (!data.length) {
    return (
      <div className="flex h-[400px] items-center justify-center text-muted-foreground">
        <div className="text-center">
          <div className="text-sm">Loading chart data...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-3" key={marketId}>
      {/* Header with probabilities and time range selector */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-green-600" />
            <span className="font-semibold text-sm">
              YES {currentProbability.toFixed(1)}%
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-red-600" />
            <span className="font-semibold text-sm">
              NO {(100 - currentProbability).toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Time range selector */}
        <div className="flex items-center gap-1 rounded-md bg-muted/30 p-1">
          {TIME_RANGES.map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
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

      {/* Chart container */}
      <div
        ref={chartContainerRef}
        className="h-[400px] w-full rounded-lg bg-muted/10"
      />

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 px-1 text-muted-foreground text-xs">
        <div className="flex items-center gap-2">
          <div
            className="h-0.5 w-4 rounded"
            style={{ backgroundColor: '#16a34a' }}
          />
          <span>YES Probability</span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="h-0.5 w-4 rounded"
            style={{ backgroundColor: '#dc2626' }}
          />
          <span>NO Probability</span>
        </div>
      </div>
    </div>
  );
}
