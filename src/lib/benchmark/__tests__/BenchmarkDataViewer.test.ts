/**
 * Tests for BenchmarkDataViewer
 */

import { BenchmarkDataViewer } from '../BenchmarkDataViewer';
import { BenchmarkDataGenerator, type BenchmarkConfig } from '../BenchmarkDataGenerator';
import { promises as fs } from 'fs';
import * as path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';

describe('BenchmarkDataViewer', () => {
  let testBenchmarkPath: string;
  
  beforeAll(async () => {
    // Generate a test benchmark
    const config: BenchmarkConfig = {
      durationMinutes: 5,
      tickInterval: 10,
      numPredictionMarkets: 3,
      numPerpetualMarkets: 2,
      numAgents: 3,
      seed: 12345,
    };
    
    const generator = new BenchmarkDataGenerator(config);
    const snapshot = await generator.generate();
    
    // Save to temp file
    const tempDir = path.join(process.cwd(), 'benchmarks', 'test');
    await fs.mkdir(tempDir, { recursive: true });
    testBenchmarkPath = path.join(tempDir, `test-benchmark-${snapshot.id}.json`);
    await fs.writeFile(testBenchmarkPath, JSON.stringify(snapshot, null, 2));
  });
  
  afterAll(async () => {
    // Clean up
    try {
      await fs.unlink(testBenchmarkPath);
    } catch {
      // Ignore
    }
  });
  
  it('should load and view benchmark', async () => {
    const view = await BenchmarkDataViewer.view(testBenchmarkPath);
    
    expect(view.id).toBeTruthy();
    expect(view.version).toBe('1.0.0');
    expect(view.initialState.predictionMarkets).toBe(3);
    expect(view.initialState.perpetualMarkets).toBe(2);
    expect(view.initialState.agents).toBe(3);
    expect(view.ticks.total).toBeGreaterThan(0);
  });
  
  it('should validate benchmark data', async () => {
    const view = await BenchmarkDataViewer.view(testBenchmarkPath);
    
    expect(view.validation.valid).toBe(true);
    expect(view.validation.errors.length).toBe(0);
  });
  
  it('should show ground truth when requested', async () => {
    const view = await BenchmarkDataViewer.view(testBenchmarkPath, {
      showGroundTruth: true,
    });
    
    expect(view.groundTruth).toBeDefined();
    expect(view.groundTruth?.marketOutcomes).toBeGreaterThan(0);
    expect(view.groundTruth?.hiddenFacts).toBeGreaterThanOrEqual(0);
    expect(view.groundTruth?.hiddenEvents).toBeGreaterThanOrEqual(0);
  });
  
  it('should verify agents cannot access hidden facts', async () => {
    const data = await fs.readFile(testBenchmarkPath, 'utf-8');
    const snapshot = JSON.parse(data);
    
    const result = BenchmarkDataViewer.verifyAgentCannotAccessHiddenFacts(snapshot);
    
    expect(result.canAccess).toBe(false);
    expect(result.reason).toContain('properly isolated');
  });
  
  it('should get tick details', async () => {
    const data = await fs.readFile(testBenchmarkPath, 'utf-8');
    const snapshot = JSON.parse(data);
    
    const details = BenchmarkDataViewer.getTickDetails(snapshot, 0);
    
    expect(details.tick).toBeDefined();
    expect(details.state).toBeDefined();
    expect(Array.isArray(details.events)).toBe(true);
  });
  
  it('should get ground truth for tick', async () => {
    const data = await fs.readFile(testBenchmarkPath, 'utf-8');
    const snapshot = JSON.parse(data);
    
    const gt = BenchmarkDataViewer.getGroundTruthForTick(snapshot, 0);
    
    expect(gt.marketOutcomes).toBeDefined();
    expect(Array.isArray(gt.hiddenFacts)).toBe(true);
    expect(Array.isArray(gt.hiddenEvents)).toBe(true);
  });
  
  it('should analyze ticks correctly', async () => {
    const view = await BenchmarkDataViewer.view(testBenchmarkPath, { verbose: true });
    
    expect(view.ticks.total).toBeGreaterThan(0);
    expect(view.ticks.withEvents).toBeGreaterThanOrEqual(0);
    expect(typeof view.ticks.eventTypes).toBe('object');
  });
});



