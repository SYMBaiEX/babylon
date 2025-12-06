/**
 * AI Agent Tests
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { AIAgent, type TrainingSample } from '../game/agent.js';

describe('AIAgent Initialization', () => {
  it('should initialize with correct dimensions', () => {
    const agent = new AIAgent({
      inputSize: 5,
      hiddenSize: 10,
      outputSize: 1,
      learningRate: 0.1,
    });

    const stats = agent.getStats();
    expect(stats.epoch).toBe(0);
    expect(stats.totalSamples).toBe(0);
    expect(stats.averageLoss).toBe(1.0);
  });

  it('should serialize and restore state', () => {
    const agent = new AIAgent({
      inputSize: 3,
      hiddenSize: 4,
      outputSize: 1,
      learningRate: 0.1,
    });

    const state = agent.serialize();
    expect(state.inputWeights.length).toBe(3);
    expect(state.hiddenWeights.length).toBe(4);
    expect(state.bias1.length).toBe(4);
    expect(state.bias2.length).toBe(1);
  });

  it('should generate consistent model hash', () => {
    const agent = new AIAgent({
      inputSize: 3,
      hiddenSize: 4,
      outputSize: 1,
      learningRate: 0.1,
    });

    const hash1 = agent.getModelHash();
    const hash2 = agent.getModelHash();

    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^0x[a-f0-9]{64}$/);
  });
});

describe('AIAgent Prediction', () => {
  let agent: AIAgent;

  beforeEach(() => {
    agent = new AIAgent({
      inputSize: 5,
      hiddenSize: 8,
      outputSize: 1,
      learningRate: 0.1,
    });
  });

  it('should produce output in valid range', () => {
    const result = agent.predict([0.1, 0.2, 0.3, 0.4, 0.5]);

    expect(result.prediction.length).toBe(1);
    expect(result.prediction[0]).toBeGreaterThanOrEqual(0);
    expect(result.prediction[0]).toBeLessThanOrEqual(1);
  });

  it('should produce confidence between 0 and 1', () => {
    const result = agent.predict([0.5, 0.5, 0.5, 0.5, 0.5]);

    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('should handle zero input', () => {
    const result = agent.predict([0, 0, 0, 0, 0]);

    expect(result.prediction.length).toBe(1);
    // Output should still be valid (sigmoid output)
    expect(Number.isFinite(result.prediction[0])).toBe(true);
  });

  it('should produce consistent predictions for same input', () => {
    const input = [0.1, 0.2, 0.3, 0.4, 0.5];

    const result1 = agent.predict(input);
    const result2 = agent.predict(input);

    expect(result1.prediction[0]).toBe(result2.prediction[0]);
  });
});

describe('AIAgent Training', () => {
  let agent: AIAgent;

  beforeEach(() => {
    agent = new AIAgent({
      inputSize: 5,
      hiddenSize: 8,
      outputSize: 1,
      learningRate: 0.1,
    });
  });

  it('should reduce loss when training on consistent data', () => {
    // Create training samples for a simple pattern (output = average of inputs)
    const samples: TrainingSample[] = [];
    for (let i = 0; i < 50; i++) {
      const input = [0.2, 0.4, 0.6, 0.8, 1.0];
      const target = [0.6]; // average
      samples.push({ input, target, timestamp: Date.now() });
    }

    const initialStats = agent.getStats();
    const initialLoss = initialStats.averageLoss;

    // Train multiple epochs
    for (let epoch = 0; epoch < 10; epoch++) {
      agent.train(samples);
    }

    const finalStats = agent.getStats();
    expect(finalStats.averageLoss).toBeLessThan(initialLoss);
  });

  it('should increment epoch counter', () => {
    const samples: TrainingSample[] = [
      {
        input: [0.1, 0.2, 0.3, 0.4, 0.5],
        target: [0.3],
        timestamp: Date.now(),
      },
    ];

    expect(agent.getStats().epoch).toBe(0);

    agent.train(samples);
    expect(agent.getStats().epoch).toBe(1);

    agent.train(samples);
    expect(agent.getStats().epoch).toBe(2);
  });

  it('should track total samples', () => {
    const samples1: TrainingSample[] = Array.from({ length: 10 }, () => ({
      input: [0.1, 0.2, 0.3, 0.4, 0.5],
      target: [0.3],
      timestamp: Date.now(),
    }));

    const samples2: TrainingSample[] = Array.from({ length: 20 }, () => ({
      input: [0.1, 0.2, 0.3, 0.4, 0.5],
      target: [0.3],
      timestamp: Date.now(),
    }));

    agent.train(samples1);
    expect(agent.getStats().totalSamples).toBe(10);

    agent.train(samples2);
    expect(agent.getStats().totalSamples).toBe(30);
  });

  it('should change model hash after training', () => {
    const hashBefore = agent.getModelHash();

    const samples: TrainingSample[] = [
      {
        input: [0.1, 0.2, 0.3, 0.4, 0.5],
        target: [0.9],
        timestamp: Date.now(),
      },
    ];
    agent.train(samples);

    const hashAfter = agent.getModelHash();
    expect(hashAfter).not.toBe(hashBefore);
  });

  it('should report whether loss improved', () => {
    const goodSamples: TrainingSample[] = Array.from({ length: 50 }, () => ({
      input: [0.5, 0.5, 0.5, 0.5, 0.5],
      target: [0.5],
      timestamp: Date.now(),
    }));

    // First training should improve from initial loss of 1.0
    const result = agent.train(goodSamples);
    expect(result.improved).toBe(true);
  });
});

describe('AIAgent State Persistence', () => {
  it('should load saved state', () => {
    const agent1 = new AIAgent({
      inputSize: 5,
      hiddenSize: 8,
      outputSize: 1,
      learningRate: 0.1,
    });

    // Train it
    const samples: TrainingSample[] = Array.from({ length: 20 }, () => ({
      input: [0.3, 0.4, 0.5, 0.6, 0.7],
      target: [0.5],
      timestamp: Date.now(),
    }));
    agent1.train(samples);
    agent1.train(samples);

    const savedState = agent1.serialize();
    const savedHash = agent1.getModelHash();

    // Create new agent and load state
    const agent2 = new AIAgent({
      inputSize: 5,
      hiddenSize: 8,
      outputSize: 1,
      learningRate: 0.1,
    });
    agent2.loadState(savedState);

    expect(agent2.getModelHash()).toBe(savedHash);
    expect(agent2.getStats().epoch).toBe(savedState.epoch);
  });

  it('should produce same predictions after loading state', () => {
    const agent1 = new AIAgent({
      inputSize: 5,
      hiddenSize: 8,
      outputSize: 1,
      learningRate: 0.1,
    });

    const samples: TrainingSample[] = Array.from({ length: 20 }, () => ({
      input: [0.3, 0.4, 0.5, 0.6, 0.7],
      target: [0.5],
      timestamp: Date.now(),
    }));
    agent1.train(samples);

    const input = [0.1, 0.2, 0.3, 0.4, 0.5];
    const prediction1 = agent1.predict(input);

    const agent2 = new AIAgent({
      inputSize: 5,
      hiddenSize: 8,
      outputSize: 1,
      learningRate: 0.1,
    });
    agent2.loadState(agent1.serialize());
    const prediction2 = agent2.predict(input);

    expect(prediction1.prediction[0]).toBe(prediction2.prediction[0]);
  });
});
