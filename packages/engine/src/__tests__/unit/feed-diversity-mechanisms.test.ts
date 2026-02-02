/**
 * Feed Diversity Mechanisms Test Suite
 *
 * Tests for TikTok-inspired feed diversity functions:
 * - shuffleWithNoConsecutive: Shuffles with no consecutive same values
 * - createDiscourseActionDeck: Creates stratified action deck
 * - ActionDiversityTracker: Tracks and prevents consecutive action clustering
 *
 * FIRST Principles:
 * - Fast: Unit tests with no I/O
 * - Isolated: No external dependencies
 * - Repeatable: Deterministic with seeded random
 * - Self-validating: Clear assertions
 * - Timely: Written alongside the feature
 */

import { describe, expect, test } from 'bun:test';

// =============================================================================
// SHUFFLE WITH NO CONSECUTIVE - Import the function for testing
// =============================================================================

/**
 * Fisher-Yates shuffle with constraint: no consecutive same values.
 * This is a copy of the function from post-generation-helpers.ts for testing.
 */
function shuffleWithNoConsecutive<T>(arr: T[], random: () => number): T[] {
  if (arr.length <= 1) return [...arr];

  const result: T[] = [];
  const remaining = [...arr];

  while (remaining.length > 0) {
    const lastItem = result[result.length - 1];

    // Find valid candidates (different from last item, or any if first pick)
    const validIndices: number[] = [];
    for (let i = 0; i < remaining.length; i++) {
      if (result.length === 0 || remaining[i] !== lastItem) {
        validIndices.push(i);
      }
    }

    // If no valid candidates (edge case), fall back to any remaining
    const candidates =
      validIndices.length > 0 ? validIndices : remaining.map((_, idx) => idx);

    // Pick random from candidates
    const pickIdx = candidates[Math.floor(random() * candidates.length)]!;
    result.push(remaining[pickIdx]!);
    remaining.splice(pickIdx, 1);
  }

  return result;
}

/**
 * Creates a stratified action deck with guaranteed ratios.
 */
function createDiscourseActionDeck(
  totalSlots: number,
  quoteRatio: number,
  random: () => number
): Array<'quote' | 'reply'> {
  if (totalSlots <= 0) return [];

  // Clamp quoteRatio to valid [0, 1] range
  const clampedRatio = Math.max(0, Math.min(1, quoteRatio));
  const quoteCount = Math.round(totalSlots * clampedRatio);
  const replyCount = totalSlots - quoteCount;

  const deck: Array<'quote' | 'reply'> = [
    ...Array(quoteCount).fill('quote' as const),
    ...Array(replyCount).fill('reply' as const),
  ];

  return shuffleWithNoConsecutive(deck, random);
}

// =============================================================================
// ACTION DIVERSITY TRACKER - Copy for testing
// =============================================================================

type EngagementActionType = 'like' | 'share' | 'comment';

class ActionDiversityTracker {
  private recentActions: EngagementActionType[] = [];
  private readonly maxRecent: number;
  private readonly maxConsecutive: number;

  constructor(maxRecent = 5, maxConsecutive = 2) {
    this.maxRecent = Math.max(maxRecent, maxConsecutive);
    this.maxConsecutive = Math.max(1, maxConsecutive);
  }

  recordAction(type: EngagementActionType): void {
    this.recentActions.push(type);
    if (this.recentActions.length > this.maxRecent) {
      this.recentActions.shift();
    }
  }

  shouldSkipForDiversity(type: EngagementActionType): boolean {
    const lastN = this.recentActions.slice(-this.maxConsecutive);
    return (
      lastN.length >= this.maxConsecutive && lastN.every((t) => t === type)
    );
  }

  getDistribution(): Record<EngagementActionType, number> {
    const dist: Record<EngagementActionType, number> = {
      like: 0,
      share: 0,
      comment: 0,
    };
    for (const action of this.recentActions) {
      dist[action]++;
    }
    return dist;
  }
}

// =============================================================================
// TESTS: shuffleWithNoConsecutive
// =============================================================================

