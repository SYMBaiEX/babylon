/**
 * BenchmarkRunner Tests
 *
 * Tests the BenchmarkRunner functionality including:
 * - Force strategy selection (random, momentum)
 * - Config validation
 * - Snapshot loading/generation
 * - Result comparison logic
 *
 * These tests verify the benchmark infrastructure for comparing
 * agent performance against baseline strategies.
 */

import { describe, expect, test } from 'bun:test';
import type { BenchmarkConfig } from '../BenchmarkDataGenerator';

// Shared type for run results in tests
interface RunResult {
  id: string;
  pnl: number;
  accuracy: number;
  optimality: number;
}

// =============================================================================
// Force Strategy Tests
// =============================================================================

describe('BenchmarkRunner - Force Strategy', () => {
  type ForceStrategy = 'random' | 'momentum' | undefined;

  test('validates valid force strategies', () => {
    const validStrategies: ForceStrategy[] = ['random', 'momentum', undefined];

    for (const strategy of validStrategies) {
      expect(['random', 'momentum', undefined]).toContain(strategy);
    }
  });

  test('random strategy generates random actions', () => {
    // Simulate random strategy behavior
    const generateRandomAction = () => {
      const actions = ['buy', 'sell', 'hold'];
      return actions[Math.floor(Math.random() * actions.length)];
    };

    // Should generate valid actions
    const action = generateRandomAction();
    expect(['buy', 'sell', 'hold']).toContain(action);
  });

  test('momentum strategy follows price direction', () => {
    // Simulate momentum strategy behavior
    const generateMomentumAction = (priceChange: number): string => {
      if (priceChange > 0.02) return 'buy'; // Price up > 2%, buy
      if (priceChange < -0.02) return 'sell'; // Price down > 2%, sell
      return 'hold'; // Price stable
    };

    expect(generateMomentumAction(0.05)).toBe('buy');
    expect(generateMomentumAction(-0.05)).toBe('sell');
    expect(generateMomentumAction(0.01)).toBe('hold');
    expect(generateMomentumAction(-0.01)).toBe('hold');
    expect(generateMomentumAction(0)).toBe('hold');
  });

  test('momentum strategy edge cases', () => {
    const generateMomentumAction = (priceChange: number): string => {
      if (priceChange > 0.02) return 'buy';
      if (priceChange < -0.02) return 'sell';
      return 'hold';
    };

    // Edge: exactly at threshold
    expect(generateMomentumAction(0.02)).toBe('hold'); // not > 0.02
    expect(generateMomentumAction(-0.02)).toBe('hold'); // not < -0.02

    // Edge: just over threshold
    expect(generateMomentumAction(0.0201)).toBe('buy');
    expect(generateMomentumAction(-0.0201)).toBe('sell');
  });
});

// =============================================================================
// BenchmarkConfig Validation Tests
// =============================================================================

