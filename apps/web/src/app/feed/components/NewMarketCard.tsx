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
 * Inline prediction market discovery card for the Stories and Latest feeds.
 * Appears at the scored/chronological position of newly-opened markets.
 * Renders as a clean feed card with a YES/NO probability bar and trade actions.
 */
export function NewMarketCard({ story }: NewMarketCardProps) {
  const countdown = useMemo(
    () => (story.resolutionDate ? formatCountdown(story.resolutionDate) : null),
    [story.resolutionDate]
  );

  const tradeHref = story.questionNumber
    ? `/markets?tab=predictions&q=${story.questionNumber}`
    : '/markets?tab=predictions';

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

      {/* YES / NO probability bar — new markets open at 50/50 parity */}
      <div className="mb-4 space-y-1.5">
        {/* YES bar */}
        <div className="flex items-center gap-2">
          <span className="w-8 text-right font-medium text-green-600 text-xs">
            YES
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-1/2 rounded-full bg-green-500" />
          </div>
          <span className="w-8 text-muted-foreground text-xs">50%</span>
        </div>
        {/* NO bar */}
        <div className="flex items-center gap-2">
          <span className="w-8 text-right font-medium text-red-500 text-xs">
            NO
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-1/2 rounded-full bg-red-500" />
          </div>
          <span className="w-8 text-muted-foreground text-xs">50%</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Link
          href={tradeHref}
          className="inline-flex items-center rounded-md border border-green-600 px-3 py-1.5 font-semibold text-green-600 text-sm transition-colors hover:bg-green-600/10"
        >
          Trade YES
        </Link>
        <Link
          href={tradeHref}
          className="inline-flex items-center rounded-md border border-red-500 px-3 py-1.5 font-semibold text-red-500 text-sm transition-colors hover:bg-red-500/10"
        >
          Trade NO
        </Link>
        <Link
          href={tradeHref}
          className="ml-auto text-muted-foreground text-sm transition-colors hover:text-foreground"
        >
          View market →
        </Link>
      </div>
    </div>
  );
}
