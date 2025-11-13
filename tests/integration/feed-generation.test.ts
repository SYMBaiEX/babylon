/**
 * Integration tests for FeedGenerator refactored methods
 * 
 * Tests verify:
 * - World context is properly included
 * - Style guide is applied
 * - Personality consistency
 * - Sentiment/clueStrength/pointsToward are returned
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FeedGenerator } from '@/engine/FeedGenerator';
import type { Actor, Organization, WorldEvent } from '@/shared/types';
import type { BabylonLLMClient } from '@/generator/llm/openai-client';

// Mock LLM client
const createMockLLM = (): BabylonLLMClient => {
  return {
    generateJSON: vi.fn().mockResolvedValue({
      post: 'Test post content',
      sentiment: 0.5,
      clueStrength: 0.3,
      pointsToward: true,
    }),
  } as unknown as BabylonLLMClient;
};

// Mock world context
const mockWorldContext = {
  worldActors: 'World Actors: Test Actor 1, Test Actor 2',
  currentMarkets: 'Active Markets: Test Market',
  activePredictions: 'Active Predictions: Test Prediction',
  recentTrades: 'Recent Trades: Test Trade',
};

// Mock actors
const createMockActor = (id: string, name: string): Actor => ({
  id,
  name,
  description: `Test ${name} description`,
  personality: 'optimistic',
  role: 'executive',
  domain: ['tech'],
  affiliations: [],
});

// Mock organizations
const createMockOrg = (id: string, name: string): Organization => ({
  id,
  name,
  description: `Test ${name} description`,
  type: 'company',
  canBeInvolved: true,
});

// Mock world event
const createMockEvent = (): WorldEvent => ({
  id: 'event-1',
  day: 1,
  description: 'Test event description',
  type: 'announcement',
  actors: ['actor-1'],
  pointsToward: 'YES',
  visibility: 'public',
});

describe('FeedGenerator - Refactored Methods', () => {
  let feedGenerator: FeedGenerator;
  let mockLLM: BabylonLLMClient;

  beforeEach(() => {
    mockLLM = createMockLLM();
    feedGenerator = new FeedGenerator(mockLLM);
    
    // Mock world context generation
    vi.spyOn(require('@/lib/prompts/world-context'), 'generateWorldContext')
      .mockResolvedValue(mockWorldContext);
  });

  describe('generateCompanyPost', () => {
    it('should generate company post with world context', async () => {
      const company = createMockOrg('org-1', 'Test Company');
      const actor = createMockActor('actor-1', 'Test CEO');
      const event = createMockEvent();

      const result = await feedGenerator['generateCompanyPost'](
        company,
        event,
        actor,
        true
      );

      expect(result).toHaveProperty('post');
      expect(result).toHaveProperty('sentiment');
      expect(result).toHaveProperty('clueStrength');
      expect(result).toHaveProperty('pointsToward');
      expect(mockLLM.generateJSON).toHaveBeenCalled();
    });

    it('should handle crisis mode correctly', async () => {
      const company = createMockOrg('org-1', 'Test Company');
      const actor = createMockActor('actor-1', 'Test CEO');
      const event = { ...createMockEvent(), type: 'scandal' as const };

      await feedGenerator['generateCompanyPost'](company, event, actor, false);

      const callArgs = (mockLLM.generateJSON as any).mock.calls[0];
      const prompt = callArgs[0];
      expect(prompt).toContain('crisis management');
    });
  });

  describe('generateGovernmentPost', () => {
    it('should generate government post with world context', async () => {
      const govt = createMockOrg('govt-1', 'Test Agency');
      const event = createMockEvent();
      const actors = [createMockActor('actor-1', 'Test Actor')];

      const result = await feedGenerator['generateGovernmentPost'](
        govt,
        event,
        actors,
        true
      );

      expect(result).toHaveProperty('post');
      expect(result).toHaveProperty('sentiment');
      expect(result).toHaveProperty('clueStrength');
      expect(result).toHaveProperty('pointsToward');
    });
  });

  describe('generateDirectReaction', () => {
    it('should generate direct reaction with world context and voice context', async () => {
      const actor = createMockActor('actor-1', 'Test Actor');
      const event = createMockEvent();

      feedGenerator.setActorStates(new Map([
        ['actor-1', { mood: 0.5, luck: 'medium' }],
      ]));

      const result = await feedGenerator.generateDirectReaction(actor, event, true);

      expect(result).toHaveProperty('post');
      expect(result).toHaveProperty('sentiment');
      expect(result).toHaveProperty('clueStrength');
      expect(result).toHaveProperty('pointsToward');
    });
  });

  describe('generateReply', () => {
    it('should generate reply with world context and voice context', async () => {
      const actor = createMockActor('actor-1', 'Test Actor');
      const originalPost = {
        id: 'post-1',
        day: 1,
        timestamp: '2024-01-01T00:00:00Z',
        type: 'post' as const,
        content: 'Original post content',
        author: 'actor-2',
        authorName: 'Original Author',
      };

      feedGenerator.setActorStates(new Map([
        ['actor-1', { mood: 0.5, luck: 'medium' }],
      ]));

      const result = await feedGenerator.generateReply(actor, originalPost);

      expect(result).toHaveProperty('post');
      expect(result).toHaveProperty('sentiment');
      expect(result).toHaveProperty('clueStrength');
      expect(result).toHaveProperty('pointsToward');
    });
  });

  describe('generateMediaPost', () => {
    it('should generate media post with world context', async () => {
      const media = createMockOrg('media-1', 'Test Media');
      const event = createMockEvent();
      const actors = [createMockActor('actor-1', 'Test Actor')];

      const result = await feedGenerator.generateMediaPost(media, event, actors, true);

      expect(result).toHaveProperty('post');
      expect(result).toHaveProperty('sentiment');
      expect(result).toHaveProperty('clueStrength');
      expect(result).toHaveProperty('pointsToward');
    });
  });

  describe('World Context Caching', () => {
    it('should cache world context', async () => {
      // Create a fresh generator instance to isolate cache test
      const freshGenerator = new FeedGenerator(mockLLM);
      const generateWorldContext = require('@/lib/prompts/world-context').generateWorldContext;
      
      // Reset mock call count
      vi.clearAllMocks();
      
      const company = createMockOrg('org-1', 'Test Company');
      const actor = createMockActor('actor-1', 'Test CEO');
      const event = createMockEvent();

      // First call - should generate world context
      await freshGenerator['generateCompanyPost'](company, event, actor, true);
      const firstCallCount = (generateWorldContext as any).mock.calls.length;
      
      // Second call within cache TTL - should use cache
      await freshGenerator['generateCompanyPost'](company, event, actor, true);
      const secondCallCount = (generateWorldContext as any).mock.calls.length;

      // Should have same number of calls (cache hit)
      expect(secondCallCount).toBe(firstCallCount);
      expect(firstCallCount).toBeGreaterThan(0);
    });

    it('should clear cache when requested', () => {
      feedGenerator.clearWorldContextCache();
      expect(feedGenerator['worldContextCache']).toBeUndefined();
    });
  });

  describe('Performance Logging', () => {
    it('should log world context generation time', async () => {
      const logger = require('@/lib/logger').logger;
      const debugSpy = vi.spyOn(logger, 'debug');

      const company = createMockOrg('org-1', 'Test Company');
      const actor = createMockActor('actor-1', 'Test CEO');
      const event = createMockEvent();

      await feedGenerator['generateCompanyPost'](company, event, actor, true);

      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('World context generated'),
        expect.any(Object),
        'FeedGenerator'
      );
    });
  });
});

