'use client'

import { memo, useMemo } from 'react'
import { LineChart, Line } from 'recharts'

/**
 * Prediction sparkline component for displaying mini price trend charts.
 * 
 * Displays a small line chart showing the last 20 data points of YES/NO probability
 * trends. Used as a compact visualization in lists and cards. Shows both YES
 * (green) and NO (red) probability lines.
 * 
 * Features:
 * - Compact line chart (default 120x32px)
 * - Last 20 data points only
 * - Dual lines (YES and NO)
 * - Color-coded (green YES, red NO)
 * - Empty state handling
 * 
 * @param props - PredictionSparkline component props
 * @returns Prediction sparkline element or empty state
 * 
 * @example
 * ```tsx
 * <PredictionSparkline
 *   data={priceHistory}
 *   width={120}
 *   height={32}
 * />
 * ```
 */
interface PredictionSparklineProps {
  data: Array<{ time: number; yesPrice: number; noPrice: number }>
  width?: number
  height?: number
}

function PredictionSparklineBase({ data, width = 120, height = 32 }: PredictionSparklineProps) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return []
    return data.slice(-20).map((point) => {
      const yes = (point.yesPrice ?? 0.5) * 100
      const no = point.noPrice !== undefined ? point.noPrice * 100 : 100 - yes
      return {
        yesProbability: yes,
        noProbability: no,
        timestamp: point.time,
      }
    })
  }, [data])

  if (chartData.length === 0) {
    return <div className="text-xs text-muted-foreground">–</div>
  }

  return (
    <LineChart
      width={width}
      height={height}
      data={chartData}
      margin={{ top: 2, right: 0, bottom: 2, left: 0 }}
    >
      <Line
        type="monotone"
        dataKey="yesProbability"
        stroke="#22c55e"
        strokeWidth={1.5}
        dot={false}
        isAnimationActive={false}
      />
      <Line
        type="monotone"
        dataKey="noProbability"
        stroke="#ef4444"
        strokeWidth={1.5}
        dot={false}
        isAnimationActive={false}
      />
    </LineChart>
  )
}

export const PredictionSparkline = memo(PredictionSparklineBase)
