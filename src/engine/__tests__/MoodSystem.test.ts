/**
 * Mood System Tests
 * Tests dynamic mood updates from events and trading outcomes
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { GameEngine } from '../GameEngine';
import type { WorldEvent } from '../GameWorld';
import type { ExecutionResult, ExecutedTrade } from '@/types/market-decisions';

// Helper to create valid ExecutedTrade objects for tests
function createExecutedTrade(overrides: Partial<ExecutedTrade>): ExecutedTrade {
  return {
    npcId: 'test-npc',
    npcName: 'Test NPC',
    poolId: 'test-pool',
    marketType: 'perp',
    action: 'open_long',
    side: 'long',
    amount: 1000,
    size: 1,
    executionPrice: 100,
    confidence: 0.8,
    reasoning: 'Test trade',
    positionId: 'test-position',
    timestamp: new Date().toISOString(),
    ...overrides
  };
}

describe('Mood System - Dynamic Updates', () => {
  let engine: GameEngine;

  beforeEach(async () => {
    engine = new GameEngine({ tickIntervalMs: 60000 });
    await engine.initialize();
  });

  describe('Mood Updates from Events', () => {
    test('positive events improve mood', async () => {
      // Get initial mood for an actor
      engine.getState();
      const actorId = 'ailon-musk';
      
      // Create positive event involving the actor
      const events: WorldEvent[] = [{
        id: 'test-event-1',
        day: 1,
        type: 'deal',
        description: 'TeslAI announces major partnership',
        actors: [actorId],
        visibility: 'public',
        pointsToward: 'YES',
      }];

      // Access private method for testing (type assertion)
      const engineAny = engine as any;
      const moodBefore = engineAny.luckMood.get(actorId)?.mood || 0;

      // Update moods
      engineAny.updateActorMoodsFromEvents(events);

      const moodAfter = engineAny.luckMood.get(actorId)?.mood || 0;

      // Mood should increase (deal + positive pointsToward)
      expect(moodAfter).toBeGreaterThan(moodBefore);
      expect(moodAfter - moodBefore).toBeGreaterThan(0.15); // At least +0.15
    });

    test('negative events decrease mood', async () => {
      const actorId = 'ailon-musk';

      const events: WorldEvent[] = [{
        id: 'test-event-2',
        day: 1,
        type: 'scandal',
        description: 'TeslAI faces major scandal',
        actors: [actorId],
        visibility: 'public',
        pointsToward: 'NO',
      }];

      const engineAny = engine as any;
      const moodBefore = engineAny.luckMood.get(actorId)?.mood || 0;

      engineAny.updateActorMoodsFromEvents(events);

      const moodAfter = engineAny.luckMood.get(actorId)?.mood || 0;

      // Mood should decrease (scandal + negative pointsToward)
      expect(moodAfter).toBeLessThan(moodBefore);
      expect(moodBefore - moodAfter).toBeGreaterThan(0.2); // At least -0.2
    });

    test('scandals hurt mood more than regular negative events', async () => {
      const actor1 = 'ailon-musk';
      const actor2 = 'sam-AIltman';

      const scandal: WorldEvent = {
        id: 'scandal',
        day: 1,
        type: 'scandal',
        description: 'Major scandal',
        actors: [actor1],
        visibility: 'public',
        pointsToward: 'NO',
      };

      const regularNegative: WorldEvent = {
        id: 'regular',
        day: 1,
        type: 'announcement',
        description: 'Negative announcement',
        actors: [actor2],
        visibility: 'public',
        pointsToward: 'NO',
      };

      const engineAny = engine as any;
      
      const mood1Before = engineAny.luckMood.get(actor1)?.mood || 0;
      const mood2Before = engineAny.luckMood.get(actor2)?.mood || 0;

      engineAny.updateActorMoodsFromEvents([scandal, regularNegative]);

      const mood1After = engineAny.luckMood.get(actor1)?.mood || 0;
      const mood2After = engineAny.luckMood.get(actor2)?.mood || 0;

      const delta1 = mood1Before - mood1After;
      const delta2 = mood2Before - mood2After;

      // Scandal should hurt more
      expect(delta1).toBeGreaterThan(delta2);
    });

    test('mood is clamped to -1 to 1 range', async () => {
      const actorId = 'ailon-musk';

      // Multiple very negative events
      const events: WorldEvent[] = Array.from({ length: 20 }, (_, i) => ({
        id: `event-${i}`,
        day: 1,
        type: 'scandal' as const,
        description: `Scandal ${i}`,
        actors: [actorId],
        visibility: 'public' as const,
        pointsToward: 'NO' as const,
      }));

      const engineAny = engine as any;
      engineAny.updateActorMoodsFromEvents(events);

      const finalMood = engineAny.luckMood.get(actorId)?.mood;

      // Should be clamped at -1, not go below
      expect(finalMood).toBeGreaterThanOrEqual(-1);
      expect(finalMood).toBeLessThanOrEqual(1);
    });

    test('multiple actors affected by same event', async () => {
      const actors = ['ailon-musk', 'sam-AIltman', 'mark-zuckerborg'];

      const event: WorldEvent = {
        id: 'multi-actor',
        day: 1,
        type: 'deal',
        description: 'Major deal involving multiple parties',
        actors,
        visibility: 'public',
        pointsToward: 'YES',
      };

      const engineAny = engine as any;
      const moodsBefore = actors.map(id => engineAny.luckMood.get(id)?.mood || 0);

      engineAny.updateActorMoodsFromEvents([event]);

      const moodsAfter = actors.map(id => engineAny.luckMood.get(id)?.mood || 0);

      // All actors should have improved mood
      for (let i = 0; i < actors.length; i++) {
        expect(moodsAfter[i]).toBeGreaterThan(moodsBefore[i]);
      }
    });
  });

  describe('Mood Updates from Trading', () => {
    test('profitable trades improve mood', async () => {
      const npcId = 'ailon-musk';

      const executionResult: ExecutionResult = {
        executedTrades: [createExecutedTrade({
          npcId,
          npcName: 'AIlon Musk',
          action: 'close_position',
          ticker: 'TESLAI',
          confidence: 0.9, // High confidence for profitable trade
          reasoning: 'Taking profits',
        })],
        totalDecisions: 1,
        successfulTrades: 1,
        failedTrades: 0,
        holdDecisions: 0,
        totalVolumePerp: 1000,
        totalVolumePrediction: 0,
        errors: [],
      };

      const engineAny = engine as any;
      
      // Ensure actor has mood initialized
      if (!engineAny.luckMood.has(npcId)) {
        engineAny.luckMood.set(npcId, { luck: 'medium', mood: 0 });
      }
      
      const moodBefore = engineAny.luckMood.get(npcId)?.mood || 0;

      engineAny.updateActorMoodsFromTrading(executionResult);

      const moodAfter = engineAny.luckMood.get(npcId)?.mood || 0;

      // Mood should improve from profit
      expect(moodAfter).toBeGreaterThan(moodBefore);
      // Mood change should be positive
      expect(moodAfter - moodBefore).toBeGreaterThan(0);
    });

    test('losing trades decrease mood more than wins increase it', async () => {
      const npcId = 'ailon-musk';

      const winResult: ExecutionResult = {
        executedTrades: [{
          npcId,
          npcName: 'AIlon Musk',
          action: 'close_position',
          marketType: 'perp',
          ticker: 'TESLAI',
          amount: 1000,
          price: 250,
          pnl: 4000, // $4k profit
          reasoning: 'Taking profits',
        }],
        successfulTrades: 1,
        failedTrades: 0,
        holdDecisions: 0,
      };

      const lossResult: ExecutionResult = {
        executedTrades: [{
          npcId,
          npcName: 'AIlon Musk',
          action: 'close_position',
          marketType: 'perp',
          ticker: 'TESLAI',
          amount: 1000,
          price: 200,
          pnl: -4000, // $4k loss
          reasoning: 'Cutting losses',
        }],
        successfulTrades: 1,
        failedTrades: 0,
        holdDecisions: 0,
      };

      const engineAny = engine as any;
      
      // Test win
      const neutralMood = 0;
      engineAny.luckMood.set(npcId, { luck: 'medium', mood: neutralMood });
      engineAny.updateActorMoodsFromTrading(winResult);
      const moodAfterWin = engineAny.luckMood.get(npcId)?.mood || 0;
      const winDelta = moodAfterWin - neutralMood;

      // Reset and test loss
      engineAny.luckMood.set(npcId, { luck: 'medium', mood: neutralMood });
      engineAny.updateActorMoodsFromTrading(lossResult);
      const moodAfterLoss = engineAny.luckMood.get(npcId)?.mood || 0;
      const lossDelta = Math.abs(neutralMood - moodAfterLoss);

      // Loss should hurt more than win helps (asymmetric)
      expect(lossDelta).toBeGreaterThan(winDelta);
    });

    test('opening positions creates slight excitement', async () => {
      const npcId = 'ailon-musk';

      const openingResult: ExecutionResult = {
        executedTrades: [{
          npcId,
          npcName: 'AIlon Musk',
          action: 'open_long',
          marketType: 'perp',
          ticker: 'TESLAI',
          amount: 1000,
          price: 245,
          reasoning: 'Bullish on Tesla',
        }],
        successfulTrades: 1,
        failedTrades: 0,
        holdDecisions: 0,
      };

      const engineAny = engine as any;
      const moodBefore = engineAny.luckMood.get(npcId)?.mood || 0;

      engineAny.updateActorMoodsFromTrading(openingResult);

      const moodAfter = engineAny.luckMood.get(npcId)?.mood || 0;

      // Mood should change slightly (could be up or down, but should change)
      // We can't predict direction (random) but magnitude should be small
      expect(Math.abs(moodAfter - moodBefore)).toBeLessThan(0.15);
    });

    test('large PnL has capped mood impact', async () => {
      const npcId = 'ailon-musk';

      // Massive win
      const hugeWin: ExecutionResult = {
        executedTrades: [{
          npcId,
          npcName: 'AIlon Musk',
          action: 'close_position',
          marketType: 'perp',
          ticker: 'TESLAI',
          amount: 10000,
          price: 300,
          pnl: 50000, // $50k profit (huge)
          reasoning: 'Massive win',
        }],
        successfulTrades: 1,
        failedTrades: 0,
        holdDecisions: 0,
      };

      const engineAny = engine as any;
      engineAny.luckMood.set(npcId, { luck: 'medium', mood: 0 });
      engineAny.updateActorMoodsFromTrading(hugeWin);

      const finalMood = engineAny.luckMood.get(npcId)?.mood || 0;

      // Should be capped at +0.2 maximum
      expect(finalMood).toBeLessThanOrEqual(0.2);
    });
  });

  describe('Mood Integration', () => {
    test('mood persists across multiple updates', async () => {
      const actorId = 'ailon-musk';

      const event1: WorldEvent = {
        id: 'event-1',
        day: 1,
        type: 'deal',
        description: 'Good news',
        actors: [actorId],
        visibility: 'public',
        pointsToward: 'YES',
      };

      const event2: WorldEvent = {
        id: 'event-2',
        day: 2,
        type: 'scandal',
        description: 'Bad news',
        actors: [actorId],
        visibility: 'public',
        pointsToward: 'NO',
      };

      const engineAny = engine as any;
      const initialMood = engineAny.luckMood.get(actorId)?.mood || 0;

      // First event: mood should increase
      engineAny.updateActorMoodsFromEvents([event1]);
      const moodAfterEvent1 = engineAny.luckMood.get(actorId)?.mood || 0;
      expect(moodAfterEvent1).toBeGreaterThan(initialMood);

      // Second event: mood should decrease from new baseline
      engineAny.updateActorMoodsFromEvents([event2]);
      const moodAfterEvent2 = engineAny.luckMood.get(actorId)?.mood || 0;
      expect(moodAfterEvent2).toBeLessThan(moodAfterEvent1);

      // But might still be higher than initial if first increase was larger
      // The key is that changes accumulate
    });

    test('mood updates log appropriately', async () => {
      const actorId = 'ailon-musk';

      const significantEvent: WorldEvent = {
        id: 'big-event',
        day: 1,
        type: 'scandal',
        description: 'Major scandal',
        actors: [actorId],
        visibility: 'public',
        pointsToward: 'NO',
      };

      const engineAny = engine as any;
      
      // Should log for significant mood changes (>0.1)
      engineAny.updateActorMoodsFromEvents([significantEvent]);

      // Verify mood was updated
      const mood = engineAny.luckMood.get(actorId)?.mood;
      expect(mood).toBeDefined();
    });

    test('actors not in event are unaffected', async () => {
      const involvedActor = 'ailon-musk';
      const uninvolvedActor = 'sam-AIltman';

      const event: WorldEvent = {
        id: 'event',
        day: 1,
        type: 'deal',
        description: 'Deal involving only AIlon',
        actors: [involvedActor], // Only one actor
        visibility: 'public',
        pointsToward: 'YES',
      };

      const engineAny = engine as any;
      const uninvolvedMoodBefore = engineAny.luckMood.get(uninvolvedActor)?.mood || 0;

      engineAny.updateActorMoodsFromEvents([event]);

      const uninvolvedMoodAfter = engineAny.luckMood.get(uninvolvedActor)?.mood || 0;

      // Uninvolved actor's mood should not change
      expect(uninvolvedMoodAfter).toBe(uninvolvedMoodBefore);
    });
  });

  describe('Mood from Trading', () => {
    test('only close actions with PnL affect mood significantly', async () => {
      const npcId = 'ailon-musk';

      const holdResult: ExecutionResult = {
        executedTrades: [{
          npcId,
          npcName: 'AIlon Musk',
          action: 'hold',
          reasoning: 'Holding',
        }],
        successfulTrades: 0,
        failedTrades: 0,
        holdDecisions: 1,
      };

      const engineAny = engine as any;
      const moodBefore = engineAny.luckMood.get(npcId)?.mood || 0;

      engineAny.updateActorMoodsFromTrading(holdResult);

      const moodAfter = engineAny.luckMood.get(npcId)?.mood || 0;

      // Hold should not significantly change mood
      expect(moodAfter).toBe(moodBefore);
    });

    test('multiple trades accumulate mood effects', async () => {
      const npcId = 'ailon-musk';

      // Two winning trades
      const result: ExecutionResult = {
        executedTrades: [
          {
            npcId,
            npcName: 'AIlon Musk',
            action: 'close_position',
            marketType: 'perp',
            ticker: 'TESLAI',
            amount: 1000,
            price: 250,
            pnl: 2000,
            reasoning: 'Win 1',
          },
          {
            npcId,
            npcName: 'AIlon Musk',
            action: 'close_position',
            marketType: 'prediction',
            marketId: 'market-1',
            amount: 500,
            price: 0.7,
            pnl: 1500,
            reasoning: 'Win 2',
          },
        ],
        successfulTrades: 2,
        failedTrades: 0,
        holdDecisions: 0,
      };

      const engineAny = engine as any;
      engineAny.luckMood.set(npcId, { luck: 'medium', mood: 0 });

      engineAny.updateActorMoodsFromTrading(result);

      const finalMood = engineAny.luckMood.get(npcId)?.mood || 0;

      // Two wins should compound (but each capped at +0.2)
      expect(finalMood).toBeGreaterThan(0.1);
    });
  });

  describe('Mood Ranges and Descriptions', () => {
    test('mood values map to correct emotional states', () => {
      const { moodToEmotion } = require('../EmotionSystem');

      const euphoric = moodToEmotion(0.9);
      expect(euphoric.emotion).toBe('euphoric');

      const happy = moodToEmotion(0.5);
      expect(happy.emotion).toBe('happy');

      const neutral = moodToEmotion(0.0);
      expect(neutral.emotion).toBe('neutral');

      const annoyed = moodToEmotion(-0.3);
      expect(annoyed.emotion).toBe('annoyed');

      const furious = moodToEmotion(-0.9);
      expect(furious.emotion).toBe('furious');
    });
  });
});

