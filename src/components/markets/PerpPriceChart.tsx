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
  price: number;
}

interface PerpPriceChartProps {
  data: PricePoint[];
  currentPrice: number;
  ticker: string;
}

const chartConfig = {
  price: {
    label: "Price",
    color: "hsl(var(--chart-1))",
  },
  priceUp: {
    label: "Price Up",
    color: "#16a34a",
  },
  priceDown: {
    label: "Price Down",
    color: "#dc2626",
  },
} satisfies ChartConfig;

export function PerpPriceChart({ data, currentPrice, ticker }: PerpPriceChartProps) {
  if (data.length === 0) {
    return (
      <div className="h-[400px] flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <div className="text-sm">Loading chart data...</div>
        </div>
      </div>
    );
  }

  // Determine if the price is going up or down for color
  const isPositive = (data[data.length - 1]?.price ?? 0) >= (data[0]?.price ?? 0);
  const priceColor = isPositive ? 'var(--color-priceUp)' : 'var(--color-priceDown)';

  // Format value for display
  const formatValue = (value: number, includeSymbol: boolean = false): string => {
    const prefix = includeSymbol ? '$' : '';
    
    if (value === 0) return '';
    if (value >= 1000000000) return `${prefix}${(value / 1000000000).toFixed(2)}B`;
    if (value >= 1000000) return `${prefix}${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `${prefix}${(value / 1000).toFixed(2)}K`;
    if (value >= 1) return `${prefix}${value.toFixed(2)}`;
    if (value >= 0.01) return `${prefix}${value.toFixed(4)}`;
    if (value >= 0.0001) return `${prefix}${value.toFixed(6)}`;
    return `${prefix}${value.toFixed(8)}`;
  };

  const formatYAxisValue = (value: number): string => formatValue(value, true);

  // Format data for recharts
  const chartData = data.map(point => ({
    timestamp: point.time,
    price: point.price,
    date: new Date(point.time).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
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
              <linearGradient id={`fillPrice-${ticker}`} x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor={priceColor}
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor={priceColor}
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
                return d.toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
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
              tickFormatter={formatYAxisValue}
              domain={['auto', 'auto']}
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
                  formatter={(value) => {
                    if (typeof value !== 'number') return value;
                    return formatValue(value, true);
                  }}
                />
              }
            />
            <Area
              dataKey="price"
              type="linear"
              fill={`url(#fillPrice-${ticker})`}
              fillOpacity={0.4}
              stroke={priceColor}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <ReferenceLine
              y={currentPrice}
              stroke="#0066FF"
              strokeDasharray="4 4"
              strokeWidth={1}
              label={{
                value: formatValue(currentPrice, true),
                position: 'insideTopLeft',
                fill: '#0066FF',
                fontSize: 12,
                fontWeight: 'bold',
              }}
            />
          </AreaChart>
        </ChartContainer>
      </div>
    </div>
  );
}

