/**
 * Tests for randomization utilities with seeded RNG support
 */
import { describe, expect, it } from 'bun:test';
import { SeededRandom } from './entropy';
import {
  pickRandom,
  randomChance,
  randomInt,
  sampleRandom,
  shuffleArray,
} from './randomization';

describe('randomization with seeded RNG', () => {
  describe('shuffleArray', () => {
    it('produces deterministic results with seeded RNG', () => {
      const rng1 = new SeededRandom(42);
      const rng2 = new SeededRandom(42);
      const array = [1, 2, 3, 4, 5];

      const result1 = shuffleArray(array, () => rng1.next());
      const result2 = shuffleArray(array, () => rng2.next());

      expect(result1).toEqual(result2);
    });

    it('produces different results with different seeds', () => {
      const rng1 = new SeededRandom(42);
      const rng2 = new SeededRandom(12345);
      const array = [1, 2, 3, 4, 5];

      const result1 = shuffleArray(array, () => rng1.next());
      const result2 = shuffleArray(array, () => rng2.next());

      // With different seeds, results should differ (not a perfect test but very unlikely to match)
      expect(result1).not.toEqual(result2);
    });

    it('does not mutate the original array', () => {
      const rng = new SeededRandom(42);
      const original = [1, 2, 3, 4, 5];
      const originalCopy = [...original];

      shuffleArray(original, () => rng.next());

      expect(original).toEqual(originalCopy);
    });

    it('returns empty array for empty input', () => {
      const rng = new SeededRandom(42);
      const result = shuffleArray([], () => rng.next());
      expect(result).toEqual([]);
    });
  });

  describe('pickRandom', () => {
    it('produces deterministic results with seeded RNG', () => {
      const rng1 = new SeededRandom(42);
      const rng2 = new SeededRandom(42);
      const array = ['a', 'b', 'c', 'd', 'e'];

      const result1 = pickRandom(array, () => rng1.next());
      const result2 = pickRandom(array, () => rng2.next());

      expect(result1).toBe(result2);
    });

    it('returns undefined for empty array', () => {
      const rng = new SeededRandom(42);
      const result = pickRandom([], () => rng.next());
      expect(result).toBeUndefined();
    });

    it('returns the only element for single-element array', () => {
      const rng = new SeededRandom(42);
      const result = pickRandom(['only'], () => rng.next());
      expect(result).toBe('only');
    });
  });

  describe('randomChance', () => {
    it('produces deterministic results with seeded RNG', () => {
      const rng1 = new SeededRandom(42);
      const rng2 = new SeededRandom(42);

      const results1: boolean[] = [];
      const results2: boolean[] = [];

      for (let i = 0; i < 10; i++) {
        results1.push(randomChance(0.5, () => rng1.next()));
        results2.push(randomChance(0.5, () => rng2.next()));
      }

      expect(results1).toEqual(results2);
    });

    it('always returns true for probability 1', () => {
      const rng = new SeededRandom(42);
      for (let i = 0; i < 10; i++) {
        expect(randomChance(1, () => rng.next())).toBe(true);
      }
    });

    it('always returns false for probability 0', () => {
      const rng = new SeededRandom(42);
      for (let i = 0; i < 10; i++) {
        expect(randomChance(0, () => rng.next())).toBe(false);
      }
    });
  });

  describe('randomInt', () => {
    it('produces deterministic results with seeded RNG', () => {
      const rng1 = new SeededRandom(42);
      const rng2 = new SeededRandom(42);

      const results1: number[] = [];
      const results2: number[] = [];

      for (let i = 0; i < 10; i++) {
        results1.push(randomInt(1, 100, () => rng1.next()));
        results2.push(randomInt(1, 100, () => rng2.next()));
      }

      expect(results1).toEqual(results2);
    });

    it('returns values within the specified range', () => {
      const rng = new SeededRandom(42);
      for (let i = 0; i < 100; i++) {
        const result = randomInt(10, 20, () => rng.next());
        expect(result).toBeGreaterThanOrEqual(10);
        expect(result).toBeLessThan(20);
      }
    });
  });

  describe('sampleRandom', () => {
    it('produces deterministic results with seeded RNG', () => {
      const rng1 = new SeededRandom(42);
      const rng2 = new SeededRandom(42);
      const array = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

      const result1 = sampleRandom(array, 3, () => rng1.next());
      const result2 = sampleRandom(array, 3, () => rng2.next());

      expect(result1).toEqual(result2);
    });

    it('returns the requested number of samples', () => {
      const rng = new SeededRandom(42);
      const array = [1, 2, 3, 4, 5];
      const result = sampleRandom(array, 3, () => rng.next());
      expect(result).toHaveLength(3);
    });

    it('returns at most the array length elements', () => {
      const rng = new SeededRandom(42);
      const array = [1, 2, 3];
      const result = sampleRandom(array, 10, () => rng.next());
      expect(result).toHaveLength(3);
    });

    it('returns empty array for empty input', () => {
      const rng = new SeededRandom(42);
      const result = sampleRandom([], 3, () => rng.next());
      expect(result).toEqual([]);
    });
  });
});

describe('randomization with default RNG (Math.random)', () => {
  it('shuffleArray works without RNG parameter', () => {
    const array = [1, 2, 3, 4, 5];
    const result = shuffleArray(array);
    expect(result).toHaveLength(5);
    expect(result.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('pickRandom works without RNG parameter', () => {
    const array = ['a', 'b', 'c'];
    const result = pickRandom(array);
    expect(array).toContain(result);
  });

  it('randomChance works without RNG parameter', () => {
    // Just ensure no errors - result is non-deterministic
    const result = randomChance(0.5);
    expect(typeof result).toBe('boolean');
  });

  it('randomInt works without RNG parameter', () => {
    const result = randomInt(1, 10);
    expect(result).toBeGreaterThanOrEqual(1);
    expect(result).toBeLessThan(10);
  });

  it('sampleRandom works without RNG parameter', () => {
    const array = [1, 2, 3, 4, 5];
    const result = sampleRandom(array, 3);
    expect(result).toHaveLength(3);
  });
});
