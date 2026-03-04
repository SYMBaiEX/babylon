/**
 * Feed algorithm utilities — pure functions with no React or browser deps.
 *
 * Extracted from the component files so both the rendering components and
 * unit tests can import the real implementation rather than maintaining copies.
 */

import type { FeedPost } from '@babylon/shared';
import type { NarrativePost, NarrativeStory } from '@babylon/shared';
import type { NewMarketEntry } from '@/app/api/feed/new-markets/route';

// ─── flattenStories ───────────────────────────────────────────────────────────

export type FlatItem =
  | { type: 'post'; post: NarrativePost; key: string }
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
 * Stories arrive sorted by score DESC (from the API). Each story contributes
 * BURST_SIZE consecutive posts per rotation pass. The highest-scored story
 * (index 0) gets BURST_LEAD posts on its first pass for extra prominence.
 * New market cards (no posts) emit a single card at their scored position.
 */
export function flattenStories(stories: NarrativeStory[]): FlatItem[] {
  const items: FlatItem[] = [];
  const queues = stories.map((s) => ({
    story: s,
    posts: [...s.posts],
    marketEmitted: false,
    firstAppearance: true,
  }));

  let anyLeft = true;
  while (anyLeft) {
    anyLeft = false;
    for (const q of queues) {
      if (q.story.isNewMarket) {
        if (!q.marketEmitted) {
          q.marketEmitted = true;
          items.push({ type: 'market', story: q.story, key: q.story.storyKey });
          anyLeft = true;
        }
        continue;
      }

      if (q.posts.length === 0) continue;

      // Top story (index 0) gets extra posts on first appearance for prominence
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
        });
        took++;
      }
      anyLeft = true;
    }
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
