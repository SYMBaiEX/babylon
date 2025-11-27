/**
 * Tests for RULER Benchmark Integration
 */

import { beforeAll, describe, expect, it } from 'bun:test';
import {
  type BenchmarkConfig,
  BenchmarkDataGenerator,
} from '../BenchmarkDataGenerator';
import {
  createRulerContext,
  extractMarketOutcomesFromBenchmark,
  getHiddenEventsForTick,
  getHiddenFactsForTick,
  getTrueFacts,
  scoreActionAgainstGroundTruth,
  wasDecisionOptimal,
} from '../RulerBenchmarkIntegration';

describe('RulerBenchmarkIntegration', () => {
  let snapshot: ReturnType<
    typeof BenchmarkDataGenerator.prototype.generate
  > extends Promise<infer T>
    ? T
    : never;

  beforeAll(async () => {
    const config: BenchmarkConfig = {
      durationMinutes: 5,
      tickInterval: 10,
      numPredictionMarkets: 3,
      numPerpetualMarkets: 2,
      numAgents: 3,
      seed: 12345,
    };

    const generator = new BenchmarkDataGenerator(config);
    snapshot = await generator.generate();
  });

  it('should extract market outcomes from benchmark', () => {
    const outcomes = extractMarketOutcomesFromBenchmark(snapshot);

    expect(outcomes.predictions.length).toBeGreaterThan(0);
    expect(outcomes.stocks.length).toBeGreaterThan(0);
    expect(outcomes.predictions[0]).toHaveProperty('marketId');
    expect(outcomes.predictions[0]).toHaveProperty('outcome');
    expect(outcomes.stocks[0]).toHaveProperty('ticker');
    expect(outcomes.stocks[0]).toHaveProperty('changePercent');
  });

  it('should get hidden facts for tick', () => {
    const facts = getHiddenFactsForTick(snapshot, 0);

    expect(Array.isArray(facts)).toBe(true);
    if (facts.length > 0) {
      expect(facts[0]).toHaveProperty('fact');
      expect(facts[0]).toHaveProperty('category');
      expect(facts[0]).toHaveProperty('tick');
    }
  });

  it('should get hidden events for tick', () => {
    const events = getHiddenEventsForTick(snapshot, 0);

    expect(Array.isArray(events)).toBe(true);
    if (events.length > 0) {
      expect(events[0]).toHaveProperty('type');
      expect(events[0]).toHaveProperty('description');
      expect(events[0]).toHaveProperty('tick');
    }
  });

  it('should check if decision was optimal', () => {
    const optimalActions = snapshot.groundTruth.optimalActions;
    if (optimalActions.length > 0) {
      const action = optimalActions[0]!;
      const wasOptimal = wasDecisionOptimal(
        snapshot,
        action.tick,
        action.type,
        action.target
      );

      expect(typeof wasOptimal).toBe('boolean');
    }
  });

  it('should get true facts', () => {
    const facts = getTrueFacts(snapshot);

    expect(typeof facts).toBe('object');
    expect(facts).not.toBeNull();
  });

  it('should create RULER context', () => {
    const context = createRulerContext(snapshot);

    expect(context.marketOutcomes).toBeDefined();
    expect(context.trueFacts).toBeDefined();
    expect(context.hiddenFacts).toBeDefined();
    expect(context.hiddenEvents).toBeDefined();
    expect(context.optimalActions).toBeDefined();
  });

  it('should score action against ground truth', () => {
    const optimalActions = snapshot.groundTruth.optimalActions;
    if (optimalActions.length > 0) {
      const action = optimalActions[0]!;
      const score = scoreActionAgainstGroundTruth(
        snapshot,
        action.tick,
        action.type,
        action.target
      );

      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });
});
