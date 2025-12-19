/**
 * Tests for Causal Simulation Engine
 *
 * Verifies that:
 * 1. BenchmarkDataGenerator creates hidden narrative facts in causal mode
 * 2. Causal events are scheduled with proper timing
 * 3. MarketMoverAgent generates price adjustments based on events
 * 4. GameWorld generates events from causal context
 */

import { describe, expect, test } from 'bun:test';
import type { WorldEvent } from '@babylon/shared';
import {
  type BenchmarkConfig,
  BenchmarkDataGenerator,
  SeededRandom,
} from '@babylon/training';
import { MarketMoverAgent } from '../services/market-mover-agent';

describe('BenchmarkDataGenerator - Causal Simulation', () => {
  test('generates hidden narrative facts when causal mode is enabled', async () => {
    const config: BenchmarkConfig = {
      durationMinutes: 30 * 24 * 60, // 30 days
      tickInterval: 3600, // 1 hour per tick
      numPredictionMarkets: 5,
      numPerpetualMarkets: 5,
      numAgents: 10,
      seed: 12345,
      useCausalSimulation: true,
    };

    const generator = new BenchmarkDataGenerator(config);
    const snapshot = await generator.generate();

    // Should have hidden narrative facts
    expect(snapshot.groundTruth.hiddenNarrativeFacts).toBeDefined();
    expect(snapshot.groundTruth.hiddenNarrativeFacts!.length).toBeGreaterThan(
      0
    );

    // Each fact should have required properties
    const fact = snapshot.groundTruth.hiddenNarrativeFacts![0]!;
    expect(fact.id).toBeDefined();
    expect(fact.fact).toBeDefined();
    expect(fact.affectsTickers).toBeDefined();
    expect(fact.affectsTickers.length).toBeGreaterThan(0);
    expect(fact.eventSchedule).toBeDefined();
    expect(fact.eventSchedule.length).toBeGreaterThan(0);
    expect(fact.sentiment).toMatch(/^(positive|negative)$/);
  });

  test('generates causal events with timing and price changes', async () => {
    const config: BenchmarkConfig = {
      durationMinutes: 30 * 24 * 60,
      tickInterval: 3600,
      numPredictionMarkets: 5,
      numPerpetualMarkets: 5,
      numAgents: 10,
      seed: 12345,
      useCausalSimulation: true,
    };

    const generator = new BenchmarkDataGenerator(config);
    const snapshot = await generator.generate();

    // Should have causal events
    expect(snapshot.groundTruth.causalEvents).toBeDefined();
    expect(snapshot.groundTruth.causalEvents!.length).toBeGreaterThan(0);

    // Each causal event should have required properties
    const event = snapshot.groundTruth.causalEvents![0]!;
    expect(event.tick).toBeDefined();
    expect(event.day).toBeGreaterThan(0);
    expect(event.hour).toBeGreaterThanOrEqual(0);
    expect(event.hour).toBeLessThan(24);
    expect(event.eventType).toBeDefined();
    expect(event.description).toBeDefined();
    expect(event.affectedTickers.length).toBeGreaterThan(0);
    expect(event.priceChanges).toBeDefined();

    // Price changes should be within volatility bucket ranges
    for (const [_ticker, change] of Object.entries(event.priceChanges)) {
      const absChange = Math.abs(change);
      // Should be within one of the bucket ranges (2-4%, 5-10%, 15-25%)
      expect(absChange).toBeGreaterThanOrEqual(0.02);
      expect(absChange).toBeLessThanOrEqual(0.25);
    }
  });

  test('does not generate random walk prices in causal mode', async () => {
    const config: BenchmarkConfig = {
      durationMinutes: 30 * 24 * 60,
      tickInterval: 3600,
      numPredictionMarkets: 5,
      numPerpetualMarkets: 5,
      numAgents: 10,
      seed: 12345,
      useCausalSimulation: true,
    };

    const generator = new BenchmarkDataGenerator(config);
    const snapshot = await generator.generate();

    // In causal mode, prices should only change when events occur
    // Check that prices are not constantly changing (random walk)
    for (const [_ticker, history] of Object.entries(
      snapshot.groundTruth.priceHistory
    )) {
      // Find runs of constant prices
      let constantRuns = 0;
      let lastPrice = history[0]?.price ?? 0;

      for (let i = 1; i < history.length; i++) {
        if (history[i]!.price === lastPrice) {
          constantRuns++;
        }
        lastPrice = history[i]!.price;
      }

      // In causal mode, most prices should be constant (only changing at events)
      // Expect at least 90% constant prices
      expect(constantRuns / history.length).toBeGreaterThan(0.9);
    }
  });

  test('is reproducible with same seed', async () => {
    const config: BenchmarkConfig = {
      durationMinutes: 30 * 24 * 60,
      tickInterval: 3600,
      numPredictionMarkets: 5,
      numPerpetualMarkets: 5,
      numAgents: 10,
      seed: 12345,
      useCausalSimulation: true,
    };

    const generator1 = new BenchmarkDataGenerator(config);
    const snapshot1 = await generator1.generate();

    const generator2 = new BenchmarkDataGenerator(config);
    const snapshot2 = await generator2.generate();

    // Same seed should produce same hidden facts
    expect(snapshot1.groundTruth.hiddenNarrativeFacts![0]!.fact).toBe(
      snapshot2.groundTruth.hiddenNarrativeFacts![0]!.fact
    );

    // Same seed should produce same causal events
    expect(snapshot1.groundTruth.causalEvents!.length).toBe(
      snapshot2.groundTruth.causalEvents!.length
    );

    // Same seed should produce same price changes
    const event1 = snapshot1.groundTruth.causalEvents![0]!;
    const event2 = snapshot2.groundTruth.causalEvents![0]!;
    expect(event1.priceChanges).toEqual(event2.priceChanges);
  });
});

