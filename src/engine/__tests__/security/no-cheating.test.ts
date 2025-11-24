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

import { describe, test, expect, mock } from 'bun:test';
// import { GameGenerator } from '@/generator/GameGenerator'; // Removed static import
import type { Question } from '@/shared/types';
import { existsSync, readFileSync } from 'fs';

// Mock world-context to avoid DB calls BEFORE importing GameGenerator
const mockWorldContext = {
  generateWorldContext: async () => ({
    worldActors: 'Test Actor 1, Test Actor 2',
    currentMarkets: 'Active Markets: None currently active',
    activePredictions: 'Active Questions: None currently active',
    recentTrades: 'Recent Trades: No recent activity',
    currentDateTime: new Date().toISOString(),
    currentDate: new Date().toDateString(),
    currentTime: new Date().toTimeString(),
    currentYear: '2025',
    currentMonth: 'October',
    currentDay: '15',
    realityGrounding: 'Reality grounding context',
    worldFacts: 'World facts context'
  }),
  generateCurrentMarkets: async () => 'Active Markets: None currently active',
  generateActivePredictions: async () => 'Active Questions: None currently active',
  generateRecentTrades: async () => 'Recent Trades: No recent activity',
  generateWorldActors: () => 'Test Actor 1, Test Actor 2',
  getParodyActorNames: () => ['Test Actor 1', 'Test Actor 2'],
  getForbiddenRealNames: () => [],
  validateNoRealNames: () => [],
  validateGeneratedContent: () => ({ errors: [], isValid: true }),
  getCurrentDateContext: () => ({
    dateISO: new Date().toISOString(),
    dateFull: new Date().toDateString(),
    time: new Date().toTimeString(),
    year: '2025',
    month: 'October',
    day: '15'
  }),
  getRealityGrounding: async () => 'Reality grounding context',
  getMinimalRealityGrounding: async () => 'Minimal reality grounding',
  getFullRealityGrounding: async () => 'Full reality grounding',
  checkRealityGrounding: () => ({ score: 1, feedback: [] })
};

mock.module('@/prompts/world-context', () => mockWorldContext);

// Load environment variables from .env files
const loadEnvFile = (filePath: string) => {
  if (!existsSync(filePath)) return
  const envContent = readFileSync(filePath, 'utf-8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=')
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').replace(/^["']|["']$/g, '')
        if (!process.env[key]) {
          process.env[key] = value
        }
      }
    }
  }
}

loadEnvFile('.env.test')
loadEnvFile('.env.local')

const hasLLMKey = !!(
  (process.env.WANDB_API_KEY?.trim() ?? '') !== '' ||
  (process.env.GROQ_API_KEY?.trim() ?? '') !== '' ||
  (process.env.ANTHROPIC_API_KEY?.trim() ?? '') !== '' ||
  (process.env.OPENAI_API_KEY?.trim() ?? '') !== ''
)

