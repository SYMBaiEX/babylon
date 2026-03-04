/**
 * Unit Tests: Narrative Feed Algorithms
 *
 * Tests the two pure functions that determine how posts are ordered in the
 * Stories and Latest feeds:
 *   - flattenStories()      — burst interleaving for the Stories tab
 *   - mergeChronologically() — timestamp merge for the Latest tab
 *
 * Both functions are exported from apps/web/src/app/feed/utils/feedAlgorithms.ts
 * so this file imports the real implementation rather than a copy.
 *
 * Run with: bun test unit/narrative-feed-algorithms.test.ts
 */

import { describe, expect, it } from 'bun:test';
import type { NarrativePost, NarrativeStory } from '@babylon/shared';

// Import the real implementations (not copies)
import {
  BURST_LEAD,
  BURST_SIZE,
  flattenStories,
  mergeChronologically,
} from '../../../apps/web/src/app/feed/utils/feedAlgorithms';

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
    posts: Array.from({ length: postCount }, (_, i) =>
      makePost(`${key}-p${i}`)
    ),
    hasUserPosition: false,
    ...opts,
  };
}

// ─── flattenStories tests ─────────────────────────────────────────────────────

describe('flattenStories', () => {
  it('returns empty array for empty input', () => {
    expect(flattenStories([])).toEqual([]);
  });

  it('returns empty for a story with no posts and no isNewMarket', () => {
    const story = makeStory('A', 0);
    expect(flattenStories([story])).toEqual([]);
  });

  it('emits all posts from a single story in original order', () => {
    const story = makeStory('A', 5);
    const items = flattenStories([story]);
    expect(items.length).toBe(5);
    expect(items.every((i) => i.type === 'post')).toBe(true);
    items.forEach((item, idx) => {
      if (item.type === 'post') expect(item.post.id).toBe(`A-p${idx}`);
    });
  });

  it('gives top story BURST_LEAD posts before rotating', () => {
    const storyA = makeStory('A', 10);
    const storyB = makeStory('B', 10);
    const items = flattenStories([storyA, storyB]);

    const firstBatch = items.slice(0, BURST_LEAD);
    expect(
      firstBatch.every((i) => i.type === 'post' && i.key.startsWith('A:'))
    ).toBe(true);

    const secondBatch = items.slice(BURST_LEAD, BURST_LEAD + BURST_SIZE);
    expect(
      secondBatch.every((i) => i.type === 'post' && i.key.startsWith('B:'))
    ).toBe(true);
  });

  it('interleaves posts from three stories', () => {
    const items = flattenStories([
      makeStory('A', 6),
      makeStory('B', 6),
      makeStory('C', 6),
    ]);

    expect(items.length).toBe(18);
    expect(items.filter((i) => i.key.startsWith('A:')).length).toBe(6);
    expect(items.filter((i) => i.key.startsWith('B:')).length).toBe(6);
    expect(items.filter((i) => i.key.startsWith('C:')).length).toBe(6);
  });

  it('injects market card after post rotation, not before', () => {
    const market = makeStory('market:1', 0, {
      isNewMarket: true,
      storyKey: 'market:1',
    });
    const posts = makeStory('posts', 4);
    // market has score ~1.0 (new), but should appear AFTER the first post burst
    const items = flattenStories([market, posts]);

    // First item must be a post (market card deferred to after first rotation)
    expect(items[0]!.type).toBe('post');

    const marketItems = items.filter((i) => i.type === 'market');
    expect(marketItems.length).toBe(1);
    expect(
      marketItems[0]!.type === 'market' && marketItems[0].story.storyKey
    ).toBe('market:1');
  });

  it('does not emit the same market card twice', () => {
    const market = makeStory('market:1', 0, {
      isNewMarket: true,
      storyKey: 'market:1',
    });
    expect(
      flattenStories([market]).filter((i) => i.type === 'market').length
    ).toBe(1);
  });

  it('handles stories with unequal post counts', () => {
    const long = makeStory('long', 10);
    const short = makeStory('short', 1);
    const items = flattenStories([long, short]);

    expect(items.length).toBe(11);
    expect(items.filter((i) => i.key.startsWith('short:')).length).toBe(1);
    expect(items.filter((i) => i.key.startsWith('long:')).length).toBe(10);
  });
});

// ─── mergeChronologically tests ───────────────────────────────────────────────

describe('mergeChronologically', () => {
  const t = (offsetMinutes: number) =>
    new Date(Date.now() - offsetMinutes * 60 * 1000).toISOString();

  const post = (timestamp: string) => ({
    id: 'p',
    content: '',
    author: 'u',
    authorId: 'u',
    authorName: 'User',
    timestamp,
    likeCount: 0,
    commentCount: 0,
    shareCount: 0,
    isLiked: false,
    isShared: false,
  });

  const market = (createdAt: string) => ({
    questionNumber: 1,
    text: 'Q',
    resolutionDate: t(0),
    createdAt,
    arcState: null,
    marketId: null,
    yesShares: 0,
    noShares: 0,
  });

  it('returns empty array for empty inputs', () => {
    expect(mergeChronologically([], [])).toEqual([]);
  });

  it('returns posts unchanged when markets is empty', () => {
    const result = mergeChronologically([post(t(5)), post(t(10))], []);
    expect(result.length).toBe(2);
    expect(result.every((i) => i.type === 'post')).toBe(true);
  });

  it('returns market items when posts is empty', () => {
    const result = mergeChronologically([], [market(t(3))]);
    expect(result.length).toBe(1);
    expect(result[0]!.type).toBe('market');
  });

  it('sorts newest-first', () => {
    const result = mergeChronologically(
      [post(t(30)), post(t(10))],
      [market(t(20))]
    );
    expect(result[0]!.type).toBe('post'); // 10min
    expect(result[1]!.type).toBe('market'); // 20min
    expect(result[2]!.type).toBe('post'); // 30min
  });

  it('places market card at correct chronological position between posts', () => {
    const result = mergeChronologically(
      [post(t(5)), post(t(35))],
      [market(t(20))]
    );
    expect(result[0]!.type).toBe('post'); // 5min
    expect(result[1]!.type).toBe('market'); // 20min
    expect(result[2]!.type).toBe('post'); // 35min
  });

  it('handles multiple market cards', () => {
    const m1 = { ...market(t(5)), questionNumber: 1 };
    const m2 = { ...market(t(30)), questionNumber: 2 };
    const result = mergeChronologically([post(t(15))], [m1, m2]);

    expect(result[0]!.type).toBe('market'); // 5min
    expect(result[1]!.type).toBe('post'); // 15min
    expect(result[2]!.type).toBe('market'); // 30min
  });

  it('handles timestamp ties without throwing', () => {
    const ts = t(10);
    const result = mergeChronologically([post(ts)], [market(ts)]);
    expect(result.length).toBe(2);
  });
});
