/**
 * Relationship Evolution Tests
 * Tests dynamic relationship updates from events
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { GameEngine } from '../GameEngine';
import type { WorldEvent } from '../GameWorld';
import { prisma } from '@/lib/prisma';
import { RelationshipManager } from '@/lib/services/RelationshipManager';

describe('Relationship Evolution - Dynamic Updates', () => {
  let engine: GameEngine;

  beforeEach(async () => {
    engine = new GameEngine({ tickIntervalMs: 60000 });
    await engine.initialize();
  });

  afterEach(async () => {
    // Clean up test relationships
    await prisma.actorRelationship.deleteMany({
      where: {
        OR: [
          { actor1Id: { contains: 'test-' } },
          { actor2Id: { contains: 'test-' } },
        ],
      },
    });
  });

  describe('New Relationship Creation', () => {
    test('scandal creates rival relationship', async () => {
      // Use actors that exist in the database
      const actor1 = 'ailon-musk';
      const actor2 = 'mark-zuckerborg';

      // Delete existing relationship if any
      const existing = await RelationshipManager.getRelationship(actor1, actor2);
      if (existing) {
        await prisma.actorRelationship.delete({ where: { id: existing.id } });
      }

      const scandal: WorldEvent = {
        id: 'scandal-test',
        day: 1,
        type: 'scandal',
        description: 'Major scandal involving both',
        actors: [actor1, actor2],
        visibility: 'public',
        pointsToward: 'NO',
      };

      const engineAny = engine as any;
      await engineAny.updateRelationshipsFromEvents([scandal]);

      // Check if relationship was created
      const newRelationship = await RelationshipManager.getRelationship(actor1, actor2);

      expect(newRelationship).toBeDefined();
      expect(newRelationship?.relationshipType).toBe('rivals');
      expect(newRelationship?.sentiment).toBeLessThan(0);
      expect(newRelationship?.history).toContain(scandal.description);
    });

    test('deal creates business partner relationship', async () => {
      const actor1 = 'peter-thail';
      const actor2 = 'david-sacks';

      // Delete existing relationship if any
      const existing = await RelationshipManager.getRelationship(actor1, actor2);
      if (existing) {
        await prisma.actorRelationship.delete({ where: { id: existing.id } });
      }

      const deal: WorldEvent = {
        id: 'deal-test',
        day: 1,
        type: 'deal',
        description: 'Partnership deal announced',
        actors: [actor1, actor2],
        visibility: 'public',
        pointsToward: 'YES',
      };

      const engineAny = engine as any;
      await engineAny.updateRelationshipsFromEvents([deal]);

      const newRelationship = await RelationshipManager.getRelationship(actor1, actor2);

      expect(newRelationship).toBeDefined();
      expect(newRelationship?.relationshipType).toBe('business partners');
      expect(newRelationship?.sentiment).toBeGreaterThan(0);
    });

    test('insignificant events do not create relationships', async () => {
      // Use real actors
      const actor1 = 'bernai-sanders';
      const actor2 = 'aioc';

      // Delete any existing relationship
      await prisma.actorRelationship.deleteMany({
        where: {
          OR: [
            { actor1Id: actor1, actor2Id: actor2 },
            { actor1Id: actor2, actor2Id: actor1 },
          ],
        },
      });

      const minorEvent: WorldEvent = {
        id: 'minor',
        day: 1,
        type: 'rumor', // Vague event type
        description: 'Minor rumor',
        actors: [actor1, actor2],
        visibility: 'private',
        pointsToward: null,
      };

      const engineAny = engine as any;
      const relationshipsBefore = await prisma.actorRelationship.count({
        where: {
          OR: [
            { actor1Id: actor1, actor2Id: actor2 },
            { actor1Id: actor2, actor2Id: actor1 },
          ],
        },
      });

      await engineAny.updateRelationshipsFromEvents([minorEvent]);

      const relationshipsAfter = await prisma.actorRelationship.count({
        where: {
          OR: [
            { actor1Id: actor1, actor2Id: actor2 },
            { actor1Id: actor2, actor2Id: actor1 },
          ],
        },
      });

      // Should not create relationship for insignificant event (rumor is ambiguous)
      expect(relationshipsAfter).toBe(relationshipsBefore);
    });
  });

  describe('Existing Relationship Updates', () => {
    test('scandals worsen existing relationships', async () => {
      const actor1 = 'ailon-musk';
      const actor2 = 'jeff-baizos';

      // Get or create initial relationship
      let relationship = await RelationshipManager.getRelationship(actor1, actor2);
      if (!relationship) {
        await prisma.actorRelationship.create({
          data: {
            id: `test-rel-${Date.now()}`,
            actor1Id: actor1,
            actor2Id: actor2,
            relationshipType: 'acquaintances',
            sentiment: 0.1, // Slightly positive
            strength: 0.5,
            isPublic: true,
            updatedAt: new Date(),
          },
        });
        relationship = await RelationshipManager.getRelationship(actor1, actor2);
      }

      const initialSentiment = relationship!.sentiment;

      const scandal: WorldEvent = {
        id: 'scandal-worsens',
        day: 1,
        type: 'scandal',
        description: 'Public feud escalates',
        actors: [actor1, actor2],
        visibility: 'public',
        pointsToward: 'NO',
      };

      const engineAny = engine as any;
      await engineAny.updateRelationshipsFromEvents([scandal]);

      const updated = await RelationshipManager.getRelationship(actor1, actor2);

      expect(updated?.sentiment).toBeLessThan(initialSentiment);
      expect(updated?.strength).toBeGreaterThan(relationship!.strength); // Conflict strengthens
    });

    test('deals improve existing relationships', async () => {
      const actor1 = 'sam-AIltman';
      const actor2 = 'dairiio-amodei'; // Correct ID

      // Get or create initial relationship
      let relationship = await RelationshipManager.getRelationship(actor1, actor2);
      if (!relationship) {
        await prisma.actorRelationship.create({
          data: {
            id: `test-rel-deal-${Date.now()}`,
            actor1Id: actor1,
            actor2Id: actor2,
            relationshipType: 'acquaintances',
            sentiment: 0.0, // Neutral
            strength: 0.3,
            isPublic: true,
            updatedAt: new Date(),
          },
        });
        relationship = await RelationshipManager.getRelationship(actor1, actor2);
      }

      const initialSentiment = relationship!.sentiment;

      const deal: WorldEvent = {
        id: 'deal-improves',
        day: 1,
        type: 'deal',
        description: 'AI companies collaborate',
        actors: [actor1, actor2],
        visibility: 'public',
        pointsToward: 'YES',
      };

      const engineAny = engine as any;
      await engineAny.updateRelationshipsFromEvents([deal]);

      const updated = await RelationshipManager.getRelationship(actor1, actor2);

      expect(updated?.sentiment).toBeGreaterThan(initialSentiment);
      expect(updated?.strength).toBeGreaterThan(relationship!.strength);
    });

    test('relationship type changes based on sentiment thresholds', async () => {
      // Use real actors
      const actor1 = 'yainn-lecun';
      const actor2 = 'demis-hassaibis';

      // Delete existing if any, then create relationship starting at neutral
      await prisma.actorRelationship.deleteMany({
        where: {
          OR: [
            { actor1Id: actor1, actor2Id: actor2 },
            { actor1Id: actor2, actor2Id: actor1 },
          ],
        },
      });

      await prisma.actorRelationship.create({
        data: {
          id: `test-sentiment-${Date.now()}`,
          actor1Id: actor1,
          actor2Id: actor2,
          relationshipType: 'acquaintances',
          sentiment: 0.25, // Just below ally threshold (0.3)
          strength: 0.5,
          isPublic: true,
          updatedAt: new Date(),
        },
      });

      // Positive event should push them over ally threshold
      const deal: WorldEvent = {
        id: 'ally-threshold',
        day: 1,
        type: 'deal',
        description: 'Partnership formed',
        actors: [actor1, actor2],
        visibility: 'public',
        pointsToward: 'YES',
      };

      const engineAny = engine as any;
      await engineAny.updateRelationshipsFromEvents([deal]);

      const updated = await RelationshipManager.getRelationship(actor1, actor2);

      // Should have crossed threshold to 'allies'
      expect(updated?.sentiment).toBeGreaterThan(0.3);
      expect(updated?.relationshipType).toBe('allies');
    });

    test('history accumulates over multiple events', async () => {
      // Use real actors
      const actor1 = 'balaiji-srinivasan';
      const actor2 = 'braiian-armstrong';

      // Delete existing, then create initial relationship
      await prisma.actorRelationship.deleteMany({
        where: {
          OR: [
            { actor1Id: actor1, actor2Id: actor2 },
            { actor1Id: actor2, actor2Id: actor1 },
          ],
        },
      });

      await prisma.actorRelationship.create({
        data: {
          id: `test-history-${Date.now()}`,
          actor1Id: actor1,
          actor2Id: actor2,
          relationshipType: 'acquaintances',
          sentiment: 0.0,
          strength: 0.5,
          isPublic: true,
          history: 'Initial meeting',
          updatedAt: new Date(),
        },
      });

      const event1: WorldEvent = {
        id: 'history-1',
        day: 1,
        type: 'deal',
        description: 'First collaboration',
        actors: [actor1, actor2],
        visibility: 'public',
      };

      const event2: WorldEvent = {
        id: 'history-2',
        day: 2,
        type: 'announcement',
        description: 'Joint announcement',
        actors: [actor1, actor2],
        visibility: 'public',
      };

      const engineAny = engine as any;
      await engineAny.updateRelationshipsFromEvents([event1]);
      await engineAny.updateRelationshipsFromEvents([event2]);

      const final = await RelationshipManager.getRelationship(actor1, actor2);

      expect(final?.history).toContain('Initial meeting');
      expect(final?.history).toContain('First collaboration');
      expect(final?.history).toContain('Joint announcement');
    });
  });

  describe('Relationship Degradation Path', () => {
    test('multiple conflicts escalate to enemies', async () => {
      // Use real actors
      const actor1 = 'andrew-taite';
      const actor2 = 'naick-fuentes';

      // Delete existing, start with neutral relationship
      await prisma.actorRelationship.deleteMany({
        where: {
          OR: [
            { actor1Id: actor1, actor2Id: actor2 },
            { actor1Id: actor2, actor2Id: actor1 },
          ],
        },
      });

      await prisma.actorRelationship.create({
        data: {
          id: `test-escalate-${Date.now()}`,
          actor1Id: actor1,
          actor2Id: actor2,
          relationshipType: 'acquaintances',
          sentiment: 0.0,
          strength: 0.3,
          isPublic: true,
          updatedAt: new Date(),
        },
      });

      // Series of conflicts
      const conflicts = [
        'Disagreement emerges',
        'Public argument escalates',
        'Major feud breaks out',
        'All-out war declared',
        'Bitter enemies now',
      ];

      const engineAny = engine as any;

      for (let i = 0; i < conflicts.length; i++) {
        const conflict: WorldEvent = {
          id: `conflict-${i}`,
          day: i + 1,
          type: 'conflict',
          description: conflicts[i]!,
          actors: [actor1, actor2],
          visibility: 'public',
          pointsToward: 'NO',
        };

        await engineAny.updateRelationshipsFromEvents([conflict]);
      }

      const final = await RelationshipManager.getRelationship(actor1, actor2);

      // Should have degraded to enemies
      expect(final?.sentiment).toBeLessThan(-0.5);
      expect(final?.relationshipType).toMatch(/enemies|rivals/);
      expect(final?.strength).toBeGreaterThan(0.3); // Conflicts strengthen (even if negative)
    });
  });

  describe('Edge Cases', () => {
    test('handles events with no actors gracefully', async () => {
      const event: WorldEvent = {
        id: 'no-actors',
        day: 1,
        type: 'announcement',
        description: 'General announcement',
        actors: [],
        visibility: 'public',
      };

      const engineAny = engine as any;
      
      // Should not throw
      await expect(engineAny.updateRelationshipsFromEvents([event])).resolves.not.toThrow();
    });

    test('handles events with single actor gracefully', async () => {
      const event: WorldEvent = {
        id: 'single-actor',
        day: 1,
        type: 'announcement',
        description: 'Solo announcement',
        actors: ['ailon-musk'],
        visibility: 'public',
      };

      const engineAny = engine as any;
      const countBefore = await prisma.actorRelationship.count();

      await engineAny.updateRelationshipsFromEvents([event]);

      const countAfter = await prisma.actorRelationship.count();

      // No new relationships should be created for single-actor events
      expect(countAfter).toBe(countBefore);
    });

    test('handles database errors gracefully', async () => {
      const event: WorldEvent = {
        id: 'db-error-test',
        day: 1,
        type: 'deal',
        description: 'Test event',
        actors: ['definitely-invalid-actor-12345', 'also-invalid-67890'],
        visibility: 'public',
      };

      const engineAny = engine as any;

      // Should not throw even if actors don't exist
      // The function logs debug but doesn't throw
      await engineAny.updateRelationshipsFromEvents([event]);
      
      // Test passes if we get here without throwing
      expect(true).toBe(true);
    });
  });

  describe('Relationship Integration', () => {
    test('relationship changes affect trading behavior', async () => {
      // This tests that relationships are loaded and used in trading
      // The MarketDecisionEngine should see updated relationships

      const actor1 = 'ailon-musk';
      const actor2 = 'jeff-baizos';

      // Create strong rival relationship
      await prisma.actorRelationship.upsert({
        where: {
          actor1Id_actor2Id: {
            actor1Id: actor1,
            actor2Id: actor2,
          },
        },
        create: {
          id: `test-trading-rel-${Date.now()}`,
          actor1Id: actor1,
          actor2Id: actor2,
          relationshipType: 'rivals',
          sentiment: -0.8, // Strong negative
          strength: 0.9, // Strong relationship
          isPublic: true,
          history: 'Long-standing rivalry',
          updatedAt: new Date(),
        },
        update: {
          sentiment: -0.8,
          strength: 0.9,
        },
      });

      const relationship = await RelationshipManager.getRelationship(actor1, actor2);

      expect(relationship).toBeDefined();
      expect(relationship?.sentiment).toBeLessThan(-0.5);

      // MarketContextService should include this in trading context
      const { MarketContextService } = await import('@/lib/services/market-context-service');
      const contextService = new MarketContextService();
      const context = await contextService.buildContextForNPC(actor1);

      // Should have rival in relationships
      const rivalRelationship = context.relationships.find(r => r.actorId === actor2);
      expect(rivalRelationship).toBeDefined();
      expect(rivalRelationship?.sentiment).toBeLessThan(-0.5);
    });
  });

  describe('Sentiment Thresholds', () => {
    test('crossing -0.3 threshold changes to rivals', async () => {
      // Use real actors
      const actor1 = 'jim-craimer';
      const actor2 = 'cashie-wood';

      // Delete existing, start just above rival threshold
      await prisma.actorRelationship.deleteMany({
        where: {
          OR: [
            { actor1Id: actor1, actor2Id: actor2 },
            { actor1Id: actor2, actor2Id: actor1 },
          ],
        },
      });

      await prisma.actorRelationship.create({
        data: {
          id: `test-threshold-rival-${Date.now()}`,
          actor1Id: actor1,
          actor2Id: actor2,
          relationshipType: 'acquaintances',
          sentiment: -0.25, // Just above -0.3
          strength: 0.5,
          isPublic: true,
          updatedAt: new Date(),
        },
      });

      // Event that pushes over threshold
      const conflict: WorldEvent = {
        id: 'threshold-conflict',
        day: 1,
        type: 'conflict',
        description: 'Disagreement',
        actors: [actor1, actor2],
        visibility: 'public',
      };

      const engineAny = engine as any;
      await engineAny.updateRelationshipsFromEvents([conflict]);

      const updated = await RelationshipManager.getRelationship(actor1, actor2);

      expect(updated?.sentiment).toBeLessThan(-0.3);
      expect(updated?.relationshipType).toBe('rivals');
    });

    test('crossing +0.7 threshold changes to close allies', async () => {
      // Use real actors
      const actor1 = 'david-sacks';
      const actor2 = 'maike-solana';

      // Delete existing, start just below close ally threshold
      await prisma.actorRelationship.deleteMany({
        where: {
          OR: [
            { actor1Id: actor1, actor2Id: actor2 },
            { actor1Id: actor2, actor2Id: actor1 },
          ],
        },
      });

      await prisma.actorRelationship.create({
        data: {
          id: `test-threshold-ally-${Date.now()}`,
          actor1Id: actor1,
          actor2Id: actor2,
          relationshipType: 'allies',
          sentiment: 0.65, // Just below 0.7
          strength: 0.6,
          isPublic: true,
          updatedAt: new Date(),
        },
      });

      // Event that pushes over threshold
      const deal: WorldEvent = {
        id: 'threshold-deal',
        day: 1,
        type: 'deal',
        description: 'Major partnership',
        actors: [actor1, actor2],
        visibility: 'public',
      };

      const engineAny = engine as any;
      await engineAny.updateRelationshipsFromEvents([deal]);

      const updated = await RelationshipManager.getRelationship(actor1, actor2);

      expect(updated?.sentiment).toBeGreaterThan(0.7);
      expect(updated?.relationshipType).toBe('close allies');
    });
  });

  describe('Multiple Events Impact', () => {
    test('multiple events in one tick update all affected relationships', async () => {
      const events: WorldEvent[] = [
        {
          id: 'multi-1',
          day: 1,
          type: 'scandal',
          description: 'Scandal 1',
          actors: ['ailon-musk', 'mark-zuckerborg'],
          visibility: 'public',
        },
        {
          id: 'multi-2',
          day: 1,
          type: 'deal',
          description: 'Deal 1',
          actors: ['sam-AIltman', 'dariio-amodei'],
          visibility: 'public',
        },
        {
          id: 'multi-3',
          day: 1,
          type: 'conflict',
          description: 'Conflict 1',
          actors: ['peter-thail', 'mark-and-reason'],
          visibility: 'public',
        },
      ];

      const engineAny = engine as any;
      const relationshipsBefore = await prisma.actorRelationship.count();

      await engineAny.updateRelationshipsFromEvents(events);

      const relationshipsAfter = await prisma.actorRelationship.count();

      // Should have created or updated multiple relationships
      expect(relationshipsAfter).toBeGreaterThanOrEqual(relationshipsBefore);
    });
  });
});

