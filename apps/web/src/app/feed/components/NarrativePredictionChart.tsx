'use client';

import { useEffect, useRef, useState } from 'react';
import { PredictionSparkline } from '@/components/markets/PredictionSparkline';
import { usePredictionHistory } from '@/hooks/usePredictionHistory';

interface NarrativePredictionChartProps {
  marketId: string;
}

/**
 * Compact prediction probability chart for inline use on feed post cards.
 *
 * Fetches price history for the given marketId and renders a sparkline
 * showing the YES/NO probability trend. Silently renders nothing if
 * history is unavailable (loading, error, or empty).
 */
export function NarrativePredictionChart({
  marketId,
}: NarrativePredictionChartProps) {
  const { history, loading } = usePredictionHistory(marketId, { limit: 40 });
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(280);

  // Measure container width so the sparkline fills the available space
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setChartWidth(Math.floor(entry.contentRect.width));
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  if (loading || history.length === 0) return null;

  const latest = history[history.length - 1];
  const yesPercent = Math.round((latest?.yesPrice ?? 0.5) * 100);
  const noPercent = 100 - yesPercent;

  return (
    <div className="mx-4 mb-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="font-medium text-green-500">{yesPercent}% YES</span>
        <span className="text-muted-foreground text-[10px]">probability</span>
        <span className="font-medium text-red-500">{noPercent}% NO</span>
      </div>
      <div ref={containerRef} className="w-full overflow-hidden">
        <PredictionSparkline data={history} width={chartWidth} height={40} />
      </div>
    </div>
  );
}