describe('shuffleWithNoConsecutive', () => {
  // Deterministic random for testing (Mulberry32 PRNG)
  const createSeededRandom = (seed: number) => {
    let t = seed + 0x6d2b79f5;
    return () => {
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  test('returns empty array for empty input', () => {
    const result = shuffleWithNoConsecutive([], Math.random);
    expect(result).toEqual([]);
  });

  test('returns single element for single element input', () => {
    const result = shuffleWithNoConsecutive(['a'], Math.random);
    expect(result).toEqual(['a']);
  });

  test('preserves all elements', () => {
    const random = createSeededRandom(42);
    const input = ['a', 'b', 'c', 'a', 'b', 'c'];
    const result = shuffleWithNoConsecutive(input, random);

    expect(result.length).toBe(input.length);
    expect(result.sort()).toEqual(input.sort());
  });

  test('no consecutive same values when possible', () => {
    // Run multiple times with different seeds to verify constraint holds
    // when the input allows for a valid arrangement
    for (const seed of [1, 2, 3, 4, 5, 100, 200, 300]) {
      const random = createSeededRandom(seed);
      const input = ['a', 'a', 'b', 'b', 'c', 'c'];
      const result = shuffleWithNoConsecutive(input, random);

      // With equal distribution (2 of each), constraint should always be satisfiable
      for (let i = 1; i < result.length; i++) {
        expect(result[i]).not.toBe(result[i - 1]);
      }
    }
  });

  test('handles impossible case gracefully (all same values)', () => {
    const random = createSeededRandom(42);
    const input = ['a', 'a', 'a', 'a'];
    const result = shuffleWithNoConsecutive(input, random);

    // Should return all elements even when constraint can't be satisfied
    expect(result.length).toBe(4);
    expect(result.every((x) => x === 'a')).toBe(true);
  });

  test('handles edge case with majority of one type', () => {
    const random = createSeededRandom(42);
    // 4 'a' and 2 'b' - impossible to fully satisfy constraint
    const input = ['a', 'a', 'a', 'a', 'b', 'b'];
    const result = shuffleWithNoConsecutive(input, random);

    // Should preserve all elements
    expect(result.length).toBe(6);
    expect(result.filter((x) => x === 'a').length).toBe(4);
    expect(result.filter((x) => x === 'b').length).toBe(2);
  });

  test('deterministic with same seed', () => {
    const input = ['quote', 'quote', 'reply', 'reply', 'reply'];

    const result1 = shuffleWithNoConsecutive(input, createSeededRandom(123));
    const result2 = shuffleWithNoConsecutive(input, createSeededRandom(123));

    expect(result1).toEqual(result2);
  });
});

// =============================================================================
// TESTS: createDiscourseActionDeck
// =============================================================================

describe('createDiscourseActionDeck', () => {
  // Deterministic random for testing (Mulberry32 PRNG)
  const createSeededRandom = (seed: number) => {
    let t = seed + 0x6d2b79f5;
    return () => {
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  test('returns empty array for zero slots', () => {
    const result = createDiscourseActionDeck(0, 0.3, Math.random);
    expect(result).toEqual([]);
  });

  test('returns empty array for negative slots', () => {
    const result = createDiscourseActionDeck(-5, 0.3, Math.random);
    expect(result).toEqual([]);
  });

  test('creates correct ratio of quotes to replies', () => {
    const random = createSeededRandom(42);
    const result = createDiscourseActionDeck(10, 0.3, random);

    const quotes = result.filter((a) => a === 'quote').length;
    const replies = result.filter((a) => a === 'reply').length;

    // 10 * 0.3 = 3 quotes, 7 replies
    expect(quotes).toBe(3);
    expect(replies).toBe(7);
    expect(result.length).toBe(10);
  });

  test('clamps ratio to 0 for negative values', () => {
    const random = createSeededRandom(42);
    const result = createDiscourseActionDeck(10, -0.5, random);

    const quotes = result.filter((a) => a === 'quote').length;
    expect(quotes).toBe(0);
    expect(result.length).toBe(10);
  });

  test('clamps ratio to 1 for values > 1', () => {
    const random = createSeededRandom(42);
    const result = createDiscourseActionDeck(10, 1.5, random);

    const quotes = result.filter((a) => a === 'quote').length;
    expect(quotes).toBe(10);
    expect(result.length).toBe(10);
  });

  test('maintains no-consecutive constraint when possible', () => {
    const random = createSeededRandom(42);
    // 50% ratio should easily satisfy constraint
    const result = createDiscourseActionDeck(10, 0.5, random);

    for (let i = 1; i < result.length; i++) {
      expect(result[i]).not.toBe(result[i - 1]);
    }
  });

  test('handles 0% quote ratio', () => {
    const random = createSeededRandom(42);
    const result = createDiscourseActionDeck(5, 0, random);

    expect(result.every((a) => a === 'reply')).toBe(true);
    expect(result.length).toBe(5);
  });

  test('handles 100% quote ratio', () => {
    const random = createSeededRandom(42);
    const result = createDiscourseActionDeck(5, 1, random);

    expect(result.every((a) => a === 'quote')).toBe(true);
    expect(result.length).toBe(5);
  });
});

// =============================================================================
// TESTS: ActionDiversityTracker
// =============================================================================

describe('ActionDiversityTracker', () => {
  test('initial state allows any action', () => {
    const tracker = new ActionDiversityTracker(5, 2);

    expect(tracker.shouldSkipForDiversity('like')).toBe(false);
    expect(tracker.shouldSkipForDiversity('share')).toBe(false);
    expect(tracker.shouldSkipForDiversity('comment')).toBe(false);
  });

  test('allows action after recording one of the same type', () => {
    const tracker = new ActionDiversityTracker(5, 2);

    tracker.recordAction('like');
    // Only 1 consecutive like, maxConsecutive is 2, so still allowed
    expect(tracker.shouldSkipForDiversity('like')).toBe(false);
  });

  test('skips action after maxConsecutive of same type', () => {
    const tracker = new ActionDiversityTracker(5, 2);

    tracker.recordAction('like');
    tracker.recordAction('like');
    // Now 2 consecutive likes, should skip
    expect(tracker.shouldSkipForDiversity('like')).toBe(true);
  });

  test('allows action after different action breaks streak', () => {
    const tracker = new ActionDiversityTracker(5, 2);

    tracker.recordAction('like');
    tracker.recordAction('like');
    tracker.recordAction('share'); // Breaks the streak
    // Now last 2 are [like, share], like is allowed again
    expect(tracker.shouldSkipForDiversity('like')).toBe(false);
  });

  test('tracks distribution correctly', () => {
    const tracker = new ActionDiversityTracker(10, 2);

    tracker.recordAction('like');
    tracker.recordAction('share');
    tracker.recordAction('comment');
    tracker.recordAction('like');
    tracker.recordAction('share');

    const dist = tracker.getDistribution();
    expect(dist.like).toBe(2);
    expect(dist.share).toBe(2);
    expect(dist.comment).toBe(1);
  });

  test('buffer size respects maxRecent limit', () => {
    const tracker = new ActionDiversityTracker(3, 2);

    tracker.recordAction('like');
    tracker.recordAction('share');
    tracker.recordAction('comment');
    tracker.recordAction('like'); // Oldest (first like) should be dropped

    const dist = tracker.getDistribution();
    expect(dist.like).toBe(1);
    expect(dist.share).toBe(1);
    expect(dist.comment).toBe(1);
  });

  test('buffer size is at least maxConsecutive', () => {
    // maxRecent (2) < maxConsecutive (5), should adjust
    const tracker = new ActionDiversityTracker(2, 5);

    // Record 5 likes
    for (let i = 0; i < 5; i++) {
      tracker.recordAction('like');
    }

    // Should track all 5 and detect consecutive
    expect(tracker.shouldSkipForDiversity('like')).toBe(true);
  });

  test('maxConsecutive of 1 means never allow consecutive', () => {
    const tracker = new ActionDiversityTracker(5, 1);

    tracker.recordAction('like');
    expect(tracker.shouldSkipForDiversity('like')).toBe(true);
    expect(tracker.shouldSkipForDiversity('share')).toBe(false);
  });
});
