'use client'

import { memo, useMemo } from 'react'
import { Area, AreaChart } from 'recharts'

interface PredictionSparklineProps {
  data: Array<{ time: number; yesPrice: number }>
  width?: number
  height?: number
}

function PredictionSparklineBase({ data, width = 120, height = 32 }: PredictionSparklineProps) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return []
    return data.slice(-20).map((point) => ({
      probability: point.yesPrice * 100,
      timestamp: point.time,
    }))
  }, [data])

  if (chartData.length === 0) {
    return <div className="text-xs text-muted-foreground">–</div>
  }

  return (
    <AreaChart
      width={width}
      height={height}
      data={chartData}
      margin={{ top: 2, right: 0, bottom: 2, left: 0 }}
    >
      <defs>
        <linearGradient id="sparklineGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.8} />
          <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.1} />
        </linearGradient>
      </defs>
      <Area
        type="monotone"
        dataKey="probability"
        stroke="#0ea5e9"
        strokeWidth={1.5}
        fill="url(#sparklineGradient)"
        isAnimationActive={false}
      />
    </AreaChart>
  )
}

export const PredictionSparkline = memo(PredictionSparklineBase)
