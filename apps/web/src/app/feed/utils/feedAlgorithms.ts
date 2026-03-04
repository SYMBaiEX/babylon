/**
 * Feed algorithm utilities — pure functions with no React or browser deps.
 *
 * Extracted from the component files so both the rendering components and
 * unit tests can import the real implementation rather than maintaining copies.
 */

import type { FeedPost, NarrativePost, NarrativeStory } from '@babylon/shared';
import type { NewMarketEntry } from '@/app/api/feed/new-markets/route';

// ─── flattenStories ───────────────────────────────────────────────────────────

export type FlatItem =
  | { type: 'post'; post: NarrativePost; key: string; marketId: string | null }
  | { type: 'market'; story: NarrativeStory; key: string };

/**
 * How many consecutive posts to show from a story before rotating to the next.
 *
 * A burst of BURST_SIZE gives users enough context to decide if they're
 * interested in a topic before the feed rotates to fresh content.
 * The top-scored story gets BURST_LEAD posts on its first appearance so the
 * highest-signal content surfaces clearly at the top.
 */
export const BURST_SIZE = 3;
export const BURST_LEAD = 4;

/**
 * Flatten scored stories into an interleaved burst list.
 *
 * Market cards (isNewMarket) are separated from post-stories and injected
 * one-per-rotation so they appear throughout the feed rather than clustering
 * at the top. Without separation, market cards score near 1.0 (brand-new
 * recency) and beat all posts, causing every market to appear before any post.
 *
 * Layout produced (3 stories, 2 markets):
 *   [A×BURST_LEAD] [B×BURST_SIZE] [C×BURST_SIZE] [Market1]
 *   [A×BURST_SIZE] [B×BURST_SIZE] [C×BURST_SIZE] [Market2]
 *   [A remaining…]
 */
export function flattenStories(stories: NarrativeStory[]): FlatItem[] {
  const items: FlatItem[] = [];

  // Separate market cards from post-stories so market cards can be
  // injected at controlled intervals rather than all before the first post.
  const pendingMarkets = stories.filter((s) => s.isNewMarket);
  const postStories = stories.filter((s) => !s.isNewMarket);

  if (postStories.length === 0) {
    // No posts at all — just emit the market cards in score order
    for (const m of pendingMarkets) {
      items.push({ type: 'market', story: m, key: m.storyKey });
    }
    return items;
  }

  const queues = postStories.map((s) => ({
    story: s,
    posts: [...s.posts],
    firstAppearance: true,
  }));

  let marketIdx = 0;
  let anyLeft = true;

  while (anyLeft) {
    anyLeft = false;

    for (const q of queues) {
      if (q.posts.length === 0) continue;

      // Top post-story gets extra posts on first appearance for prominence
      const burst =
        q.firstAppearance && queues.indexOf(q) === 0 ? BURST_LEAD : BURST_SIZE;
      q.firstAppearance = false;

      let took = 0;
      while (took < burst && q.posts.length > 0) {
        const post = q.posts.shift()!;
        items.push({
          type: 'post',
          post,
          key: `${q.story.storyKey}:${post.id}`,
          marketId: q.story.marketId ?? null,
        });
        took++;
      }
      anyLeft = true;
    }

    // After each complete rotation of all post-stories, inject one market card.
    // This spaces market cards evenly through the stream instead of clustering
    // them all before the first post.
    if (marketIdx < pendingMarkets.length) {
      const m = pendingMarkets[marketIdx++]!;
      items.push({ type: 'market', story: m, key: m.storyKey });
    }
  }

  // Append any market cards that didn't fit within the post rotations
  while (marketIdx < pendingMarkets.length) {
    const m = pendingMarkets[marketIdx++]!;
    items.push({ type: 'market', story: m, key: m.storyKey });
  }

  return items;
}

// ─── mergeChronologically ─────────────────────────────────────────────────────

export type MixedItem =
  | { type: 'post'; post: FeedPost }
  | { type: 'market'; market: NewMarketEntry };

/**
 * Merge a post list and a market list into a single newest-first stream.
 *
 * A market opened 30 minutes ago will appear between posts that are
 * 25 and 35 minutes old — not batched at the top. Both lists must already
 * be sorted newest-first; this function does a single sort over the combined
 * array.
 */
export function mergeChronologically(
  posts: FeedPost[],
  markets: NewMarketEntry[]
): MixedItem[] {
  const all: MixedItem[] = [
    ...posts.map((p) => ({ type: 'post' as const, post: p })),
    ...markets.map((m) => ({ type: 'market' as const, market: m })),
  ];
  return all.sort((a, b) => {
    const ta =
      a.type === 'post'
        ? new Date(a.post.timestamp).getTime()
        : new Date(a.market.createdAt).getTime();
    const tb =
      b.type === 'post'
        ? new Date(b.post.timestamp).getTime()
        : new Date(b.market.createdAt).getTime();
    return tb - ta;
  });
}
