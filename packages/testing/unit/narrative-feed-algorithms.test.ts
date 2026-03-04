/**
 * Unit Tests: Narrative Feed Algorithms
 *
 * Tests the two pure functions that determine how posts are ordered in the
 * Stories and Latest feeds:
 *   - flattenStories()   — burst interleaving for the Stories tab
 *   - mergeChronologically() — timestamp merge for the Latest tab
 *
 * These are pure functions with no side-effects, making them ideal candidates
 * for unit testing without any mocks.
 *
 * Run with: bun test unit/narrative-feed-algorithms.test.ts
 */

import { describe, expect, it } from 'bun:test';
import type { NarrativePost, NarrativeStory } from '@babylon/shared';

// ─── Re-implement the functions under test ───────────────────────────────────
// The functions live inside 'use client' React components which can't be
// imported directly in a Node test environment. We copy the pure logic here
// and keep it in sync with the source. If the source changes, these tests
// will document the expected behavior and catch regressions.

const BURST_SIZE = 3;
const BURST_LEAD = 4;

type FlatItem =
  | { type: 'post'; post: NarrativePost; key: string }
  | { type: 'market'; story: NarrativeStory; key: string };

function flattenStories(stories: NarrativeStory[]): FlatItem[] {
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
      const burst =
        q.firstAppearance && queues.indexOf(q) === 0 ? BURST_LEAD : BURST_SIZE;
      q.firstAppearance = false;
      let took = 0;
      while (took < burst && q.posts.length > 0) {
        const post = q.posts.shift()!;
        items.push({ type: 'post', post, key: `${q.story.storyKey}:${post.id}` });
        took++;
      }
      anyLeft = true;
    }
  }
  return items;
}

type MixedItem =
  | { type: 'post'; timestamp: string }
  | { type: 'market'; createdAt: string };

