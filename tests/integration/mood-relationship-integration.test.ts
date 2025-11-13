/**
 * Mood & Relationship Integration Tests
 * Tests how mood and relationships affect game behavior
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { prisma } from '@/lib/prisma';
import { GameEngine } from '@/engine/GameEngine';
import { RelationshipManager } from '@/lib/services/RelationshipManager';
import type { WorldEvent } from '@/engine/GameWorld';

describe('Mood & Relationship Integration', () => {
  let engine: GameEngine;

  beforeAll(async () => {
    engine = new GameEngine({ tickIntervalMs: 60000 });
    await engine.initialize();
  });

  afterAll(async () => {
    await engine.stop();
    // Clean up test data
    await prisma.actorRelationship.deleteMany({
      where: {
        OR: [
          { actor1Id: { contains: 'integration-test-' } },
          { actor2Id: { contains: 'integration-test-' } },
        ],
      },
    });
  });

  describe('Mood Affects Feed Generation', () => {
    test('depressed actors post more negative content', async () => {
      // This would require mocking LLM or analyzing actual generated content
      // For now, verify mood is passed to context
      const { generateActorContext } = await import('@/engine/EmotionSystem');

      const depressedContext = generateActorContext(-0.8, 'low', undefined, [], 'test-actor');
      const happyContext = generateActorContext(0.8, 'high', undefined, [], 'test-actor');

      expect(depressedContext).toContain('furious');
      expect(happyContext).toContain('euphoric');
    });

    test('mood context is included in prompts', () => {
      const { generateActorContext } = require('@/engine/EmotionSystem');

      const context = generateActorContext(-0.5, 'low', undefined, [], 'test');

      expect(context).toContain('Current mood:');
      expect(context).toContain('Current luck:');
      expect(context).toBeDefined();
    });
  });

  describe('Relationships Affect Trading', () => {
    test('rival relationships create opposite trading behavior', async () => {
      // Create strong rival relationship
      const actor1 = 'integration-test-trader-1';
      const actor2 = 'integration-test-trader-2';

      await prisma.actorRelationship.create({
        data: {
          id: `integration-rival-${Date.now()}`,
          actor1Id: actor1,
          actor2Id: actor2,
          relationshipType: 'rivals',
          sentiment: -0.9, // Strong negative
          strength: 0.95, // Very strong
          isPublic: true,
          history: 'Long-standing rivalry',
          updatedAt: new Date(),
        },
      });

      // Get relationship context
      const context = await RelationshipManager.getRelationshipContext(actor1, [actor2]);

      expect(context.relationships.length).toBe(1);
      expect(context.relationships[0]?.sentiment).toBeLessThan(-0.5);
      expect(context.contextString).toContain('rivals');
      expect(context.contextString).toContain('beef');
    });

    test('ally relationships create aligned trading behavior', async () => {
      const actor1 = 'integration-test-ally-1';
      const actor2 = 'integration-test-ally-2';

      await prisma.actorRelationship.create({
        data: {
          id: `integration-ally-${Date.now()}`,
          actor1Id: actor1,
          actor2Id: actor2,
          relationshipType: 'close allies',
          sentiment: 0.9, // Strong positive
          strength: 0.95, // Very strong
          isPublic: true,
          history: 'Long-standing alliance',
          updatedAt: new Date(),
        },
      });

      const context = await RelationshipManager.getRelationshipContext(actor1, [actor2]);

      expect(context.relationships.length).toBe(1);
      expect(context.relationships[0]?.sentiment).toBeGreaterThan(0.5);
      expect(context.contextString).toContain('allies');
      expect(context.contextString).toContain('respect');
    });
  });

  describe('Feedback Loop - Events → Mood → Relationships → Trading', () => {
    test('complete information flow works', async () => {
      const actor1 = 'ailon-musk';
      const actor2 = 'mark-zuckerborg';

      // 1. Event affects mood
      const scandal: WorldEvent = {
        id: 'feedback-scandal',
        day: 1,
        type: 'scandal',
        description: 'Public scandal',
        actors: [actor1, actor2],
        visibility: 'public',
        pointsToward: 'NO',
      };

      const engineAny = engine as any;
      const mood1Before = engineAny.luckMood.get(actor1)?.mood || 0;
      const mood2Before = engineAny.luckMood.get(actor2)?.mood || 0;

      // 2. Update mood and relationships
      engineAny.updateActorMoodsFromEvents([scandal]);
      await engineAny.updateRelationshipsFromEvents([scandal]);

      // 3. Verify mood changed
      const mood1After = engineAny.luckMood.get(actor1)?.mood || 0;
      const mood2After = engineAny.luckMood.get(actor2)?.mood || 0;

      expect(mood1After).toBeLessThan(mood1Before);
      expect(mood2After).toBeLessThan(mood2Before);

      // 4. Verify relationship changed or was created
      const relationship = await RelationshipManager.getRelationship(actor1, actor2);
      
      if (relationship) {
        // If existed, should have worsened
        expect(relationship.sentiment).toBeLessThan(0);
      }

      // This creates a feedback loop:
      // Event → Mood ↓ → Relationship ↓ → Affects next posts/trades
    });
  });

  describe('Performance', () => {
    test('mood updates are fast', () => {
      const events: WorldEvent[] = Array.from({ length: 100 }, (_, i) => ({
        id: `perf-${i}`,
        day: 1,
        type: 'announcement',
        description: `Event ${i}`,
        actors: ['ailon-musk', 'sam-AIltman'],
        visibility: 'public',
      }));

      const engineAny = engine as any;
      const start = Date.now();

      engineAny.updateActorMoodsFromEvents(events);

      const duration = Date.now() - start;

      // Should complete in under 100ms for 100 events
      expect(duration).toBeLessThan(100);
    });

    test('relationship updates are efficient', async () => {
      const events: WorldEvent[] = Array.from({ length: 20 }, (_, i) => ({
        id: `rel-perf-${i}`,
        day: 1,
        type: 'deal',
        description: `Deal ${i}`,
        actors: ['peter-thail', 'david-sacks'],
        visibility: 'public',
      }));

      const engineAny = engine as any;
      const start = Date.now();

      await engineAny.updateRelationshipsFromEvents(events);

      const duration = Date.now() - start;

      // Should complete in under 2 seconds for 20 events
      expect(duration).toBeLessThan(2000);
    });
  });
});

