'use client';

import type {
  AreaSeriesOptions,
  ChartOptions,
  DeepPartial,
  IChartApi,
  ISeriesApi,
  LineSeriesOptions,
  Time,
} from 'lightweight-charts';
import { ColorType, createChart } from 'lightweight-charts';
import { useEffect, useRef, useState } from 'react';

/**
 * Base chart props for Lightweight Charts wrapper.
 */
interface LightweightChartBaseProps {
  height?: number;
  className?: string;
  autoSize?: boolean;
}

/**
 * Dark theme configuration for charts.
 */
export const DARK_CHART_THEME: DeepPartial<ChartOptions> = {
  layout: {
    background: { type: ColorType.Solid, color: 'transparent' },
    textColor: 'hsl(var(--muted-foreground))',
    fontSize: 11,
    fontFamily:
      'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"',
    attributionLogo: false,
  },
  grid: {
    vertLines: { visible: false },
    horzLines: { color: 'hsl(var(--border) / 0.3)', style: 1 },
  },
  crosshair: {
    vertLine: {
      color: 'hsl(var(--muted-foreground) / 0.5)',
      width: 1,
      style: 2,
      labelBackgroundColor: 'hsl(var(--muted))',
    },
    horzLine: {
      color: 'hsl(var(--muted-foreground) / 0.5)',
      width: 1,
      style: 2,
      labelBackgroundColor: 'hsl(var(--muted))',
    },
  },
  rightPriceScale: {
    borderVisible: false,
    scaleMargins: { top: 0.1, bottom: 0.1 },
  },
  timeScale: {
    borderVisible: false,
    timeVisible: true,
    secondsVisible: false,
    fixLeftEdge: true,
    fixRightEdge: true,
  },
  handleScroll: { mouseWheel: true, pressedMouseMove: true },
  handleScale: { mouseWheel: true, pinch: true },
};

/**
 * Area series style presets for different chart types.
 */
export const AREA_STYLES = {
  green: {
    lineColor: '#16a34a',
    topColor: 'rgba(22, 163, 74, 0.4)',
    bottomColor: 'rgba(22, 163, 74, 0.02)',
    lineWidth: 2,
    crosshairMarkerVisible: true,
    crosshairMarkerRadius: 4,
    crosshairMarkerBackgroundColor: '#16a34a',
    crosshairMarkerBorderColor: '#ffffff',
    crosshairMarkerBorderWidth: 2,
  } satisfies DeepPartial<AreaSeriesOptions>,
  red: {
    lineColor: '#dc2626',
    topColor: 'rgba(220, 38, 38, 0.4)',
    bottomColor: 'rgba(220, 38, 38, 0.02)',
    lineWidth: 2,
    crosshairMarkerVisible: true,
    crosshairMarkerRadius: 4,
    crosshairMarkerBackgroundColor: '#dc2626',
    crosshairMarkerBorderColor: '#ffffff',
    crosshairMarkerBorderWidth: 2,
  } satisfies DeepPartial<AreaSeriesOptions>,
  blue: {
    lineColor: '#3b82f6',
    topColor: 'rgba(59, 130, 246, 0.4)',
    bottomColor: 'rgba(59, 130, 246, 0.02)',
    lineWidth: 2,
    crosshairMarkerVisible: true,
    crosshairMarkerRadius: 4,
    crosshairMarkerBackgroundColor: '#3b82f6',
    crosshairMarkerBorderColor: '#ffffff',
    crosshairMarkerBorderWidth: 2,
  } satisfies DeepPartial<AreaSeriesOptions>,
};

/**
 * Line series style presets.
 */
export const LINE_STYLES = {
  green: {
    color: '#16a34a',
    lineWidth: 2,
    crosshairMarkerVisible: true,
    crosshairMarkerRadius: 4,
    crosshairMarkerBackgroundColor: '#16a34a',
    crosshairMarkerBorderColor: '#ffffff',
    crosshairMarkerBorderWidth: 2,
  } satisfies DeepPartial<LineSeriesOptions>,
  red: {
    color: '#dc2626',
    lineWidth: 2,
    crosshairMarkerVisible: true,
    crosshairMarkerRadius: 4,
    crosshairMarkerBackgroundColor: '#dc2626',
    crosshairMarkerBorderColor: '#ffffff',
    crosshairMarkerBorderWidth: 2,
  } satisfies DeepPartial<LineSeriesOptions>,
};

/**
 * Hook result for Lightweight Charts.
 */
interface UseLightweightChartResult {
  chartContainerRef: React.RefObject<HTMLDivElement | null>;
  chart: IChartApi | null;
}

/**
 * Hook to create and manage a Lightweight Charts instance.
 *
 * Handles chart creation, auto-resize, and cleanup.
 * Note: Initial options are captured on first render only.
 * Use chart.applyOptions() for runtime option changes.
 *
 * @param options - Chart options override (captured on mount)
 * @returns Chart container ref and chart API
 */
export function useLightweightChart(
  options?: DeepPartial<ChartOptions>
): UseLightweightChartResult {
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const [chart, setChart] = useState<IChartApi | null>(null);
  // Capture initial options to avoid re-creating chart on every render
  const initialOptionsRef = useRef(options);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chartInstance = createChart(chartContainerRef.current, {
      ...DARK_CHART_THEME,
      ...initialOptionsRef.current,
      autoSize: true,
    });

    setChart(chartInstance);

    return () => {
      chartInstance.remove();
      setChart(null);
    };
  }, []);

  return { chartContainerRef, chart };
}

/**
 * Format timestamp to chart time format.
 */
export function formatChartTime(timestamp: number): Time {
  return Math.floor(timestamp / 1000) as Time;
}

/**
 * Format price for display.
 */
export function formatChartPrice(value: number, includeSymbol = false): string {
  const prefix = includeSymbol ? '$' : '';

  if (value === 0) return `${prefix}0`;
  if (value >= 1_000_000_000)
    return `${prefix}${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${prefix}${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${prefix}${(value / 1_000).toFixed(2)}K`;
  if (value >= 1) return `${prefix}${value.toFixed(2)}`;
  if (value >= 0.01) return `${prefix}${value.toFixed(4)}`;
  if (value >= 0.0001) return `${prefix}${value.toFixed(6)}`;
  return `${prefix}${value.toFixed(8)}`;
}

export type {
  LightweightChartBaseProps,
  IChartApi,
  ISeriesApi,
  Time,
  DeepPartial,
  ChartOptions,
  AreaSeriesOptions,
  LineSeriesOptions,
};