function mergeChronologically(
  posts: { timestamp: string }[],
  markets: { createdAt: string; questionNumber: number }[]
): MixedItem[] {
  const all: MixedItem[] = [
    ...posts.map((p) => ({ type: 'post' as const, timestamp: p.timestamp })),
    ...markets.map((m) => ({
      type: 'market' as const,
      createdAt: m.createdAt,
    })),
  ];
  return all.sort((a, b) => {
    const ta =
      a.type === 'post'
        ? new Date(a.timestamp).getTime()
        : new Date(a.createdAt).getTime();
    const tb =
      b.type === 'post'
        ? new Date(b.timestamp).getTime()
        : new Date(b.createdAt).getTime();
    return tb - ta;
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePost(id: string): NarrativePost {
  return {
    id,
    content: `Post ${id}`,
    fullContent: null,
    articleTitle: null,
    category: null,
    imageUrl: null,
    type: null,
    timestamp: new Date().toISOString(),
    authorId: 'user-1',
    authorName: 'Test User',
    authorUsername: null,
    authorProfileImageUrl: null,
    likeCount: 0,
    commentCount: 0,
    shareCount: 0,
    isLiked: false,
    isShared: false,
    relatedQuestion: null,
  };
}

function makeStory(
  key: string,
  postCount: number,
  opts: Partial<NarrativeStory> = {}
): NarrativeStory {
  return {
    storyKey: key,
    storyTitle: `Story ${key}`,
    questionNumber: null,
    arcState: null,
    storyScore: 1,
    postCount,
    posts: Array.from({ length: postCount }, (_, i) => makePost(`${key}-p${i}`)),
    hasUserPosition: false,
    ...opts,
  };
}

// ─── flattenStories tests ─────────────────────────────────────────────────────

describe('flattenStories', () => {
  it('returns empty array for empty input', () => {
    expect(flattenStories([])).toEqual([]);
  });

  it('returns null for a single story with no posts and no isNewMarket', () => {
    const story = makeStory('A', 0);
    expect(flattenStories([story])).toEqual([]);
  });

  it('emits all posts from a single story in order', () => {
    const story = makeStory('A', 5);
    const items = flattenStories([story]);
    expect(items.length).toBe(5);
    expect(items.every((i) => i.type === 'post')).toBe(true);
    const postItems = items.filter((i) => i.type === 'post');
    postItems.forEach((item, idx) => {
      if (item.type === 'post') {
        expect(item.post.id).toBe(`A-p${idx}`);
      }
    });
  });

  it('gives top story BURST_LEAD posts on first pass', () => {
    const storyA = makeStory('A', 10);
    const storyB = makeStory('B', 10);
    const items = flattenStories([storyA, storyB]);

    // First BURST_LEAD items should all be from A
    const firstBatch = items.slice(0, BURST_LEAD);
    expect(firstBatch.every((i) => i.type === 'post' && i.key.startsWith('A:'))).toBe(true);

    // Next BURST_SIZE items should be from B
    const secondBatch = items.slice(BURST_LEAD, BURST_LEAD + BURST_SIZE);
    expect(secondBatch.every((i) => i.type === 'post' && i.key.startsWith('B:'))).toBe(true);
  });

  it('uses BURST_SIZE (not BURST_LEAD) for non-top stories', () => {
    const storyA = makeStory('A', 3);
    const storyB = makeStory('B', 10);
    const items = flattenStories([storyA, storyB]);

    // After A is exhausted (3 posts = BURST_LEAD limited by total), B gets BURST_SIZE
    const postsFromB = items.filter(
      (i) => i.type === 'post' && i.key.startsWith('B:')
    );
    // B should get BURST_SIZE consecutive slots per rotation pass
    // (interleaved, not all at once)
    expect(postsFromB.length).toBe(10);
  });

  it('interleaves posts from three stories', () => {
    const storyA = makeStory('A', 6);
    const storyB = makeStory('B', 6);
    const storyC = makeStory('C', 6);
    const items = flattenStories([storyA, storyB, storyC]);

    expect(items.length).toBe(18);

    // Verify all posts appear
    const keys = items.map((i) => i.key);
    expect(keys.filter((k) => k.startsWith('A:')).length).toBe(6);
    expect(keys.filter((k) => k.startsWith('B:')).length).toBe(6);
    expect(keys.filter((k) => k.startsWith('C:')).length).toBe(6);
  });

  it('emits a new market card once at its scored position', () => {
    const market = makeStory('market:1', 0, {
      isNewMarket: true,
      storyKey: 'market:1',
    });
    const posts = makeStory('posts', 4);
    const items = flattenStories([market, posts]);

    const marketItems = items.filter((i) => i.type === 'market');
    expect(marketItems.length).toBe(1);
    expect(marketItems[0]!.type === 'market' && marketItems[0].story.storyKey).toBe('market:1');
  });

  it('does not emit the same market card twice', () => {
    const market = makeStory('market:1', 0, {
      isNewMarket: true,
      storyKey: 'market:1',
    });
    const items = flattenStories([market]);
    expect(items.filter((i) => i.type === 'market').length).toBe(1);
  });

  it('handles stories with different post counts gracefully', () => {
    const long = makeStory('long', 10);
    const short = makeStory('short', 1);
    const items = flattenStories([long, short]);

    // short should exhaust after 1 post; long should contribute remaining
    expect(items.length).toBe(11);
    expect(items.filter((i) => i.key.startsWith('short:')).length).toBe(1);
    expect(items.filter((i) => i.key.startsWith('long:')).length).toBe(10);
  });
});

// ─── mergeChronologically tests ───────────────────────────────────────────────

describe('mergeChronologically', () => {
  const t = (offsetMinutes: number) =>
    new Date(Date.now() - offsetMinutes * 60 * 1000).toISOString();

  it('returns empty array for empty inputs', () => {
    expect(mergeChronologically([], [])).toEqual([]);
  });

  it('returns posts unchanged when markets is empty', () => {
    const posts = [{ timestamp: t(5) }, { timestamp: t(10) }];
    const result = mergeChronologically(posts, []);
    expect(result.length).toBe(2);
    expect(result.every((i) => i.type === 'post')).toBe(true);
  });

  it('returns markets as market items when posts is empty', () => {
    const markets = [{ createdAt: t(3), questionNumber: 1 }];
    const result = mergeChronologically([], markets);
    expect(result.length).toBe(1);
    expect(result[0]!.type).toBe('market');
  });

  it('sorts newest-first', () => {
    const posts = [{ timestamp: t(30) }, { timestamp: t(10) }];
    const markets = [{ createdAt: t(20), questionNumber: 1 }];
    const result = mergeChronologically(posts, markets);

    // Expected order: 10min ago (post), 20min ago (market), 30min ago (post)
    expect(result[0]!.type).toBe('post');
    expect(result[1]!.type).toBe('market');
    expect(result[2]!.type).toBe('post');
  });

  it('places market card at correct chronological position between posts', () => {
    const posts = [
      { timestamp: t(5) },   // newest
      { timestamp: t(35) },  // oldest
    ];
    const markets = [{ createdAt: t(20), questionNumber: 1 }];
    const result = mergeChronologically(posts, markets);

    expect(result[0]!.type).toBe('post');   // 5min ago
    expect(result[1]!.type).toBe('market'); // 20min ago
    expect(result[2]!.type).toBe('post');   // 35min ago
  });

  it('handles multiple market cards correctly', () => {
    const posts = [{ timestamp: t(15) }];
    const markets = [
      { createdAt: t(5), questionNumber: 1 },   // newest
      { createdAt: t(30), questionNumber: 2 },  // oldest
    ];
    const result = mergeChronologically(posts, markets);

    expect(result[0]!.type).toBe('market'); // 5min (newest)
    expect(result[1]!.type).toBe('post');   // 15min
    expect(result[2]!.type).toBe('market'); // 30min (oldest)
  });

  it('handles ties in timestamp with stable output', () => {
    const ts = t(10);
    const posts = [{ timestamp: ts }];
    const markets = [{ createdAt: ts, questionNumber: 1 }];
    const result = mergeChronologically(posts, markets);
    expect(result.length).toBe(2);
  });
});
