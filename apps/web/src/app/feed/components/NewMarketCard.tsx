'use client';

import { CheckCircle, ExternalLink, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { NarrativeStory } from '@/app/feed/types/narrative';
import { InteractionBar } from '@/components/interactions/InteractionBar';
import { PredictionProbabilityChart } from '@/components/markets/PredictionProbabilityChart';
import { PredictionTradingModal } from '@/components/markets/PredictionTradingModal';
import { usePredictionHistory } from '@/hooks/usePredictionHistory';
import type { MarketTimeRange, PredictionMarket } from '@/types/markets';

interface NewMarketCardProps {
  story: NarrativeStory;
  /**
   * When true, the card is rendered inline below a PostCard inside an existing
   * bordered list item. Uses border-t (top separator) instead of border-b so
   * the outer wrapper's border-b acts as the item divider and we don't produce
   * a double bottom border.
   */
  embedded?: boolean;
  onOpenMarket?: () => void;
  onTradeComplete?: () => void;
}

type TradeSide = 'YES' | 'NO';

function formatCountdown(isoDate: string): string {
  const parsed = new Date(isoDate);
  if (isNaN(parsed.getTime())) return '';
  const ms = parsed.getTime() - Date.now();
  if (ms <= 0) return 'Closing soon';
  const totalMinutes = Math.floor(ms / (1000 * 60));
  if (totalMinutes < 60) return `${totalMinutes}m left`;
  const hours = Math.floor(totalMinutes / 60);
  if (hours < 24) return `${hours}h left`;
  const days = Math.floor(hours / 24);
  return `${days}d left`;
}

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
 * Prediction probability chart for market cards in the feed.
 *
 * Uses the same PredictionProbabilityChart as the markets terminal so the
 * visual language is consistent. Lazy-loads history via IntersectionObserver
 * to prevent 429 cascades, and passes seed data from the market's live share
 * counts so brand-new markets (no API history yet) show a flat line at the
 * current probability instead of a black placeholder.
 */
function MarketChart({
  marketId,
  yesShares,
  noShares,
}: {
  marketId: string;
  yesShares: number;
  noShares: number;
}) {
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
      { rootMargin: '150px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const { history } = usePredictionHistory(inView ? marketId : '', {
    limit: 200,
    range: timeRange,
    // Seed ensures brand-new markets (no API history) show a flat probability
    // line rather than a black placeholder — same pattern as the terminal.
    seed: { yesShares, noShares },
  });

  return (
    // Constrain height so PredictionProbabilityChart (height="fill") fits
    // the feed card without the 400px overflow from height="fixed".
    // The terminal uses the same fill+constrained-parent pattern.
    <div ref={wrapperRef} className="h-[160px] w-full">
      {inView ? (
        <PredictionProbabilityChart
          data={history}
          marketId={marketId}
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
          showHeader={false}
          height="fill"
        />
      ) : (
        <div className="h-full w-full animate-pulse rounded bg-muted/40" />
      )}
    </div>
  );
}

/**
 * Inline prediction market card for the For You and Latest feeds.
 *
 * Mirrors the pattern used in the markets page (PredictionMarketCard +
 * PredictionTradingModal) so users can trade directly from the feed without
 * navigating away. Falls back to navigation links when no marketId is available.
 */
