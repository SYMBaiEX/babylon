/**
 * Unit Tests for Benchmark Pipeline Components
 *
 * Tests the new benchmark system components:
 * 1. Model registry
 * 2. Chart/report generation
 *
 * Note: Full integration tests with simulation are tested via CLI.
 */

import { beforeAll, describe, expect, it } from 'bun:test';
import { promises as fs } from 'fs';
import * as path from 'path';
import {
  BenchmarkChartGenerator,
  type ModelComparisonData,
} from '../BenchmarkChartGenerator';
// Core benchmark components
import {
  type BenchmarkConfig,
  BenchmarkDataGenerator,
  type BenchmarkGameSnapshot,
} from '../BenchmarkDataGenerator';
// New components
import {
  getBaselineModels,
  getModelById,
  MODEL_REGISTRY,
  validateModelId,
} from '../ModelRegistry';

// Test output directory
const TEST_OUTPUT_DIR = path.join(process.cwd(), 'benchmarks', 'test-unit');

describe('Model Registry', () => {
  it('should have baseline models defined', () => {
    const baselines = getBaselineModels();
    expect(baselines.length).toBeGreaterThan(0);

    // Should have at least llama and qwen
    const modelIds = baselines.map((m) => m.id);
    expect(modelIds).toContain('llama-8b');
    expect(modelIds).toContain('qwen-32b');
  });

  it('should get model by ID', () => {
    const llama = getModelById('llama-8b');
    expect(llama).toBeDefined();
    expect(llama?.displayName).toBe('LLaMA 3.1 8B');
    expect(llama?.provider).toBe('groq');
  });

  it('should validate model IDs', () => {
    expect(validateModelId('llama-8b')).toBe(true);
    expect(validateModelId('llama-3.1-8b-instant')).toBe(true);
    expect(validateModelId('nonexistent-model')).toBe(false);
  });

  it('should have all required fields for models', () => {
    for (const model of MODEL_REGISTRY) {
      expect(model.id).toBeTruthy();
      expect(model.displayName).toBeTruthy();
      expect(model.provider).toBeTruthy();
      expect(model.modelId).toBeTruthy();
      expect(model.tier).toBeTruthy();
      expect(typeof model.isBaseline).toBe('boolean');
    }
  });
});

describe('Benchmark Data Generator', () => {
  let testSnapshot: BenchmarkGameSnapshot;

  beforeAll(async () => {
    const config: BenchmarkConfig = {
      durationMinutes: 1,
      tickInterval: 30,
      numPredictionMarkets: 2,
      numPerpetualMarkets: 1,
      numAgents: 2,
      seed: 54321,
    };

    const generator = new BenchmarkDataGenerator(config);
    testSnapshot = await generator.generate();
  });

  it('should generate valid benchmark snapshot', () => {
    expect(testSnapshot).toBeDefined();
    expect(testSnapshot.id).toBeTruthy();
    expect(testSnapshot.version).toBe('1.0.0');
  });

  it('should have correct initial state', () => {
    const state = testSnapshot.initialState;
    expect(state.predictionMarkets.length).toBe(2);
    expect(state.perpetualMarkets.length).toBe(1);
    expect(state.agents.length).toBe(2);
  });

  it('should have generated ticks', () => {
    expect(testSnapshot.ticks.length).toBeGreaterThan(0);

    // Each tick should have events and state
    for (const tick of testSnapshot.ticks) {
      expect(tick.number).toBeGreaterThanOrEqual(0);
      expect(tick.timestamp).toBeGreaterThan(0);
      expect(Array.isArray(tick.events)).toBe(true);
      expect(tick.state).toBeDefined();
    }
  });

  it('should have ground truth data', () => {
    const gt = testSnapshot.groundTruth;
    expect(gt).toBeDefined();
    expect(gt.marketOutcomes).toBeDefined();
    expect(gt.priceHistory).toBeDefined();
    expect(Array.isArray(gt.optimalActions)).toBe(true);
    expect(Array.isArray(gt.socialOpportunities)).toBe(true);
    expect(Array.isArray(gt.hiddenFacts)).toBe(true);
  });
});