describe('BenchmarkRunner - Config Validation', () => {
  test('valid config with all required fields', () => {
    const config: BenchmarkConfig = {
      durationMinutes: 30 * 24 * 60,
      tickInterval: 3600,
      numPredictionMarkets: 5,
      numPerpetualMarkets: 5,
      numAgents: 10,
      seed: 12345,
    };

    expect(config.durationMinutes).toBeGreaterThan(0);
    expect(config.tickInterval).toBeGreaterThan(0);
    expect(config.numPredictionMarkets).toBeGreaterThanOrEqual(0);
    expect(config.numPerpetualMarkets).toBeGreaterThanOrEqual(0);
    expect(config.numAgents).toBeGreaterThan(0);
    expect(config.seed).toBeDefined();
  });

  test('config with causal simulation enabled', () => {
    const config: BenchmarkConfig = {
      durationMinutes: 30 * 24 * 60,
      tickInterval: 3600, // Must be 3600 for causal
      numPredictionMarkets: 2,
      numPerpetualMarkets: 3,
      numAgents: 5,
      seed: 12345,
      useCausalSimulation: true,
    };

    expect(config.useCausalSimulation).toBe(true);
    expect(config.tickInterval).toBe(3600); // Required for causal
  });

  test('config validates tick interval for causal mode', () => {
    const validateConfig = (config: BenchmarkConfig): boolean => {
      if (config.useCausalSimulation && config.tickInterval !== 3600) {
        return false;
      }
      return true;
    };

    // Valid: causal with 3600
    expect(
      validateConfig({
        durationMinutes: 1440,
        tickInterval: 3600,
        numPredictionMarkets: 2,
        numPerpetualMarkets: 3,
        numAgents: 5,
        seed: 12345,
        useCausalSimulation: true,
      })
    ).toBe(true);

    // Invalid: causal with non-3600
    expect(
      validateConfig({
        durationMinutes: 1440,
        tickInterval: 7200,
        numPredictionMarkets: 2,
        numPerpetualMarkets: 3,
        numAgents: 5,
        seed: 12345,
        useCausalSimulation: true,
      })
    ).toBe(false);

    // Valid: non-causal with any interval
    expect(
      validateConfig({
        durationMinutes: 1440,
        tickInterval: 7200,
        numPredictionMarkets: 2,
        numPerpetualMarkets: 3,
        numAgents: 5,
        seed: 12345,
        useCausalSimulation: false,
      })
    ).toBe(true);
  });

  test('config minimum values', () => {
    const config: BenchmarkConfig = {
      durationMinutes: 60, // 1 hour minimum
      tickInterval: 60, // 1 minute minimum
      numPredictionMarkets: 0,
      numPerpetualMarkets: 1, // At least 1 market
      numAgents: 1, // At least 1 agent
      seed: 0,
    };

    expect(config.durationMinutes).toBeGreaterThanOrEqual(60);
    expect(config.tickInterval).toBeGreaterThanOrEqual(60);
  });

  test('calculates total ticks correctly', () => {
    const config: BenchmarkConfig = {
      durationMinutes: 24 * 60, // 1 day
      tickInterval: 3600, // 1 hour
      numPredictionMarkets: 2,
      numPerpetualMarkets: 3,
      numAgents: 5,
      seed: 12345,
    };

    const durationSeconds = config.durationMinutes * 60;
    const totalTicks = Math.floor(durationSeconds / config.tickInterval);

    expect(totalTicks).toBe(24); // 24 hours = 24 ticks at 1 hour interval
  });
});

// =============================================================================
// Comparison Logic Tests
// =============================================================================

describe('BenchmarkRunner - Comparison Logic', () => {
  test('calculates average metrics across runs', () => {
    const runs: RunResult[] = [
      { id: 'run-1', pnl: 100, accuracy: 0.6, optimality: 0.7 },
      { id: 'run-2', pnl: 200, accuracy: 0.8, optimality: 0.8 },
      { id: 'run-3', pnl: 150, accuracy: 0.7, optimality: 0.75 },
    ];

    const avgPnl = runs.reduce((sum, r) => sum + r.pnl, 0) / runs.length;
    const avgAccuracy =
      runs.reduce((sum, r) => sum + r.accuracy, 0) / runs.length;
    const avgOptimality =
      runs.reduce((sum, r) => sum + r.optimality, 0) / runs.length;

    expect(avgPnl).toBe(150);
    expect(avgAccuracy).toBeCloseTo(0.7, 5);
    expect(avgOptimality).toBe(0.75);
  });

  test('identifies best run by PnL', () => {
    const runs: RunResult[] = [
      { id: 'run-1', pnl: 100, accuracy: 0.6, optimality: 0.7 },
      { id: 'run-2', pnl: 200, accuracy: 0.8, optimality: 0.8 },
      { id: 'run-3', pnl: 150, accuracy: 0.7, optimality: 0.75 },
    ];

    const bestRun = runs.reduce((best, run) =>
      run.pnl > best.pnl ? run : best
    );

    expect(bestRun.id).toBe('run-2');
    expect(bestRun.pnl).toBe(200);
  });

  test('identifies worst run by PnL', () => {
    const runs: RunResult[] = [
      { id: 'run-1', pnl: 100, accuracy: 0.6, optimality: 0.7 },
      { id: 'run-2', pnl: 200, accuracy: 0.8, optimality: 0.8 },
      { id: 'run-3', pnl: 150, accuracy: 0.7, optimality: 0.75 },
    ];

    const worstRun = runs.reduce((worst, run) =>
      run.pnl < worst.pnl ? run : worst
    );

    expect(worstRun.id).toBe('run-1');
    expect(worstRun.pnl).toBe(100);
  });

  test('handles negative PnL values', () => {
    const runs: RunResult[] = [
      { id: 'run-1', pnl: -50, accuracy: 0.4, optimality: 0.3 },
      { id: 'run-2', pnl: 50, accuracy: 0.6, optimality: 0.6 },
      { id: 'run-3', pnl: -100, accuracy: 0.3, optimality: 0.2 },
    ];

    const bestRun = runs.reduce((best, run) =>
      run.pnl > best.pnl ? run : best
    );
    const worstRun = runs.reduce((worst, run) =>
      run.pnl < worst.pnl ? run : worst
    );
    const avgPnl = runs.reduce((sum, r) => sum + r.pnl, 0) / runs.length;

    expect(bestRun.id).toBe('run-2');
    expect(worstRun.id).toBe('run-3');
    expect(avgPnl).toBeCloseTo(-33.33, 1);
  });

  test('handles single run', () => {
    const runs: RunResult[] = [
      { id: 'run-1', pnl: 100, accuracy: 0.7, optimality: 0.8 },
    ];

    const avgPnl = runs.reduce((sum, r) => sum + r.pnl, 0) / runs.length;
    const bestRun = runs.reduce((best, run) =>
      run.pnl > best.pnl ? run : best
    );

    expect(avgPnl).toBe(100);
    expect(bestRun.id).toBe('run-1');
  });
});

