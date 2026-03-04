'use client';

import { useEffect, useRef, useState } from 'react';
import { PredictionProbabilityChart } from '@/components/markets/PredictionProbabilityChart';
import { usePredictionHistory } from '@/hooks/usePredictionHistory';
import type { MarketTimeRange } from '@/types/markets';

interface NarrativePredictionChartProps {
  marketId: string;
  /** Live share counts used to seed the chart for markets with no API history yet */
  yesShares?: number;
  noShares?: number;
}

/**
 * Compact prediction probability chart for inline use on feed post cards.
 *
 * Uses the same PredictionProbabilityChart as the markets terminal for visual
 * consistency. Defers history fetch via IntersectionObserver (100px rootMargin)
 * to prevent 429 cascades when many cards are visible at once. Passes seed
 * data from live share counts so markets with no API history still render.
 */
export function NarrativePredictionChart({
  marketId,
  yesShares = 500,
  noShares = 500,
}: NarrativePredictionChartProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [timeRange, setTimeRange] = useState<MarketTimeRange>('1H');

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin: '100px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const { history } = usePredictionHistory(inView ? marketId : '', {
    limit: 200,
    range: timeRange,
    seed: { yesShares, noShares },
  });

  if (!inView) {
    // 1px sentinel preserves scroll position; no visible placeholder on posts
    return <div ref={wrapperRef} className="h-px" />;
  }

  return (
    <div
      ref={wrapperRef}
      className="mx-4 mb-3 overflow-hidden rounded-md border border-border bg-muted/20"
    >
      <PredictionProbabilityChart
        data={history}
        marketId={marketId}
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
        showHeader={true}
        height="fixed"
      />
    </div>
  );
}
