'use client';

import { cn } from '@babylon/shared';
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
 * Card shown in the Stories and Latest feeds when a new prediction market
 * opens. Lets users discover and navigate to trade directly from the feed.
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
    <div className="border-border border-b bg-primary/[0.03]">
      <div className="px-4 py-3">
        {/* Header row */}
        <div className="mb-2.5 flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-primary px-2 py-0.5 font-semibold text-primary-foreground text-xs">
            New Market
          </span>
          {countdown && (
            <span className="text-muted-foreground text-xs">{countdown}</span>
          )}
        </div>

        {/* Question text */}
        <p className="mb-3 font-medium text-foreground text-sm leading-snug">
          {story.storyTitle}
        </p>

        {/* Trade CTA */}
        <div className="flex items-center gap-2">
          <Link
            href={tradeHref}
            className={cn(
              'inline-flex items-center rounded-md px-4 py-1.5',
              'bg-primary font-semibold text-primary-foreground text-sm',
              'transition-colors hover:bg-primary/90'
            )}
          >
            Trade Now
          </Link>
          <Link
            href={tradeHref}
            className="text-muted-foreground text-sm transition-colors hover:text-foreground"
          >
            View market →
          </Link>
        </div>
      </div>
    </div>
  );
}
