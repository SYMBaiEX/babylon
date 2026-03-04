'use client';

import { useEffect, useRef, useState } from 'react';
import { PredictionSparkline } from '@/components/markets/PredictionSparkline';
import { usePredictionHistory } from '@/hooks/usePredictionHistory';

interface NarrativePredictionChartProps {
  marketId: string;
}

/**
 * Compact probability chart attached below a regular feed post card when the
 * post is related to a prediction market.
 *
 * Defers the history fetch via IntersectionObserver so concurrent requests
 * don't saturate the rate limiter when 20 cards are visible at once.
 */
export function NarrativePredictionChart({
  marketId,
}: NarrativePredictionChartProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [chartWidth, setChartWidth] = useState(300);

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

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !inView) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setChartWidth(Math.floor(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [inView]);

  const { history } = usePredictionHistory(inView ? marketId : '', {
    limit: 40,
  });

  if (!inView || history.length === 0) {
    // 1px sentinel keeps scroll position stable; no visible placeholder on posts
    return <div ref={wrapperRef} className="h-px" />;
  }

  const latest = history[history.length - 1];
  const yesPercent = Math.round((latest?.yesPrice ?? 0.5) * 100);
  const noPercent = 100 - yesPercent;

  return (
    <div
      ref={wrapperRef}
      className="mx-4 mb-3 overflow-hidden rounded-md border border-border bg-muted/20"
    >
      {/* Probability header */}
      <div className="flex items-center justify-between border-border border-b px-3 py-1.5">
        <span className="font-semibold text-green-500 text-xs">
          {yesPercent}% YES
        </span>
        <span className="text-[10px] text-muted-foreground">probability</span>
        <span className="font-semibold text-red-500 text-xs">
          {noPercent}% NO
        </span>
      </div>
      {/* Sparkline */}
      <div ref={containerRef} className="w-full">
        <PredictionSparkline data={history} width={chartWidth} height={56} />
      </div>
    </div>
  );
}