export function NewMarketCard({
  story,
  embedded = false,
  onOpenMarket,
  onTradeComplete,
}: NewMarketCardProps) {
  const router = useRouter();
  const [tradeSide, setTradeSide] = useState<TradeSide | null>(null);

  const countdown = story.resolutionDate
    ? formatCountdown(story.resolutionDate)
    : null;

  const { yesPercent, noPercent } = computePercentages(
    story.yesShares ?? 0,
    story.noShares ?? 0
  );

  // Build a minimal PredictionMarket object from the story data — same
  // pattern as toPredictionMarket() in agents/team/panels/PredictionsPanel.tsx
  const market: PredictionMarket | null = story.marketId
    ? {
        id: story.marketId,
        text: story.storyTitle,
        status: 'active',
        scenario: 0,
        yesShares: story.yesShares ?? 0,
        noShares: story.noShares ?? 0,
        resolutionDate: story.resolutionDate,
        endDate: story.resolutionDate,
      }
    : null;

  const viewHref = story.marketId
    ? `/markets/predictions/${encodeURIComponent(story.marketId)}`
    : '/markets?tab=predictions';

  return (
    <div
      className={`border-border px-4 py-4 ${embedded ? 'border-t' : 'border-b'}`}
    >
      {/* Header row: label + countdown */}
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
          Prediction Market
        </span>
        {countdown && (
          <span className="text-muted-foreground text-xs">{countdown}</span>
        )}
      </div>

      {/* Market question */}
      <p className="mb-3 font-semibold text-foreground text-sm leading-snug">
        {story.storyTitle}
      </p>

      {/* Probability chart — only rendered when marketId is available */}
      {story.marketId && (
        <div className="mb-3 overflow-hidden rounded-md border border-border bg-muted/20">
          <MarketChart
            marketId={story.marketId}
            yesShares={story.yesShares ?? 0}
            noShares={story.noShares ?? 0}
          />
        </div>
      )}

      {/* YES / NO probability bars */}
      <div className="mb-4 space-y-2">
        <div className="flex items-center gap-2">
          <span className="w-12 shrink-0 text-right font-semibold text-green-500 text-xs">
            {yesPercent}%
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-green-500 transition-all duration-500"
              style={{ width: `${yesPercent}%` }}
            />
          </div>
          <span className="w-7 shrink-0 font-medium text-muted-foreground text-xs">
            YES
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-12 shrink-0 text-right font-semibold text-red-500 text-xs">
            {noPercent}%
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-red-500 transition-all duration-500"
              style={{ width: `${noPercent}%` }}
            />
          </div>
          <span className="w-7 shrink-0 font-medium text-muted-foreground text-xs">
            NO
          </span>
        </div>
      </div>

      {/* Trade buttons — same pattern as agents/team/panels/PredictionsPanel.tsx */}
      <div className="flex items-center gap-2">
        {market ? (
          <>
            <button
              type="button"
              onClick={() => {
                onOpenMarket?.();
                setTradeSide('YES');
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-600 py-2.5 font-bold text-sm text-white transition-colors hover:bg-green-700 active:scale-95"
            >
              <CheckCircle size={15} />
              BUY YES
            </button>
            <button
              type="button"
              onClick={() => {
                onOpenMarket?.();
                setTradeSide('NO');
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-600 py-2.5 font-bold text-sm text-white transition-colors hover:bg-red-700 active:scale-95"
            >
              <XCircle size={15} />
              BUY NO
            </button>
          </>
        ) : (
          // Fallback when marketId is unknown — navigate to markets list
          <>
            <Link
              href={`/markets?tab=predictions&side=yes`}
              onClick={() => onOpenMarket?.()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-600 py-2.5 font-bold text-sm text-white transition-colors hover:bg-green-700"
            >
              BUY YES
            </Link>
            <Link
              href={`/markets?tab=predictions&side=no`}
              onClick={() => onOpenMarket?.()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-600 py-2.5 font-bold text-sm text-white transition-colors hover:bg-red-700"
            >
              BUY NO
            </Link>
          </>
        )}
        <Link
          href={viewHref}
          onClick={() => onOpenMarket?.()}
          className="inline-flex items-center gap-1 px-2 py-2.5 text-muted-foreground text-sm transition-colors hover:text-foreground"
          aria-label="View full market"
        >
          <ExternalLink size={15} />
        </Link>
      </div>

      {/* Social interaction bar — anchored to the NPC post ID so the card
          is likeable, commentable, and shareable like any regular post.
          Only rendered when anchorPostId is available. */}
      {story.anchorPostId && (
        <div
          className="mt-3 border-border border-t pt-1"
          onClick={(e) => e.stopPropagation()}
        >
          <InteractionBar
            postId={story.anchorPostId}
            initialInteractions={{
              postId: story.anchorPostId,
              likeCount: 0,
              commentCount: 0,
              shareCount: 0,
              isLiked: false,
              isShared: false,
            }}
            onCommentClick={() => router.push(`/post/${story.anchorPostId}`)}
          />
        </div>
      )}

      {/* PredictionTradingModal — same pattern as agents panel */}
      {market && tradeSide && (
        <PredictionTradingModal
          question={market}
          isOpen={!!tradeSide}
          onClose={() => setTradeSide(null)}
          defaultSide={tradeSide}
          onSuccess={onTradeComplete}
        />
      )}
    </div>
  );
}
