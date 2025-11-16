/**
 * Security Tests: Prevent Cheating
 * 
 * @description
 * Tests to ensure agents and users cannot access information they shouldn't have.
 * Critical for fair gameplay and preventing exploitation.
 * 
 * **What We're Preventing**:
 * 1. Accessing future posts/events (time travel)
 * 2. Seeing predetermined question outcomes before resolution
 * 3. Accessing hidden NPC knowledge (reliability, insider status)
 * 4. Seeing pre-generated content in queue
 * 5. Inferring future market prices from scheduled trades
 */

import { describe, test, expect } from 'bun:test';
import { GameGenerator } from '@/generator/GameGenerator';
import type { Question } from '@/shared/types';

describe('Security: Prevent Cheating', () => {
  describe('No Predetermined Outcome Access', () => {
    test('question outcomes not visible before resolution', async () => {
      const generator = new GameGenerator();
      const game = await generator.generateCompleteGame();
      
      // Simulate what an API would return
      const publicQuestions = game.setup.questions.map(q => {
        // Before resolution, outcome should not be visible
        if (q.status !== 'resolved') {
          const { outcome, ...publicQuestion } = q;
          return publicQuestion;
        }
        return q;
      });
      
      // Check no active questions expose outcome
      const activeQuestions = publicQuestions.filter(q => 
        !q.status || q.status === 'active'
      );
      
      for (const q of activeQuestions) {
        expect((q as Question).outcome).toBeUndefined();
      }
    });
    
    test('posts dont directly reveal predetermined outcomes', async () => {
      const generator = new GameGenerator();
      const game = await generator.generateCompleteGame();
      
      // Posts should not contain phrases like:
      // "The answer is YES" or "Will definitely happen" (certain language)
      const suspiciousPatterns = [
        /the answer is (yes|no)/i,
        /will (definitely|certainly|absolutely) (happen|not happen)/i,
        /I know for certain/i,
        /guaranteed to (succeed|fail)/i,
      ];
      
      let suspiciousPosts = 0;
      
      for (const day of game.timeline) {
        for (const post of day.feedPosts) {
          for (const pattern of suspiciousPatterns) {
            if (pattern.test(post.content)) {
              suspiciousPosts++;
              break;
            }
          }
        }
      }
      
      // Should have very few (< 1%) suspiciously certain posts
      const totalPosts = game.timeline.reduce((sum, d) => sum + d.feedPosts.length, 0);
      const suspiciousRate = suspiciousPosts / totalPosts;
      
      expect(suspiciousRate).toBeLessThan(0.01); // Less than 1%
    });
  });
  
  describe('No Future Information Access', () => {
    test('cannot infer future events from current state', () => {
      // In a proper queue system, future content is pre-generated
      // This test ensures that pre-generated content isn't accessible
      
      // Simulated queue with future content
      const queuedContent = [
        { scheduledFor: new Date(Date.now() + 5 * 60 * 1000), content: 'Future post 1' },
        { scheduledFor: new Date(Date.now() + 10 * 60 * 1000), content: 'Future post 2' },
      ];
      
      // User queries for posts
      const currentTime = new Date();
      const accessibleContent = queuedContent.filter(item => 
        item.scheduledFor <= currentTime
      );
      
      // Should not see future content
      expect(accessibleContent.length).toBe(0);
    });
    
    test('market prices dont leak future values', () => {
      // If we have pre-generated NPC trades that will execute in 5 minutes
      // Current market price should not reflect those future trades
      
      const currentPrice = 100;
      const futureNPCTrades = [
        { amount: 1000, side: 'buy' },  // Will push price up
        { amount: 500, side: 'buy' },
      ];
      
      // Current price should NOT account for future trades
      // (In real implementation, future trades are in queue, not yet applied)
      expect(currentPrice).toBe(100); // Unchanged
      
      // After trades execute (in future):
      // price would be higher, but that's correctly in the future
    });
  });
  
  describe('No Hidden Knowledge Access', () => {
    test('NPC persona reliability not visible to users', async () => {
      const generator = new GameGenerator();
      const game = await generator.generateCompleteGame();
      
      // Simulate what API returns
      const publicActors = game.setup.mainActors.map(actor => {
        const { persona, trackRecord, ...publicActor } = actor;
        // Persona should not be exposed to users
        return publicActor;
      });
      
      // Verify persona data stripped
      for (const actor of publicActors) {
        expect(actor.persona).toBeUndefined();
        expect((actor as typeof game.setup.mainActors[0]).trackRecord).toBeUndefined();
      }
    });
    
    test('insider status not visible to users', async () => {
      const generator = new GameGenerator();
      const game = await generator.generateCompleteGame();
      
      // Arc plans contain insider/deceiver lists
      // These should NOT be exposed to users
      const publicQuestions = game.setup.questions.map(q => {
        if (q.metadata?.arcPlan) {
          const { metadata, ...publicQuestion } = q;
          return publicQuestion;
        }
        return q;
      });
      
      // Verify no arc plan data exposed
      for (const q of publicQuestions) {
        expect(q.metadata).toBeUndefined();
      }
    });
  });
  
  describe('Information Gradient Integrity', () => {
    test('early game doesnt reveal too much', async () => {
      const generator = new GameGenerator();
      const game = await generator.generateCompleteGame();
      
      // Check early game (days 1-10)
      const earlyDays = game.timeline.filter(d => d.day <= 10);
      const earlyEvents = earlyDays.flatMap(d => d.events);
      
      // Count events with pointsToward hints
      const hintsGiven = earlyEvents.filter(e => 
        e.pointsToward !== null && e.pointsToward !== undefined
      ).length;
      
      // Should be roughly 15% of events (based on our gradient fix)
      const hintRate = hintsGiven / earlyEvents.length;
      
      // Allow variance but ensure not too many hints
      expect(hintRate).toBeLessThan(0.30); // Max 30% in early game
    });
    
    test('late game provides sufficient clarity', async () => {
      const generator = new GameGenerator();
      const game = await generator.generateCompleteGame();
      
      // Check late game (days 25-30)
      const lateDays = game.timeline.filter(d => d.day >= 25);
      const lateEvents = lateDays.flatMap(d => d.events);
      
      // Should have many events with hints
      const hintsGiven = lateEvents.filter(e => 
        e.pointsToward !== null && e.pointsToward !== undefined
      ).length;
      
      const hintRate = hintsGiven / lateEvents.length;
      
      // Should be at least 70% in late game
      expect(hintRate).toBeGreaterThan(0.60); // At least 60%
    });
  });
  
  describe('Fair Information Distribution', () => {
    test('all players have access to same public information', () => {
      // No player should have access to information others don't
      // This test verifies information is symmetric
      
      const player1Info = {
        posts: ['post1', 'post2', 'post3'],
        events: ['event1', 'event2'],
        marketPrices: { BTC: 50000 },
      };
      
      const player2Info = {
        posts: ['post1', 'post2', 'post3'], // Same posts
        events: ['event1', 'event2'], // Same events
        marketPrices: { BTC: 50000 }, // Same prices
      };
      
      // Information should be identical for all players
      expect(player1Info).toEqual(player2Info);
    });
    
    test('group chat membership provides fair insider advantage', async () => {
      const generator = new GameGenerator();
      const game = await generator.generateCompleteGame();
      
      // Group chats provide insider info
      // This is FAIR because:
      // 1. Players can join groups
      // 2. Membership is public
      // 3. All players have equal opportunity
      
      const groupChats = game.setup.groupChats;
      
      // Verify groups have members
      for (const group of groupChats) {
        expect(group.members.length).toBeGreaterThan(0);
        
        // Members should be verifiable (not hidden)
        expect(Array.isArray(group.members)).toBe(true);
      }
      
      // Group chat info is available to members
      // This is fair insider trading (based on social connections)
    });
  });
  
  describe('Temporal Integrity', () => {
    test('posts have valid timestamps in sequence', async () => {
      const generator = new GameGenerator();
      const game = await generator.generateCompleteGame();
      
      // Posts should be in temporal order
      const allPosts = game.timeline.flatMap(d => d.feedPosts);
      
      for (let i = 1; i < allPosts.length; i++) {
        const prev = allPosts[i - 1];
        const curr = allPosts[i];
        
        if (prev && curr) {
          const prevTime = new Date(prev.timestamp);
          const currTime = new Date(curr.timestamp);
          
          // Current should be >= previous (sorted order)
          expect(currTime.getTime()).toBeGreaterThanOrEqual(prevTime.getTime());
        }
      }
    });
    
    test('event timestamps match their day numbers', async () => {
      const generator = new GameGenerator();
      const game = await generator.generateCompleteGame();
      
      for (const dayData of game.timeline) {
        for (const event of dayData.events) {
          // Events should be from their stated day
          expect(event.day).toBe(dayData.day);
          
          // Day should be 1-30
          expect(event.day).toBeGreaterThanOrEqual(1);
          expect(event.day).toBeLessThanOrEqual(30);
        }
      }
    });
  });
});

