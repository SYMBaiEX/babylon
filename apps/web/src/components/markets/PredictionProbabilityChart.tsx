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
  time: number;
  yesPrice: number;
  noPrice: number;
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
  data: PricePoint[];
  marketId: string;
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

  const { chartContainerRef, chart } = useLightweightChart({
    rightPriceScale: {
      scaleMargins: { top: 0.05, bottom: 0.05 },
    },
    localization: {
      priceFormatter: (price: number) => `${price.toFixed(1)}%`,
    },
  });

  // Filter data based on time range
  const filteredData = useMemo(() => {
    if (!data.length) return [];

    const validData = data
      .filter(
        (point) =>
          Number.isFinite(point.time) &&
          Number.isFinite(point.yesPrice) &&
          Number.isFinite(point.noPrice)
      )
      .sort((a, b) => a.time - b.time);

    if (timeRange === 'ALL') return validData;

    const now = Date.now();
    const ranges: Record<TimeRange, number> = {
      '1H': 60 * 60 * 1000,
      '4H': 4 * 60 * 60 * 1000,
      '1D': 24 * 60 * 60 * 1000,
      '1W': 7 * 24 * 60 * 60 * 1000,
      ALL: 0,
    };

    const cutoff = now - ranges[timeRange];
    return validData.filter((d) => d.time >= cutoff);
  }, [data, timeRange]);

  // Current probability
  const currentProbability = useMemo(() => {
    if (!filteredData.length) return 50;
    const last = filteredData[filteredData.length - 1];
    return last ? last.yesPrice * 100 : 50;
  }, [filteredData]);

  const isYesFavored = currentProbability >= 50;

  // Initialize series
  useEffect(() => {
    if (!chart) return;

    // Add YES area series (green)
    yesSeries.current = chart.addSeries(AreaSeries, {
      ...AREA_STYLES.green,
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => `${price.toFixed(1)}%`,
        minMove: 0.01,
      },
    });

    // Add NO line series (red) - overlay
    noSeries.current = chart.addSeries(LineSeries, {
      ...LINE_STYLES.red,
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => `${price.toFixed(1)}%`,
        minMove: 0.01,
      },
    });

    // Cleanup: chart.remove() in base hook already cleans up all series,
    // so we only need to null the refs. Calling removeSeries after chart
    // is destroyed causes "Value is undefined" errors.
    return () => {
      yesSeries.current = null;
      noSeries.current = null;
    };
  }, [chart]);

  // Update data
  useEffect(() => {
    if (!yesSeries.current || !noSeries.current || !filteredData.length) return;

    // Filter out any points with invalid values to prevent "Value is null" errors
    const validPoints = filteredData.filter(
      (point) =>
        point.yesPrice !== null &&
        point.yesPrice !== undefined &&
        point.noPrice !== null &&
        point.noPrice !== undefined &&
        Number.isFinite(point.yesPrice) &&
        Number.isFinite(point.noPrice)
    );

    if (!validPoints.length) return;

    const yesData: ChartDataPoint[] = validPoints.map((point) => ({
      time: formatChartTime(point.time),
      value: point.yesPrice * 100,
    }));

    const noData: ChartDataPoint[] = validPoints.map((point) => ({
      time: formatChartTime(point.time),
      value: point.noPrice * 100,
    }));

    yesSeries.current.setData(yesData);
    noSeries.current.setData(noData);

    // Fit content
    chart?.timeScale().fitContent();
  }, [chart, filteredData]);

  // Update series colors based on YES/NO favorability
  useEffect(() => {
    if (!yesSeries.current) return;

    const style = isYesFavored ? AREA_STYLES.green : AREA_STYLES.red;
    yesSeries.current.applyOptions(style);
  }, [isYesFavored]);

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
      {/* Header with probabilities and time range */}
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
