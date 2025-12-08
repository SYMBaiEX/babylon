/**
 * Token Statistics Tests
 *
 * Tests for the token counting and statistics service.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  getTokenUsageCallback,
  setTokenUsageCallback,
} from '../llm/openai-client';
import { TokenStatsService } from '../services/token-stats-service';
import {
  calculateEstimatedCost,
  TOKEN_COST_PER_MILLION,
} from '../types/token-stats';

describe('Token Stats Types', () => {
  test('TOKEN_COST_PER_MILLION has expected models', () => {
    expect(TOKEN_COST_PER_MILLION['qwen/qwen3-32b']).toBeDefined();
    expect(TOKEN_COST_PER_MILLION['claude-sonnet-4-5']).toBeDefined();
    expect(TOKEN_COST_PER_MILLION['gpt-5.1']).toBeDefined();
    expect(TOKEN_COST_PER_MILLION.default).toBeDefined();
  });

  test('calculateEstimatedCost calculates correctly', () => {
    const result = calculateEstimatedCost('qwen/qwen3-32b', 1_000_000, 500_000);

    expect(result.inputCostUSD).toBeCloseTo(0.3, 2); // $0.30 per 1M input tokens
    expect(result.outputCostUSD).toBeCloseTo(0.15, 2); // $0.30 per 1M * 0.5M
    expect(result.totalCostUSD).toBeCloseTo(0.45, 2);
  });

  test('calculateEstimatedCost uses default for unknown models', () => {
    const result = calculateEstimatedCost(
      'unknown-model',
      1_000_000,
      1_000_000
    );

    expect(result.inputCostUSD).toBeCloseTo(1.0, 2); // default $1.00 per 1M
    expect(result.outputCostUSD).toBeCloseTo(3.0, 2); // default $3.00 per 1M
    expect(result.totalCostUSD).toBeCloseTo(4.0, 2);
  });
});

describe('TokenStatsService', () => {
  beforeEach(() => {
    TokenStatsService.clearAll();
  });

  afterEach(() => {
    TokenStatsService.clearAll();
  });

  test('startTick begins collection', () => {
    expect(TokenStatsService.isTickInProgress()).toBe(false);

    const tickId = TokenStatsService.startTick('test-tick-1');

    expect(tickId).toBe('test-tick-1');
    expect(TokenStatsService.isTickInProgress()).toBe(true);
  });

  test('endTick returns statistics', () => {
    TokenStatsService.startTick('test-tick-2');

    const stats = TokenStatsService.endTick();

    expect(stats).not.toBeNull();
    expect(stats?.tickId).toBe('test-tick-2');
    expect(stats?.totalCalls).toBe(0);
    expect(stats?.totalTokens).toBe(0);
    expect(TokenStatsService.isTickInProgress()).toBe(false);
  });

  test('callback collects LLM calls', () => {
    TokenStatsService.startTick('test-tick-3');

    // Simulate an LLM call via the callback
    const callback = getTokenUsageCallback();
    expect(callback).not.toBeNull();

    callback?.({
      provider: 'groq',
      model: 'qwen/qwen3-32b',
      inputTokens: 1000,
      outputTokens: 500,
      totalTokens: 1500,
      promptType: 'test-prompt',
      durationMs: 100,
      success: true,
    });

    const currentStats = TokenStatsService.getCurrentStats();
    expect(currentStats).not.toBeNull();
    expect(currentStats?.totalCalls).toBe(1);
    expect(currentStats?.totalInputTokens).toBe(1000);
    expect(currentStats?.totalOutputTokens).toBe(500);
    expect(currentStats?.totalTokens).toBe(1500);

    const finalStats = TokenStatsService.endTick();
    expect(finalStats?.totalCalls).toBe(1);
    expect(finalStats?.byPromptType).toHaveLength(1);
    expect(finalStats?.byPromptType[0]?.promptType).toBe('test-prompt');
    expect(finalStats?.byModel).toHaveLength(1);
    expect(finalStats?.byModel[0]?.model).toBe('qwen/qwen3-32b');
  });

  test('multiple calls aggregate correctly', () => {
    TokenStatsService.startTick('test-tick-4');

    const callback = getTokenUsageCallback();

    // Simulate multiple calls
    callback?.({
      provider: 'groq',
      model: 'qwen/qwen3-32b',
      inputTokens: 1000,
      outputTokens: 500,
      totalTokens: 1500,
      promptType: 'market-decisions',
      durationMs: 100,
      success: true,
    });

    callback?.({
      provider: 'groq',
      model: 'qwen/qwen3-32b',
      inputTokens: 2000,
      outputTokens: 800,
      totalTokens: 2800,
      promptType: 'market-decisions',
      durationMs: 150,
      success: true,
    });

    callback?.({
      provider: 'claude',
      model: 'claude-sonnet-4-5',
      inputTokens: 500,
      outputTokens: 200,
      totalTokens: 700,
      promptType: 'generate-post',
      durationMs: 200,
      success: true,
    });

    const stats = TokenStatsService.endTick();

    expect(stats?.totalCalls).toBe(3);
    expect(stats?.totalInputTokens).toBe(3500);
    expect(stats?.totalOutputTokens).toBe(1500);
    expect(stats?.totalTokens).toBe(5000);

    // Check prompt type aggregation
    expect(stats?.byPromptType).toHaveLength(2);
    const marketDecisions = stats?.byPromptType.find(
      (p) => p.promptType === 'market-decisions'
    );
    expect(marketDecisions?.callCount).toBe(2);
    expect(marketDecisions?.totalInputTokens).toBe(3000);

    // Check model aggregation
    expect(stats?.byModel).toHaveLength(2);
    const qwen = stats?.byModel.find((m) => m.model === 'qwen/qwen3-32b');
    expect(qwen?.callCount).toBe(2);
    expect(qwen?.provider).toBe('groq');
  });

  test('getSummary aggregates multiple ticks', () => {
    // Run first tick
    TokenStatsService.startTick('tick-1');
    getTokenUsageCallback()?.({
      provider: 'groq',
      model: 'qwen/qwen3-32b',
      inputTokens: 1000,
      outputTokens: 500,
      totalTokens: 1500,
      promptType: 'test',
      durationMs: 100,
      success: true,
    });
    TokenStatsService.endTick();

    // Run second tick
    TokenStatsService.startTick('tick-2');
    getTokenUsageCallback()?.({
      provider: 'groq',
      model: 'qwen/qwen3-32b',
      inputTokens: 2000,
      outputTokens: 1000,
      totalTokens: 3000,
      promptType: 'test',
      durationMs: 150,
      success: true,
    });
    TokenStatsService.endTick();

    const summary = TokenStatsService.getSummary(10);

    expect(summary).not.toBeNull();
    expect(summary?.tickCount).toBe(2);
    expect(summary?.totalCalls).toBe(2);
    expect(summary?.totalInputTokens).toBe(3000);
    expect(summary?.totalOutputTokens).toBe(1500);
    expect(summary?.totalTokens).toBe(4500);
    expect(summary?.avgCallsPerTick).toBe(1);
    expect(summary?.avgTotalTokensPerTick).toBe(2250);
    expect(summary?.estimatedTotalCostUSD).toBeGreaterThan(0);
  });

  test('failed calls are tracked', () => {
    TokenStatsService.startTick('test-tick-5');

    const callback = getTokenUsageCallback();

    callback?.({
      provider: 'groq',
      model: 'qwen/qwen3-32b',
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      promptType: 'failed-call',
      durationMs: 50,
      success: false,
      error: 'Rate limit exceeded',
    });

    const stats = TokenStatsService.endTick();

    expect(stats?.totalCalls).toBe(1);
    expect(stats?.byPromptType[0]?.successRate).toBe(0);
  });

  test('recentTicks stores history', () => {
    // Run a few ticks
    for (let i = 0; i < 5; i++) {
      TokenStatsService.startTick(`tick-${i}`);
      getTokenUsageCallback()?.({
        provider: 'groq',
        model: 'qwen/qwen3-32b',
        inputTokens: 100 * (i + 1),
        outputTokens: 50 * (i + 1),
        totalTokens: 150 * (i + 1),
        promptType: 'test',
        durationMs: 100,
        success: true,
      });
      TokenStatsService.endTick();
    }

    const recent = TokenStatsService.getRecentTicks(3);

    expect(recent).toHaveLength(3);
    // Most recent should be first
    expect(recent[0]?.tickId).toBe('tick-4');
  });
});

describe('setTokenUsageCallback / getTokenUsageCallback', () => {
  afterEach(() => {
    setTokenUsageCallback(null);
  });

  test('can set and get callback', () => {
    expect(getTokenUsageCallback()).toBeNull();

    const callback = () => {};
    setTokenUsageCallback(callback);

    expect(getTokenUsageCallback()).toBe(callback);
  });

  test('can clear callback', () => {
    setTokenUsageCallback(() => {});
    setTokenUsageCallback(null);

    expect(getTokenUsageCallback()).toBeNull();
  });
});
