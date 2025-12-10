'use client';

import type { ISeriesApi, Time } from 'lightweight-charts';
import { AreaSeries, CrosshairMode } from 'lightweight-charts';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AREA_STYLES,
  formatChartPrice,
  formatChartTime,
  useLightweightChart,
} from '@/components/charts/LightweightChartBase';

/**
 * Price point structure for chart data.
 */
interface PricePoint {
  time: number;
  price: number;
}

/**
 * Chart data point for Lightweight Charts series.
 */
interface ChartDataPoint {
  time: Time;
  value: number;
}

/**
 * Props for PerpPriceChart component.
 */
interface PerpPriceChartProps {
  data: PricePoint[];
  currentPrice: number;
  ticker: string;
  showBrush?: boolean;
}

/**
 * Time range options for chart filtering.
 */
type TimeRange = '1H' | '4H' | '1D' | '1W' | 'ALL';

const TIME_RANGES: TimeRange[] = ['1H', '4H', '1D', '1W', 'ALL'];

/**
 * Perpetual price chart using TradingView Lightweight Charts.
 *
 * Displays price history with area chart, time range filtering,
 * and price change indicators. Color-coded based on price direction.
 *
 * Features:
 * - Area chart with gradient fill
 * - Time range filtering (1H, 4H, 1D, 1W, ALL)
 * - Price change display with percentage
 * - Color-coded by direction (green up, red down)
 * - Interactive crosshair with tooltips
 * - Auto-resize to container
 * - Current price reference line
 *
 * @param props - PerpPriceChart component props
 * @returns Perpetual price chart element
 */
export function PerpPriceChart({
  data,
  currentPrice,
  ticker,
}: PerpPriceChartProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('ALL');
  const priceSeries = useRef<ISeriesApi<'Area'> | null>(null);
  const lastPriceLineRef = useRef<ReturnType<
    ISeriesApi<'Area'>['createPriceLine']
  > | null>(null);

  const { chartContainerRef, chart } = useLightweightChart({
    crosshair: {
      mode: CrosshairMode.Normal,
    },
    localization: {
      priceFormatter: (price: number) => formatChartPrice(price, true),
    },
  });

  // Filter data based on time range
  const filteredData = useMemo(() => {
    if (!data.length) return [];

    const validData = data
      .filter(
        (point) => Number.isFinite(point.time) && Number.isFinite(point.price)
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

  // Calculate price change
  const { priceChange, priceChangePercent, isPositive } = useMemo(() => {
    if (filteredData.length < 2) {
      return { priceChange: 0, priceChangePercent: 0, isPositive: true };
    }

    const first = filteredData[0];
    const last = filteredData[filteredData.length - 1];
    const change = (last?.price ?? 0) - (first?.price ?? 0);
    const percent = first?.price ? (change / first.price) * 100 : 0;

    return {
      priceChange: change,
      priceChangePercent: percent,
      isPositive: change >= 0,
    };
  }, [filteredData]);

  // Initialize series
  useEffect(() => {
    if (!chart) return;

    priceSeries.current = chart.addSeries(AreaSeries, {
      ...AREA_STYLES.green,
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => formatChartPrice(price, true),
        minMove: 0.00000001,
      },
      lastValueVisible: true,
      priceLineVisible: false,
    });

    // Cleanup: chart.remove() in base hook already cleans up all series,
    // so we only need to null the refs. Calling removeSeries after chart
    // is destroyed causes "Value is undefined" errors.
    return () => {
      lastPriceLineRef.current = null;
      priceSeries.current = null;
    };
  }, [chart]);

  // Update series color based on price direction
  useEffect(() => {
    if (!priceSeries.current) return;

    const style = isPositive ? AREA_STYLES.green : AREA_STYLES.red;
    priceSeries.current.applyOptions(style);
  }, [isPositive]);

  // Update data
  useEffect(() => {
    if (!priceSeries.current || !filteredData.length) return;

    // Filter out any points with invalid values to prevent "Value is null" errors
    const validPoints = filteredData.filter(
      (point) =>
        point.price !== null &&
        point.price !== undefined &&
        Number.isFinite(point.price)
    );

    if (!validPoints.length) return;

    const chartData: ChartDataPoint[] = validPoints.map((point) => ({
      time: formatChartTime(point.time),
      value: point.price,
    }));

    priceSeries.current.setData(chartData);

    // Fit content
    chart?.timeScale().fitContent();
  }, [chart, filteredData]);

  // Update current price line
  useEffect(() => {
    if (!priceSeries.current || !currentPrice) return;

    // Remove existing price line
    if (lastPriceLineRef.current) {
      priceSeries.current.removePriceLine(lastPriceLineRef.current);
    }

    // Add new price line
    lastPriceLineRef.current = priceSeries.current.createPriceLine({
      price: currentPrice,
      color: '#0066FF',
      lineWidth: 2,
      lineStyle: 2, // Dashed
      axisLabelVisible: true,
      title: 'Current',
    });
  }, [currentPrice]);

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
    <div className="w-full space-y-3" key={ticker}>
      {/* Header with price info and time range */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-3">
          <div>
            <div className="font-bold text-2xl">
              {formatChartPrice(currentPrice, true)}
            </div>
            <div
              className={`font-medium text-sm ${isPositive ? 'text-green-600' : 'text-red-600'}`}
            >
              {isPositive ? '↑' : '↓'}{' '}
              {formatChartPrice(Math.abs(priceChange), true)} (
              {priceChangePercent >= 0 ? '+' : ''}
              {priceChangePercent.toFixed(2)}%)
            </div>
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
    </div>
  );
}
