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
 * Defers the price history fetch until the component scrolls into the
 * viewport (IntersectionObserver with 100px rootMargin). This prevents
 * all 20 visible cards from firing concurrent /history requests on mount,
 * which was causing 429 rate-limit cascades on the narrative feed.
 */
export function NarrativePredictionChart({
  marketId,
}: NarrativePredictionChartProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [chartWidth, setChartWidth] = useState(280);

  // Only trigger history fetch once the card is actually visible
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

  // Measure container width so the sparkline fills the available space
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setChartWidth(Math.floor(entry.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [inView]);

  const { history, loading } = usePredictionHistory(
    inView ? marketId : '',
    { limit: 40 }
  );

  const latest = history[history.length - 1];
  const yesPercent = Math.round((latest?.yesPrice ?? 0.5) * 100);
  const noPercent = 100 - yesPercent;

  // Reserve the layout slot while not yet in view so the scroll sentinel
  // position doesn't jump when charts load in below the fold.
  if (!inView || loading || history.length === 0) {
    return <div ref={wrapperRef} className="h-px" />;
  }

  return (
    <div ref={wrapperRef} className="mx-4 mb-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
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
