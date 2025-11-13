'use client';

import { XAxis, YAxis, CartesianGrid, Area, AreaChart, ReferenceLine } from 'recharts';
import type { ChartConfig } from '@/components/ui/chart';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';

interface PricePoint {
  time: number;
  yesPrice: number;
  noPrice: number;
  volume: number;
}

interface PredictionProbabilityChartProps {
  data: PricePoint[];
  marketId: string;
}

const chartConfig = {
  probability: {
    label: "YES Probability",
    color: "#0066FF",
  },
} satisfies ChartConfig;

export function PredictionProbabilityChart({ data, marketId }: PredictionProbabilityChartProps) {
  if (data.length === 0) {
    return (
      <div className="h-[400px] flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <div className="text-sm">Loading chart data...</div>
        </div>
      </div>
    );
  }

  // Format data for recharts - convert to percentages
  // We only show YES probability since NO = 100% - YES
  const chartData = data.map(point => ({
    timestamp: point.time,
    probability: point.yesPrice * 100,
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

  return (
    <div className="w-full">
      <div className="bg-muted/20 rounded-lg p-3">
        <ChartContainer config={chartConfig} className="aspect-auto h-[400px] w-full">
          <AreaChart
            accessibilityLayer
            data={chartData}
            margin={{
              left: 12,
              right: 12,
              top: 12,
              bottom: 12,
            }}
          >
            <defs>
              <linearGradient id={`fillProbability-${marketId}`} x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor={lineColor}
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor={lineColor}
                  stopOpacity={0.1}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              horizontal={false}
              strokeDasharray="8 8"
              strokeWidth={2}
              stroke="hsl(var(--muted-foreground))"
              opacity={0.3}
            />
            <XAxis
              dataKey="timestamp"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
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
              className="text-xs fill-muted-foreground"
            />
            <YAxis
              orientation="right"
              tickLine={false}
              axisLine={false}
              tickMargin={0}
              tickCount={6}
              className="text-xs fill-muted-foreground"
              tickFormatter={(value) => `${value.toFixed(0)}%`}
              domain={[0, 100]}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  indicator="dot"
                  className="min-w-[200px] px-3 py-2"
                  labelFormatter={(_, items) => {
                    const first = Array.isArray(items) && items.length > 0 ? items[0] : undefined;
                    const p = first && typeof first === 'object' && 'payload' in first ? (first.payload as { date?: string }) : undefined;
                    return p?.date ?? '';
                  }}
                  formatter={(value, _name) => {
                    if (typeof value !== 'number') return value;
                    const yesProb = value.toFixed(1);
                    const noProb = (100 - value).toFixed(1);
                    return (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-green-600"></div>
                          <span>YES: {yesProb}%</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-red-600"></div>
                          <span>NO: {noProb}%</span>
                        </div>
                      </div>
                    );
                  }}
                />
              }
            />
            <ReferenceLine
              y={50}
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="4 4"
              strokeWidth={1}
              strokeOpacity={0.5}
              label={{
                value: '50%',
                position: 'insideTopRight',
                fill: 'hsl(var(--muted-foreground))',
                fontSize: 11,
              }}
            />
            <Area
              dataKey="probability"
              type="linear"
              fill={`url(#fillProbability-${marketId})`}
              fillOpacity={0.4}
              stroke={lineColor}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ChartContainer>
      </div>
    </div>
  );
}