describe('Chart Generation', () => {
  it('should generate terminal chart', () => {
    const data = [
      { label: 'Model A', value: 100 },
      { label: 'Model B', value: -50 },
      { label: 'Model C', value: 75 },
    ];

    const chart = BenchmarkChartGenerator.generateTerminalChart(
      'Test Chart',
      data
    );

    expect(chart).toBeTruthy();
    expect(chart).toContain('Test Chart');
    expect(chart).toContain('Model A');
    expect(chart).toContain('Model B');
    expect(chart).toContain('Model C');
  });

  it('should generate terminal summary', () => {
    const results: ModelComparisonData[] = [
      {
        modelId: 'llama-8b',
        modelName: 'LLaMA 8B',
        metrics: {
          totalPnl: 100,
          predictionMetrics: {
            totalPositions: 10,
            correctPredictions: 6,
            incorrectPredictions: 4,
            accuracy: 0.6,
            avgPnlPerPosition: 10,
          },
          perpMetrics: {
            totalTrades: 5,
            profitableTrades: 3,
            winRate: 0.6,
            avgPnlPerTrade: 20,
            maxDrawdown: 50,
          },
          socialMetrics: {
            postsCreated: 2,
            groupsJoined: 1,
            messagesReceived: 5,
            reputationGained: 20,
          },
          timing: {
            avgResponseTime: 100,
            maxResponseTime: 200,
            totalDuration: 5000,
          },
          optimalityScore: 60,
        },
        runAt: new Date(),
      },
      {
        modelId: 'qwen-32b',
        modelName: 'Qwen 32B',
        metrics: {
          totalPnl: -50,
          predictionMetrics: {
            totalPositions: 8,
            correctPredictions: 4,
            incorrectPredictions: 4,
            accuracy: 0.5,
            avgPnlPerPosition: -6.25,
          },
          perpMetrics: {
            totalTrades: 3,
            profitableTrades: 1,
            winRate: 0.33,
            avgPnlPerTrade: -16.67,
            maxDrawdown: 80,
          },
          socialMetrics: {
            postsCreated: 1,
            groupsJoined: 0,
            messagesReceived: 3,
            reputationGained: 10,
          },
          timing: {
            avgResponseTime: 150,
            maxResponseTime: 300,
            totalDuration: 6000,
          },
          optimalityScore: 40,
        },
        runAt: new Date(),
      },
    ];

    const summary = BenchmarkChartGenerator.generateTerminalSummary(results);

    expect(summary).toBeTruthy();
    expect(summary).toContain('BENCHMARK RESULTS');
    expect(summary).toContain('LLaMA 8B');
    expect(summary).toContain('Qwen 32B');
    expect(summary).toContain('WINNER');
  });

  it('should generate HTML report', async () => {
    await fs.mkdir(TEST_OUTPUT_DIR, { recursive: true });

    const results: ModelComparisonData[] = [
      {
        modelId: 'test-model',
        modelName: 'Test Model',
        metrics: {
          totalPnl: 50,
          predictionMetrics: {
            totalPositions: 5,
            correctPredictions: 3,
            incorrectPredictions: 2,
            accuracy: 0.6,
            avgPnlPerPosition: 10,
          },
          perpMetrics: {
            totalTrades: 2,
            profitableTrades: 1,
            winRate: 0.5,
            avgPnlPerTrade: 25,
            maxDrawdown: 30,
          },
          socialMetrics: {
            postsCreated: 1,
            groupsJoined: 1,
            messagesReceived: 2,
            reputationGained: 15,
          },
          timing: {
            avgResponseTime: 120,
            maxResponseTime: 250,
            totalDuration: 4000,
          },
          optimalityScore: 55,
        },
        runAt: new Date(),
      },
    ];

    const reportPath = path.join(TEST_OUTPUT_DIR, 'test-report.html');

    const outputPath = await BenchmarkChartGenerator.generateReport(
      results,
      reportPath,
      {
        title: 'Test Report',
        benchmarkId: 'test-benchmark',
      }
    );

    expect(outputPath).toBe(reportPath);

    // Check file was created
    const stat = await fs.stat(reportPath);
    expect(stat.isFile()).toBe(true);

    // Check content
    const content = await fs.readFile(reportPath, 'utf-8');
    expect(content).toContain('Test Report');
    expect(content).toContain('Test Model');
    expect(content).toContain('chart.js');

    // Clean up
    await fs.rm(TEST_OUTPUT_DIR, { recursive: true, force: true });
  });
});
