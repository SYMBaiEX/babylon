'use client';

import { BABYLON_POINTS_SYMBOL, logger } from '@babylon/shared';
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
 * Uses explicit colors for consistent rendering on dark backgrounds.
 */
export const DARK_CHART_THEME: DeepPartial<ChartOptions> = {
  layout: {
    background: { type: ColorType.Solid, color: 'transparent' },
    textColor: '#a1a1aa', // zinc-400 - readable on dark backgrounds
    fontSize: 11,
    fontFamily:
      'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"',
    attributionLogo: false,
  },
  grid: {
    vertLines: { visible: false },
    horzLines: { color: 'rgba(63, 63, 70, 0.5)', style: 1 }, // zinc-700 with opacity
  },
  crosshair: {
    vertLine: {
      color: 'rgba(161, 161, 170, 0.5)', // zinc-400 with opacity
      width: 1,
      style: 2,
      labelBackgroundColor: '#27272a', // zinc-800
    },
    horzLine: {
      color: 'rgba(161, 161, 170, 0.5)', // zinc-400 with opacity
      width: 1,
      style: 2,
      labelBackgroundColor: '#27272a', // zinc-800
    },
  },
  rightPriceScale: {
    borderVisible: false,
    scaleMargins: { top: 0.1, bottom: 0.1 },
    textColor: '#a1a1aa', // zinc-400
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
    lineColor: '#22c55e', // green-500 - brighter for visibility
    topColor: 'rgba(34, 197, 94, 0.25)',
    bottomColor: 'rgba(34, 197, 94, 0.02)',
    lineWidth: 2,
    crosshairMarkerVisible: true,
    crosshairMarkerRadius: 4,
    crosshairMarkerBackgroundColor: '#22c55e',
    crosshairMarkerBorderColor: '#ffffff',
    crosshairMarkerBorderWidth: 2,
  } satisfies DeepPartial<AreaSeriesOptions>,
  red: {
    lineColor: '#ef4444', // red-500 - brighter for visibility
    topColor: 'rgba(239, 68, 68, 0.25)',
    bottomColor: 'rgba(239, 68, 68, 0.02)',
    lineWidth: 2,
    crosshairMarkerVisible: true,
    crosshairMarkerRadius: 4,
    crosshairMarkerBackgroundColor: '#ef4444',
    crosshairMarkerBorderColor: '#ffffff',
    crosshairMarkerBorderWidth: 2,
  } satisfies DeepPartial<AreaSeriesOptions>,
  blue: {
    lineColor: '#3b82f6',
    topColor: 'rgba(59, 130, 246, 0.25)',
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
    color: '#22c55e', // green-500
    lineWidth: 2,
    crosshairMarkerVisible: true,
    crosshairMarkerRadius: 4,
    crosshairMarkerBackgroundColor: '#22c55e',
    crosshairMarkerBorderColor: '#ffffff',
    crosshairMarkerBorderWidth: 2,
  } satisfies DeepPartial<LineSeriesOptions>,
  red: {
    color: '#ef4444', // red-500
    lineWidth: 2,
    crosshairMarkerVisible: true,
    crosshairMarkerRadius: 4,
    crosshairMarkerBackgroundColor: '#ef4444',
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
  error: string | null;
}

/**
 * Hook to create and manage a Lightweight Charts instance.
 *
 * Handles chart creation, auto-resize, and cleanup.
 * Uses requestAnimationFrame to ensure the container has dimensions
 * before creating the chart, avoiding SSR/hydration timing issues.
 *
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
  const [error, setError] = useState<string | null>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);
  // Capture initial options to avoid re-creating chart on every render
  const initialOptionsRef = useRef(options);

  useEffect(() => {
    // Skip during SSR
    if (typeof window === 'undefined') return;

    let mounted = true;
    let rafId: number | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let initTimeoutId: ReturnType<typeof setTimeout> | null = null;

    const createChartInstance = () => {
      const container = chartContainerRef.current;
      if (!container || !mounted) return;

      // Don't recreate if already initialized
      if (chartInstanceRef.current) return;

      // Check if container has dimensions
      const { width, height } = container.getBoundingClientRect();
      if (width === 0 || height === 0) {
        return;
      }

      try {
        setError(null);
        // NOTE: Do not rely on `autoSize` here.
        // Our repo pins lightweight-charts ~5.0.x in some environments, and `autoSize`
        // support can be inconsistent. We instead pass explicit dimensions and handle
        // resizing via ResizeObserver below.
        const chartInstance = createChart(container, {
          ...DARK_CHART_THEME,
          ...initialOptionsRef.current,
          width: Math.floor(width),
          height: Math.floor(height),
        });

        chartInstanceRef.current = chartInstance;
        if (mounted) {
          setChart(chartInstance);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to create chart';
        setError(message);
        // Ensure we always surface this in devtools; logger output can be filtered.
        // eslint-disable-next-line no-console
        console.error('[useLightweightChart] createChart failed:', error);
        logger.error(
          'Failed to create chart',
          { error },
          'useLightweightChart'
        );
      }
    };

    const scheduleCreate = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(createChartInstance);
    };

    // Use RAF to ensure DOM is ready after hydration
    scheduleCreate();

    // If we still haven't created a chart shortly after mount, surface a concrete error.
    // This prevents "Initializing chart..." from hanging forever when the container never
    // gets real dimensions (a common layout bug).
    initTimeoutId = setTimeout(() => {
      if (!mounted) return;
      if (chartInstanceRef.current) return;

      const container = chartContainerRef.current;
      if (!container) {
        setError('Chart container ref was not attached.');
        // eslint-disable-next-line no-console
        console.error('[useLightweightChart] container ref missing');
        return;
      }

      const { width, height } = container.getBoundingClientRect();
      if (width === 0 || height === 0) {
        const message = `Chart container has zero size (${Math.floor(width)}x${Math.floor(height)}).`;
        setError(message);
        // eslint-disable-next-line no-console
        console.error('[useLightweightChart]', message, container);
        return;
      }

      // We have dimensions but still no chart; try once more and then error.
      scheduleCreate();
      setTimeout(() => {
        if (!mounted) return;
        if (chartInstanceRef.current) return;
        const retryRect = container.getBoundingClientRect();
        const message = `Chart failed to initialize (container ${Math.floor(retryRect.width)}x${Math.floor(retryRect.height)}).`;
        setError(message);
        // eslint-disable-next-line no-console
        console.error('[useLightweightChart]', message, container);
      }, 250);
    }, 1500);

    // If the chart initially mounts into a zero-sized container (common with tabs/panels),
    // listen for size changes and retry initialization when dimensions become available.
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        const container = chartContainerRef.current;
        if (!container) return;

        const instance = chartInstanceRef.current;
        if (!instance) {
          scheduleCreate();
          return;
        }

        const { width, height } = container.getBoundingClientRect();
        if (width === 0 || height === 0) return;
        try {
          instance.applyOptions({
            width: Math.floor(width),
            height: Math.floor(height),
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Failed to resize chart';
          setError(message);
          logger.warn(
            'Failed to resize chart',
            { error },
            'useLightweightChart'
          );
        }
      });
      if (chartContainerRef.current) {
        resizeObserver.observe(chartContainerRef.current);
      }
    }

    const handleVisibility = () => {
      scheduleCreate();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      mounted = false;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      if (initTimeoutId) {
        clearTimeout(initTimeoutId);
        initTimeoutId = null;
      }
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      document.removeEventListener('visibilitychange', handleVisibility);
      if (chartInstanceRef.current) {
        chartInstanceRef.current.remove();
        chartInstanceRef.current = null;
        setChart(null);
      }
    };
  }, []);

  return { chartContainerRef, chart, error };
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
  const prefix = includeSymbol ? BABYLON_POINTS_SYMBOL : '';

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
