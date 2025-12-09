/**
 * Entropy - Cryptographically-Secure Randomization
 *
 * Use for game-critical fairness requirements:
 * - Fair random selection of winners/losers
 * - Event cooldowns and probability-based triggers
 * - Weighted picks for market/game mechanics
 * - Seeded PRNG for reproducible testing
 *
 * For simple shuffling/variety in prompts, use `randomization.ts` instead.
 */

import { randomBytes } from 'crypto';

// =============================================================================
// Core Random
// =============================================================================

/** Cryptographically secure random [0, 1) */
export const secureRandom = (): number =>
  randomBytes(4).readUInt32BE(0) / 0xffffffff;

/** Secure random integer [min, max] inclusive */
export const secureRandomInt = (min: number, max: number): number =>
  Math.floor(secureRandom() * (max - min + 1)) + min;

/** Secure Fisher-Yates shuffle */
export function secureShuffle<T>(array: readonly T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = secureRandomInt(0, i);
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

/** Pick N random items */
export const securePickN = <T>(array: readonly T[], n: number): T[] =>
  n >= array.length ? secureShuffle(array) : secureShuffle(array).slice(0, n);

/** Bell-curve biased count */
export const biasedRandomCount = (min: number, max: number): number =>
  Math.floor(((secureRandom() + secureRandom()) / 2) * (max - min + 1)) + min;

// =============================================================================
// Weighted Selection
// =============================================================================

/** Weighted random pick */
export function weightedPick<T>(items: T[], weight: (item: T) => number): T {
  if (items.length === 0) throw new Error('Empty array');
  if (items.length === 1) return items[0]!;

  const weights = items.map(weight);
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return items[secureRandomInt(0, items.length - 1)]!;

  let r = secureRandom() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

/** Weight by resolution urgency (higher = closer to resolution) */
export const urgencyWeight = (multiplier = 5) => {
  const now = Date.now();
  return <T extends { resolutionDate?: Date | string | null }>(q: T): number => {
    const rd = q.resolutionDate;
    if (!rd) return 1;
    const hours = (new Date(rd).getTime() - now) / 3600000;
    const urgency = hours < 1 ? 1 : hours < 6 ? 0.8 : hours < 24 ? 0.6 : hours < 72 ? 0.4 : 0.2;
    return 1 + urgency * multiplier;
  };
};

// =============================================================================
// Event Cooldowns
// =============================================================================

export interface EventCooldownState {
  lastOccurrence: number;
  minCooldown: number;
  baseProbability: number;
  decayRate: number;
  maxProbability: number;
}

/** Check if event should fire (mutates lastOccurrence on true) */
export function shouldFireEvent(state: EventCooldownState, now: number): boolean {
  const elapsed = now - state.lastOccurrence;
  if (elapsed < state.minCooldown) return false;

  const prob = Math.min(
    state.maxProbability,
    state.baseProbability + (elapsed - state.minCooldown) * state.decayRate
  );

  if (secureRandom() < prob) {
    state.lastOccurrence = now;
    return true;
  }
  return false;
}

// =============================================================================
// Sentiment
// =============================================================================

/** Generate noisy sentiment signal (-1 to 1) */
export const generateSentimentSignal = (positive: boolean, strength: number, noise = 0.2): number =>
  Math.max(-1, Math.min(1, (positive ? strength : -strength) + (secureRandom() - 0.5) * 2 * noise));

// =============================================================================
// Seeded PRNG (testing)
// =============================================================================

/** Reproducible xorshift128+ PRNG */
export class SeededRandom {
  private s: [number, number];

  constructor(seed: number | string) {
    const n = typeof seed === 'string' ? seed.split('').reduce((a, c) => a + c.charCodeAt(0), 0) : seed;
    this.s = [n ^ 0xdeadbeef, n ^ 0x12345678];
  }

  next(): number {
    let s1 = this.s[0]!;
    const s0 = this.s[1]!;
    this.s[0] = s0;
    s1 ^= s1 << 23;
    s1 ^= s1 >>> 17;
    s1 ^= s0;
    s1 ^= s0 >>> 26;
    this.s[1] = s1;
    return ((this.s[0]! + this.s[1]!) >>> 0) / 0xffffffff;
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  nextFloat(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.nextInt(0, arr.length - 1)]!;
  }

  shuffle<T>(arr: readonly T[]): T[] {
    const r = [...arr];
    for (let i = r.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      [r[i], r[j]] = [r[j]!, r[i]!];
    }
    return r;
  }
}
