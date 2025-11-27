'use client';

import { useState } from 'react';
import {
  Area,
  AreaChart,
  Brush,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts';
import type { ChartConfig } from '@/components/ui/chart';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';

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
 * Prediction probability chart component for displaying YES/NO probability history.
 *
 * Displays an area chart showing the historical probability of YES vs NO outcomes
 * for a prediction market. Shows both YES and NO probability lines, current
 * probability percentages, and includes zoom functionality.
 *
 * Features:
 * - Dual area chart (YES and NO probabilities)
 * - Current probability display
 * - Zoom and brush controls
 * - Color-coded by favored outcome
 * - Responsive tooltips
 * - Loading state handling
 *
 * @param props - PredictionProbabilityChart component props
 * @returns Prediction probability chart element
 *
 * @example
 * ```tsx
 * <PredictionProbabilityChart
 *   data={probabilityHistory}
 *   marketId="market-123"
 *   showBrush={false}
 * />
 * ```
 */
interface PredictionProbabilityChartProps {
  data: PricePoint[];
  marketId: string;
  showBrush?: boolean;
}

const chartConfig = {
  probability: {
    label: 'YES Probability',
    color: '#16a34a',
  },
  noProbability: {
    label: 'NO Probability',
    color: '#dc2626',
  },
} satisfies ChartConfig;

export function PredictionProbabilityChart({
  data,
  marketId,
  showBrush = false,
}: PredictionProbabilityChartProps) {
  const [zoomDomain, setZoomDomain] = useState<[number, number] | undefined>(
    undefined
  );

  if (data.length === 0) {
    return (
      <div className="flex h-[400px] items-center justify-center text-muted-foreground">
        <div className="text-center">
          <div className="text-sm">Loading chart data...</div>
        </div>
      </div>
    );
  }

  // Format data for recharts - convert to percentages
  // Include both YES and NO for better visualization
  const chartData = data
    .filter(
      (point) =>
        Number.isFinite(point.time) &&
        Number.isFinite(point.yesPrice) &&
        Number.isFinite(point.noPrice)
    )
    .sort((a, b) => a.time - b.time)
    .map((point) => ({
      timestamp: point.time,
      probability: point.yesPrice * 100,
      noProbability: point.noPrice * 100,
      volume: point.volume,
      date: new Date(point.time).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
      }),
    }));

  const getEvenlySpacedTimeTicks = (count: number): number[] => {
    if (chartData.length === 0) return [];
    const first = chartData[0];
    const last = chartData[chartData.length - 1];
    if (!first || !last) return [];
    const min = first.timestamp;
    const max = last.timestamp;
    if (count <= 1 || min === max) return [min];
    const step = (max - min) / (count - 1);
    return Array.from({ length: count }, (_, i) => Math.round(min + i * step));
  };

  // Determine color based on current probability
  const currentProbability = chartData[chartData.length - 1]?.probability ?? 50;
  const isYesFavored = currentProbability >= 50;
  const lineColor = isYesFavored ? '#16a34a' : '#dc2626'; // Green if YES favored, red if NO favored

  // Reset zoom handler
  const handleResetZoom = () => {
    setZoomDomain(undefined);
  };

  return (
    <div className="w-full space-y-2">
      {/* Outcome indicator */}
      <div className="flex items-center justify-between px-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-green-600" />
            <span className="font-medium text-sm">
              YES {currentProbability.toFixed(1)}%
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-red-600" />
            <span className="font-medium text-sm">
              NO {(100 - currentProbability).toFixed(1)}%
            </span>
          </div>
        </div>
        {zoomDomain && (
          <button
            onClick={handleResetZoom}
            className="text-muted-foreground text-xs transition-colors hover:text-foreground"
          >
            Reset Zoom
          </button>
        )}
      </div>

      <div className="rounded-lg bg-muted/20 p-3">
        <ChartContainer
          key={marketId}
          config={chartConfig}
          className="aspect-auto h-[400px] w-full"
        >
          <AreaChart
            accessibilityLayer
            data={chartData}
            margin={{
              left: 12,
              right: 12,
              top: 12,
              bottom: showBrush ? 32 : 12,
            }}
          >
            <defs>
              <linearGradient
                id={`fillProbabilityYes-${marketId}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="5%" stopColor="#16a34a" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#16a34a" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient
                id={`fillProbabilityNo-${marketId}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="5%" stopColor="#dc2626" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#dc2626" stopOpacity={0.05} />
              </linearGradient>
              {/* YES zone gradient (green, top half) */}
              <linearGradient
                id={`yesZone-${marketId}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor="#16a34a" stopOpacity={0.05} />
                <stop offset="100%" stopColor="#16a34a" stopOpacity={0.02} />
              </linearGradient>
              {/* NO zone gradient (red, bottom half) */}
              <linearGradient
                id={`noZone-${marketId}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor="#dc2626" stopOpacity={0.02} />
                <stop offset="100%" stopColor="#dc2626" stopOpacity={0.05} />
              </linearGradient>
            </defs>

            {/* Background zones for YES (>50%) and NO (<50%) */}
            <ReferenceArea
              y1={50}
              y2={100}
              fill={`url(#yesZone-${marketId})`}
              fillOpacity={1}
            />
            <ReferenceArea
              y1={0}
              y2={50}
              fill={`url(#noZone-${marketId})`}
              fillOpacity={1}
            />

            <CartesianGrid
              horizontal={true}
              vertical={false}
              strokeDasharray="8 8"
              strokeWidth={1}
              stroke="hsl(var(--muted-foreground))"
              opacity={0.2}
            />
            <XAxis
              dataKey="timestamp"
              type="number"
              scale="time"
              domain={zoomDomain || ['dataMin', 'dataMax']}
              ticks={getEvenlySpacedTimeTicks(6)}
              tickFormatter={(ts) => {
                const d = new Date(ts);
                return d.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                });
              }}
              interval={0}
              tickLine={false}
              tickMargin={12}
              strokeWidth={1.5}
              className="fill-muted-foreground text-xs"
            />
            <YAxis
              orientation="right"
              tickLine={false}
              axisLine={false}
              tickMargin={0}
              tickCount={6}
              className="fill-muted-foreground text-xs"
              tickFormatter={(value) => `${value.toFixed(0)}%`}
              domain={[0, 100]}
            />
            <Area
              type="monotone"
              dataKey="probability"
              stroke="#16a34a"
              strokeWidth={2}
              fill={`url(#fillProbabilityYes-${marketId})`}
              isAnimationActive={false}
              name="YES"
            />
            <Area
              type="monotone"
              dataKey="noProbability"
              stroke="#dc2626"
              strokeWidth={2}
              fill={`url(#fillProbabilityNo-${marketId})`}
              isAnimationActive={false}
              name="NO"
            />
            <ChartTooltip
              cursor={{
                stroke: lineColor,
                strokeWidth: 1,
                strokeDasharray: '4 4',
              }}
              content={
                <ChartTooltipContent
                  indicator="dot"
                  className="min-w-[200px] px-3 py-2"
                  labelFormatter={(_, items) => {
                    const first =
                      Array.isArray(items) && items.length > 0
                        ? items[0]
                        : undefined;
                    const p =
                      first && typeof first === 'object' && 'payload' in first
                        ? (first.payload as { date?: string })
                        : undefined;
                    return p?.date ?? '';
                  }}
                  formatter={(value, name) => {
                    if (typeof value !== 'number') return value;
                    const displayName =
                      name === 'probability'
                        ? 'YES'
                        : name === 'noProbability'
                          ? 'NO'
                          : name;
                    const color = displayName === 'YES' ? '#16a34a' : '#dc2626';
                    return (
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        <span>
                          {displayName}: {value.toFixed(1)}%
                        </span>
                      </div>
                    );
                  }}
                />
              }
            />

            {/* 50% reference line */}
            <ReferenceLine
              y={50}
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="4 4"
              strokeWidth={2}
              strokeOpacity={0.6}
              label={{
                value: '50% Line',
                position: 'insideTopRight',
                fill: 'hsl(var(--muted-foreground))',
                fontSize: 11,
                fontWeight: 'bold',
              }}
            />

            {showBrush && (
              <Brush
                dataKey="timestamp"
                height={20}
                stroke={lineColor}
                fill="hsl(var(--muted))"
                onChange={(e) => {
                  if (e.startIndex !== undefined && e.endIndex !== undefined) {
                    const start = chartData[e.startIndex]?.timestamp;
                    const end = chartData[e.endIndex]?.timestamp;
                    if (start && end) {
                      setZoomDomain([start, end]);
                    }
                  }
                }}
              />
            )}
          </AreaChart>
        </ChartContainer>
      </div>
    </div>
  );
}