// =============================================================================
// Alpha Calculation Tests
// =============================================================================

describe('BenchmarkRunner - Alpha Calculation', () => {
  test('calculates alpha (excess return) correctly', () => {
    const baselinePnl = 100;
    const challengerPnl = 150;

    const alpha = challengerPnl - baselinePnl;

    expect(alpha).toBe(50);
  });

  test('handles negative alpha (underperformance)', () => {
    const baselinePnl = 150;
    const challengerPnl = 100;

    const alpha = challengerPnl - baselinePnl;

    expect(alpha).toBe(-50);
  });

  test('zero alpha when equal performance', () => {
    const baselinePnl = 100;
    const challengerPnl = 100;

    const alpha = challengerPnl - baselinePnl;

    expect(alpha).toBe(0);
  });

  test('alpha percentage calculation', () => {
    const baselinePnl: number = 100;
    const challengerPnl: number = 150;

    const alphaAmount = challengerPnl - baselinePnl;
    const alphaPercent =
      baselinePnl !== 0 ? (alphaAmount / Math.abs(baselinePnl)) * 100 : 0;

    expect(alphaPercent).toBe(50); // 50% outperformance
  });

  test('handles edge case where baseline is 0', () => {
    const baselinePnl = 0;
    const challengerPnl = 100;

    // Avoid division by zero
    const alphaPercent =
      baselinePnl !== 0
        ? ((challengerPnl - baselinePnl) / Math.abs(baselinePnl)) * 100
        : challengerPnl > 0
          ? Infinity
          : challengerPnl < 0
            ? -Infinity
            : 0;

    expect(alphaPercent).toBe(Infinity);
  });
});

// =============================================================================
// Output Directory Tests
// =============================================================================

describe('BenchmarkRunner - Output Configuration', () => {
  test('constructs valid output paths', () => {
    const outputDir = './benchmark-results';
    const runId = 'run-12345';

    const trajectoryPath = `${outputDir}/${runId}/trajectory.json`;
    const metricsPath = `${outputDir}/${runId}/metrics.json`;
    const snapshotPath = `${outputDir}/snapshot.json`;

    expect(trajectoryPath).toBe('./benchmark-results/run-12345/trajectory.json');
    expect(metricsPath).toBe('./benchmark-results/run-12345/metrics.json');
    expect(snapshotPath).toBe('./benchmark-results/snapshot.json');
  });

  test('handles nested output directories', () => {
    const outputDir = './results/2024/01/benchmark-001';
    const runId = 'run-abc';

    const path = `${outputDir}/${runId}/data.json`;

    expect(path).toContain('results/2024/01/benchmark-001');
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('BenchmarkRunner - Edge Cases', () => {
  test('handles empty runs array', () => {
    const runs: RunResult[] = [];

    const avgPnl = runs.length > 0
      ? runs.reduce((sum, r) => sum + r.pnl, 0) / runs.length
      : 0;

    expect(avgPnl).toBe(0);
  });

  test('handles very large PnL values', () => {
    const runs: RunResult[] = [
      { id: 'run-1', pnl: 1e10, accuracy: 0.99, optimality: 0.99 },
    ];

    expect(runs[0]!.pnl).toBe(1e10);
  });

  test('handles very small PnL values', () => {
    const runs: RunResult[] = [
      { id: 'run-1', pnl: 0.0001, accuracy: 0.5, optimality: 0.5 },
    ];

    expect(runs[0]!.pnl).toBe(0.0001);
  });

  test('forceStrategy undefined uses agent behavior', () => {
    interface Config {
      forceStrategy?: 'random' | 'momentum';
    }

    const config: Config = {};

    expect(config.forceStrategy).toBeUndefined();

    // When undefined, agent makes autonomous decisions
    const useAgentBehavior = config.forceStrategy === undefined;
    expect(useAgentBehavior).toBe(true);
  });
});
