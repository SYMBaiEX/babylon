/**
 * Event Market Pipeline Test Suite
 *
 * Tests for applying narrative events to market prices:
 * - Price modifier calculation with decay
 * - Bounds validation
 * - Sentiment-based volatility
 */

import { describe, expect, test } from 'bun:test';
import type { PriceModifier } from '@babylon/db';
import { calculateCurrentPrice } from '../services/event-market-pipeline';

describe('Event Market Pipeline - Price Calculation', () => {
  test('returns base price with no modifiers', () => {
    const price = calculateCurrentPrice(100, 0, []);
    // Small variance from sentiment volatility, but close to base
    expect(price).toBeGreaterThan(98);
    expect(price).toBeLessThan(102);
  });

  test('applies positive modifier (price increase)', () => {
    const now = new Date();
    const modifier: PriceModifier = {
      eventId: 'test-event',
      effect: 1.1, // 10% increase
      decayRate: 0.1,
      appliedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    };

    const price = calculateCurrentPrice(100, 0, [modifier]);
    // Should be around 110 (10% increase) with some variance
    expect(price).toBeGreaterThan(105);
    expect(price).toBeLessThan(115);
  });

  test('applies negative modifier (price decrease)', () => {
    const now = new Date();
    const modifier: PriceModifier = {
      eventId: 'test-event',
      effect: 0.9, // 10% decrease
      decayRate: 0.1,
      appliedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    };

    const price = calculateCurrentPrice(100, 0, [modifier]);
    // Should be around 90 (10% decrease) with some variance
    expect(price).toBeGreaterThan(85);
    expect(price).toBeLessThan(95);
  });

  test('skips expired modifiers', () => {
    const now = new Date();
    const expiredModifier: PriceModifier = {
      eventId: 'old-event',
      effect: 2.0, // Would double price if applied
      decayRate: 0.1,
      appliedAt: new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString(),
      expiresAt: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(), // Expired yesterday
    };

    const price = calculateCurrentPrice(100, 0, [expiredModifier]);
    // Should be close to base price since modifier is expired
    expect(price).toBeGreaterThan(98);
    expect(price).toBeLessThan(102);
  });

  test('applies multiple modifiers cumulatively', () => {
    const now = new Date();
    const modifiers: PriceModifier[] = [
      {
        eventId: 'event-1',
        effect: 1.1, // 10% increase
        decayRate: 0.1,
        appliedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        eventId: 'event-2',
        effect: 1.05, // 5% increase
        decayRate: 0.1,
        appliedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      },
    ];

    const price = calculateCurrentPrice(100, 0, modifiers);
    // Should be around 115.5 (1.1 * 1.05 = 1.155) with some variance
    expect(price).toBeGreaterThan(110);
    expect(price).toBeLessThan(120);
  });

  test('modifier effect decays over time', () => {
    // Use a fixed reference point in the past to eliminate timing variance.
    // Both modifiers will be evaluated at a consistent "now" when appliedAt is
    // far enough in the past that millisecond-level test timing is irrelevant.
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000);
    const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);

    const recentModifier: PriceModifier = {
      eventId: 'recent-event',
      effect: 1.2, // 20% increase
      decayRate: 0.5, // 50% decay per hour
      appliedAt: oneHourAgo.toISOString(), // 1 hour ago: decayed ~60.6%
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    };

    const oldModifier: PriceModifier = {
      eventId: 'old-event',
      effect: 1.2, // 20% increase
      decayRate: 0.5, // 50% decay per hour
      appliedAt: threeHoursAgo.toISOString(), // 3 hours ago: decayed ~77.7%
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    };

    const priceRecent = calculateCurrentPrice(100, 0, [recentModifier]);
    const priceOld = calculateCurrentPrice(100, 0, [oldModifier]);

    // Old modifier should have less impact due to decay
    // recentModifier (1 hour): decayedEffect ≈ 1 + 0.2 * exp(-0.5) ≈ 1.121
    // oldModifier (3 hours): decayedEffect ≈ 1 + 0.2 * exp(-1.5) ≈ 1.045
    expect(priceRecent).toBeGreaterThan(priceOld);
  });

  test('bounds effect to prevent extreme values', () => {
    const now = new Date();
    const extremeModifier: PriceModifier = {
      eventId: 'extreme-event',
      effect: 1000, // Extreme value that should be bounded
      decayRate: 0,
      appliedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    };

    const price = calculateCurrentPrice(100, 0, [extremeModifier]);
    // MAX_PRICE_MULTIPLIER is 100, so max price should be 10000
    expect(price).toBeLessThanOrEqual(10000);
  });

  test('enforces minimum price bound', () => {
    const now = new Date();
    const extremeNegativeModifier: PriceModifier = {
      eventId: 'crash-event',
      effect: 0.001, // Would make price nearly 0
      decayRate: 0,
      appliedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    };

    const price = calculateCurrentPrice(100, 0, [extremeNegativeModifier]);
    // MIN_PRICE_MULTIPLIER is 0.01, so min price should be 1
    expect(price).toBeGreaterThanOrEqual(1);
  });

  test('sentiment affects volatility', () => {
    // High sentiment should create more variance
    // Use a large sample count for statistical stability and determinism
    const pricesHighSentiment: number[] = [];
    const pricesLowSentiment: number[] = [];
    const sampleCount = 1000;

    for (let i = 0; i < sampleCount; i++) {
      pricesHighSentiment.push(calculateCurrentPrice(100, 100, [])); // Max sentiment
      pricesLowSentiment.push(calculateCurrentPrice(100, 0, [])); // Zero sentiment
    }

    // Calculate variance for each set
    const varianceHigh = calculateVariance(pricesHighSentiment);
    const varianceLow = calculateVariance(pricesLowSentiment);

    // Both variances should be valid numbers
    expect(varianceHigh).toBeDefined();
    expect(typeof varianceHigh).toBe('number');
    expect(varianceLow).toBeDefined();
    expect(typeof varianceLow).toBe('number');

    // High sentiment (100) should produce more volatility than zero sentiment (0)
    // With zero sentiment, volatility = 0, so prices should be nearly identical (variance ≈ 0)
    // With max sentiment, volatility = 0.02 (2%), so there should be measurable variance
    // Assert varianceHigh is strictly greater than varianceLow by a small epsilon
    // With 1000 samples, high sentiment variance should exceed low sentiment variance + epsilon
    const epsilon = 1e-6;
    expect(varianceHigh).toBeGreaterThan(varianceLow + epsilon);
  });
});

/**
 * Helper function to calculate variance
 */
function calculateVariance(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
  return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
}