describe('MarketMoverAgent', () => {
  test('generates price adjustments for events with affected tickers', async () => {
    const seed = 12345;
    const agent = new MarketMoverAgent(seed);

    const currentPrices = new Map([
      ['TSLA', 450],
      ['BTCAI', 120000],
      ['ETHAI', 4000],
    ]);

    const events: WorldEvent[] = [
      {
        id: 'test-event-1',
        day: 5,
        type: 'leak',
        visibility: 'public',
        description: 'Internal documents leaked: TSLA battery flaw discovered',
        actors: ['insider-1'],
        sentimentSignal: -0.6,
      },
    ];

    const adjustments = await agent.generatePriceAdjustments(
      currentPrices,
      events,
      { affectedTickers: ['TSLA'] }
    );

    // Should have adjustment for TSLA
    expect(adjustments.has('TSLA')).toBe(true);

    // Adjustment should be negative (leak is negative event)
    const tslaAdjustment = adjustments.get('TSLA')!;
    expect(tslaAdjustment).toBeLessThan(0);

    // Should be within medium bucket range (-5% to -10%)
    expect(Math.abs(tslaAdjustment)).toBeGreaterThanOrEqual(0.05);
    expect(Math.abs(tslaAdjustment)).toBeLessThanOrEqual(0.1);
  });

  test('generates no adjustments for events without affected tickers', async () => {
    const seed = 12345;
    const agent = new MarketMoverAgent(seed);

    const currentPrices = new Map([
      ['TSLA', 450],
      ['BTCAI', 120000],
    ]);

    const events: WorldEvent[] = [
      {
        id: 'test-event-1',
        day: 5,
        type: 'leak',
        visibility: 'public',
        description: 'Some generic event without ticker mention',
        actors: ['insider-1'],
      },
    ];

    const adjustments = await agent.generatePriceAdjustments(
      currentPrices,
      events
    );

    // Should have no adjustments (no tickers mentioned)
    expect(adjustments.size).toBe(0);
  });

  test('applies price adjustments correctly', async () => {
    const seed = 12345;
    const agent = new MarketMoverAgent(seed);

    const currentPrices = new Map([
      ['TSLA', 450],
      ['BTCAI', 120000],
    ]);

    const initialPrices = new Map([
      ['TSLA', 450],
      ['BTCAI', 120000],
    ]);

    const adjustments = new Map([
      ['TSLA', -0.05], // -5%
    ]);

    const newPrices = agent.applyAdjustments(
      currentPrices,
      adjustments,
      initialPrices
    );

    // TSLA should be 95% of original
    expect(newPrices.get('TSLA')).toBeCloseTo(450 * 0.95);

    // BTCAI should be unchanged
    expect(newPrices.get('BTCAI')).toBe(120000);
  });

  test('respects price bounds', async () => {
    const seed = 12345;
    const agent = new MarketMoverAgent(seed, undefined, {
      minPriceFloor: 0.1, // 10% of initial
      maxPriceCeiling: 4.0, // 400% of initial
    });

    const currentPrices = new Map([['TSLA', 50]]);
    const initialPrices = new Map([['TSLA', 450]]);

    // Try to push price to 0 (massive adjustment)
    const adjustments = new Map([['TSLA', -0.99]]);

    const newPrices = agent.applyAdjustments(
      currentPrices,
      adjustments,
      initialPrices
    );

    // Should be clamped to 10% of initial price
    expect(newPrices.get('TSLA')).toBe(45); // 450 * 0.10
  });

  test('is reproducible with same seed', async () => {
    const seed = 12345;
    const agent1 = new MarketMoverAgent(seed);
    const agent2 = new MarketMoverAgent(seed);

    const currentPrices = new Map([['TSLA', 450]]);

    const events: WorldEvent[] = [
      {
        id: 'test-event-1',
        day: 5,
        type: 'leak',
        visibility: 'public',
        description: 'TSLA leak event',
        actors: ['insider-1'],
      },
    ];

    const adjustments1 = await agent1.generatePriceAdjustments(
      currentPrices,
      events,
      { affectedTickers: ['TSLA'] }
    );

    const adjustments2 = await agent2.generatePriceAdjustments(
      currentPrices,
      events,
      { affectedTickers: ['TSLA'] }
    );

    // Same seed should produce same adjustments
    expect(adjustments1.get('TSLA')).toBe(adjustments2.get('TSLA'));
  });
});

describe('SeededRandom', () => {
  test('produces reproducible sequence', () => {
    const rng1 = new SeededRandom(12345);
    const rng2 = new SeededRandom(12345);

    const sequence1 = [rng1.next(), rng1.next(), rng1.next()];
    const sequence2 = [rng2.next(), rng2.next(), rng2.next()];

    expect(sequence1).toEqual(sequence2);
  });

  test('nextInt returns values in range', () => {
    const rng = new SeededRandom(12345);

    for (let i = 0; i < 100; i++) {
      const value = rng.nextInt(5, 10);
      expect(value).toBeGreaterThanOrEqual(5);
      expect(value).toBeLessThanOrEqual(10);
    }
  });

  test('nextFloat returns values in range', () => {
    const rng = new SeededRandom(12345);

    for (let i = 0; i < 100; i++) {
      const value = rng.nextFloat(0.5, 1.5);
      expect(value).toBeGreaterThanOrEqual(0.5);
      expect(value).toBeLessThanOrEqual(1.5);
    }
  });
});