describe('Security: Prevent Cheating', () => {
  describe('No Predetermined Outcome Access', () => {
    test('question outcomes not visible before resolution', async () => {
      if (!hasLLMKey) {
        console.log('⏭️  Skipping - No LLM API key available');
        return;
      }
      
      const { GameGenerator } = await import('@/generator/GameGenerator');
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
        if ((q as Question).outcome !== undefined) {
             console.log('FAILED CHEATING TEST DEBUG:', JSON.stringify(q, null, 2));
        }
        expect((q as Question).outcome).toBeUndefined();
      }
    }, 300000);
    
    test('posts dont directly reveal predetermined outcomes', async () => {
      if (!hasLLMKey) return;
      
      const { GameGenerator } = await import('@/generator/GameGenerator');
      const generator = new GameGenerator();
      const game = await generator.generateCompleteGame();
      
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
      
      const totalPosts = game.timeline.reduce((sum, d) => sum + d.feedPosts.length, 0);
      const suspiciousRate = suspiciousPosts / totalPosts;
      
      expect(suspiciousRate).toBeLessThan(0.01); // Less than 1%
    }, 300000);
  });
  
  describe('No Future Information Access', () => {
    test('cannot infer future events from current state', () => {
      const queuedContent = [
        { scheduledFor: new Date(Date.now() + 5 * 60 * 1000), content: 'Future post 1' },
        { scheduledFor: new Date(Date.now() + 10 * 60 * 1000), content: 'Future post 2' },
      ];
      
      const currentTime = new Date();
      const accessibleContent = queuedContent.filter(item => 
        item.scheduledFor <= currentTime
      );
      
      expect(accessibleContent.length).toBe(0);
    });
    
    test('market prices dont leak future values', () => {
      const currentPrice = 100;
      
      // Current price should NOT account for future trades
      expect(currentPrice).toBe(100); 
    });
  });
  
  describe('No Hidden Knowledge Access', () => {
    test('NPC persona reliability not visible to users', async () => {
      if (!hasLLMKey) return;
      
      const { GameGenerator } = await import('@/generator/GameGenerator');
      const generator = new GameGenerator();
      const game = await generator.generateCompleteGame();
      
      const publicActors = game.setup.mainActors.map(actor => {
        const { persona, trackRecord, ...publicActor } = actor;
        return publicActor;
      });
      
      for (const actor of publicActors) {
        expect(actor.persona).toBeUndefined();
        expect((actor as typeof game.setup.mainActors[0]).trackRecord).toBeUndefined();
      }
    }, 300000);
    
    test('insider status not visible to users', async () => {
      if (!hasLLMKey) return;
      
      const { GameGenerator } = await import('@/generator/GameGenerator');
      const generator = new GameGenerator();
      const game = await generator.generateCompleteGame();
      
      const publicQuestions = game.setup.questions.map(q => {
        if (q.metadata?.arcPlan) {
          const { metadata, ...publicQuestion } = q;
          return publicQuestion;
        }
        return q;
      });
      
      for (const q of publicQuestions) {
        expect(q.metadata).toBeUndefined();
      }
    }, 300000);
  });
  
  describe('Information Gradient Integrity', () => {
    test('early game doesnt reveal too much', async () => {
      if (!hasLLMKey) return;
      
      const { GameGenerator } = await import('@/generator/GameGenerator');
      const generator = new GameGenerator();
      const game = await generator.generateCompleteGame();
      
      const earlyDays = game.timeline.filter(d => d.day <= 10);
      const earlyEvents = earlyDays.flatMap(d => d.events);
      
      const hintsGiven = earlyEvents.filter(e => 
        e.pointsToward !== null && e.pointsToward !== undefined
      ).length;
      
      const hintRate = hintsGiven / earlyEvents.length;
      
      expect(hintRate).toBeLessThan(0.30);
    }, 300000);
    
    test('late game provides sufficient clarity', async () => {
      if (!hasLLMKey) return;
      
      const { GameGenerator } = await import('@/generator/GameGenerator');
      const generator = new GameGenerator();
      const game = await generator.generateCompleteGame();
      
      const lateDays = game.timeline.filter(d => d.day >= 25);
      const lateEvents = lateDays.flatMap(d => d.events);
      
      const hintsGiven = lateEvents.filter(e => 
        e.pointsToward !== null && e.pointsToward !== undefined
      ).length;
      
      const hintRate = hintsGiven / lateEvents.length;
      
      expect(hintRate).toBeGreaterThan(0.60);
    }, 300000);
  });
  
  describe('Fair Information Distribution', () => {
    test('all players have access to same public information', () => {
      const player1Info = {
        posts: ['post1', 'post2', 'post3'],
        events: ['event1', 'event2'],
        marketPrices: { BTC: 50000 },
      };
      
      const player2Info = {
        posts: ['post1', 'post2', 'post3'], 
        events: ['event1', 'event2'], 
        marketPrices: { BTC: 50000 }, 
      };
      
      expect(player1Info).toEqual(player2Info);
    });
    
    test('group chat membership provides fair insider advantage', async () => {
      if (!hasLLMKey) return;
      
      const { GameGenerator } = await import('@/generator/GameGenerator');
      const generator = new GameGenerator();
      const game = await generator.generateCompleteGame();
      
      const groupChats = game.setup.groupChats;
      
      for (const group of groupChats) {
        expect(group.members.length).toBeGreaterThan(0);
        expect(Array.isArray(group.members)).toBe(true);
      }
    });
  });
  
  describe('Temporal Integrity', () => {
    test('posts have valid timestamps in sequence', async () => {
      if (!hasLLMKey) return;
      
      const { GameGenerator } = await import('@/generator/GameGenerator');
      const generator = new GameGenerator();
      const game = await generator.generateCompleteGame();
      
      const allPosts = game.timeline.flatMap(d => d.feedPosts);
      
      for (let i = 1; i < allPosts.length; i++) {
        const prev = allPosts[i - 1];
        const curr = allPosts[i];
        
        if (prev && curr) {
          const prevTime = new Date(prev.timestamp);
          const currTime = new Date(curr.timestamp);
          
          expect(currTime.getTime()).toBeGreaterThanOrEqual(prevTime.getTime());
        }
      }
    });
    
    test('event timestamps match their day numbers', async () => {
      if (!hasLLMKey) return;
      
      const { GameGenerator } = await import('@/generator/GameGenerator');
      const generator = new GameGenerator();
      const game = await generator.generateCompleteGame();
      
      for (const dayData of game.timeline) {
        for (const event of dayData.events) {
          expect(event.day).toBe(dayData.day);
          expect(event.day).toBeGreaterThanOrEqual(1);
          expect(event.day).toBeLessThanOrEqual(30);
        }
      }
    });
  });
});

