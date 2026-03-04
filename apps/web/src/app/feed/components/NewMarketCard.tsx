'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import type { NarrativeStory } from '@/app/feed/types/narrative';

interface NewMarketCardProps {
  story: NarrativeStory;
}

function formatCountdown(isoDate: string): string {
  const parsed = new Date(isoDate);
  if (isNaN(parsed.getTime())) return '';
  const ms = parsed.getTime() - Date.now();
  if (ms <= 0) return 'Closing soon';
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 24) return `${hours}h left`;
  const days = Math.floor(hours / 24);
  return `${days}d left`;
}

/**
 * Compute YES/NO percentage values from AMM share counts.
 *
 * When total shares = 0 (brand-new market, no trades yet) the AMM opens at
 * exact parity, so we return 50/50. This matches calculateSharePercentages()
 * in apps/web/src/app/markets/_lib/formatters.ts which also returns 50/50
 * for zero shares. As trades accumulate the percentages will diverge from 50.
 */
function computePercentages(
  yesShares: number,
  noShares: number
): { yesPercent: number; noPercent: number } {
  const total = yesShares + noShares;
  if (total === 0) return { yesPercent: 50, noPercent: 50 };
  const yesPercent = Math.round((yesShares / total) * 100);
  return { yesPercent, noPercent: 100 - yesPercent };
}

/**
 * Inline prediction market discovery card for the Stories and Latest feeds.
 * All data comes from the API — question text, resolution date, market UUID,
 * and live share counts. Deep-links to /markets/predictions/[marketId] when
 * a market UUID is available; falls back to the predictions list otherwise.
 */
export function NewMarketCard({ story }: NewMarketCardProps) {
  const countdown = useMemo(
    () => (story.resolutionDate ? formatCountdown(story.resolutionDate) : null),
    [story.resolutionDate]
  );

  const { yesPercent, noPercent } = useMemo(
    () => computePercentages(story.yesShares ?? 0, story.noShares ?? 0),
    [story.yesShares, story.noShares]
  );

  // Deep-link to the individual market when we have its UUID;
  // fall back to the predictions list if the market hasn't been matched.
  const marketBase = story.marketId
    ? `/markets/predictions/${encodeURIComponent(story.marketId)}`
    : '/markets?tab=predictions';

  // Pre-select the trade direction on the destination page
  const tradeYesHref = `${marketBase}${story.marketId ? '?side=yes' : '&side=yes'}`;
  const tradeNoHref = `${marketBase}${story.marketId ? '?side=no' : '&side=no'}`;
  const viewHref = marketBase;

  return (
    <div className="border-border border-b px-4 py-4">
      {/* Meta row */}
      <div className="mb-2 flex items-center gap-2 text-muted-foreground text-xs">
        <span className="font-medium text-foreground/70">
          Prediction Market
        </span>
        {countdown && (
          <>
            <span>·</span>
            <span>{countdown}</span>
          </>
        )}
      </div>

      {/* Question */}
      <p className="mb-4 font-semibold text-foreground text-sm leading-snug">
        {story.storyTitle}
      </p>

      {/* YES / NO probability bars — sourced from live market share counts */}
      <div className="mb-4 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="w-8 text-right font-medium text-green-600 text-xs">
            YES
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-green-500"
              style={{ width: `${yesPercent}%` }}
            />
          </div>
          <span className="w-8 text-muted-foreground text-xs">
            {yesPercent}%
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-8 text-right font-medium text-red-500 text-xs">
            NO
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-red-500"
              style={{ width: `${noPercent}%` }}
            />
          </div>
          <span className="w-8 text-muted-foreground text-xs">
            {noPercent}%
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Link
          href={tradeYesHref}
          className="inline-flex items-center rounded-md border border-green-600 px-3 py-1.5 font-semibold text-green-600 text-sm transition-colors hover:bg-green-600/10"
        >
          Trade YES
        </Link>
        <Link
          href={tradeNoHref}
          className="inline-flex items-center rounded-md border border-red-500 px-3 py-1.5 font-semibold text-red-500 text-sm transition-colors hover:bg-red-500/10"
        >
          Trade NO
        </Link>
        <Link
          href={viewHref}
          className="ml-auto text-muted-foreground text-sm transition-colors hover:text-foreground"
        >
          View market →
        </Link>
      </div>
    </div>
  );
}
