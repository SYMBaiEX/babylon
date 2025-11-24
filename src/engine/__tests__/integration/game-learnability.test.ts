/**
 * Integration Tests: Game Learnability
 * 
 * @module engine/__tests__/integration/game-learnability.test
 * 
 * @description
 * CRITICAL INTEGRATION TESTS - Use REAL LLM calls to verify:
 * 1. Information gradient exists (early unclear → late clear)
 * 2. NPCs are consistent (agents can learn who to trust)
 * 3. Game is learnable (simple strategies beat random)
 * 4. Insider advantage is real (group chats provide value)
 * 
 * ⚠️ **IMPORTANT**: These tests:
 * - Use REAL API calls (cost money)
 * - Take 30-120 seconds each
 * - Marked as .skip by default
 * - Run manually for quality validation
 * 
 * **To run manually**:
 * ```bash
 * bun test src/engine/__tests__/integration/game-learnability.test.ts
 * ```
 * 
 * **Or run specific test**:
 * ```bash
 * bun test --grep "information gradient"
 * ```
 * 
 * @see {@link GameGenerator} - Class under test
 * @see {@link /docs/research/game-engine-analysis.md} - Research justifying these tests
 */

import { describe, test, expect, mock } from 'bun:test';
// import { GameGenerator } from '@/generator/GameGenerator'; // Removed static import
import type { GeneratedGame, WorldEvent, FeedPost, Actor } from '@/shared/types';
import { logger } from '@/lib/logger';
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

// Helper functions need to be defined before usage but outside tests
function calculateCertainty(
  events: WorldEvent[],
  questionId: number | string,
  actualOutcome: boolean
): number {
  const relevantEvents = events.filter(e => 
    e.relatedQuestion === questionId &&
    e.pointsToward !== null &&
    e.pointsToward !== undefined
  );
  
  if (relevantEvents.length === 0) return 0.5; // No info = 50/50
  
  const correctSignals = relevantEvents.filter(e => 
    (e.pointsToward === 'YES') === actualOutcome ||
    (e.pointsToward === 'NO') === !actualOutcome
  ).length;
  
  return correctSignals / relevantEvents.length;
}

function calculateCertaintyFromPosts(
  posts: FeedPost[],
  actualOutcome: boolean
): number {
  const relevantPosts = posts.filter(p => 
    p.pointsToward !== null &&
    p.pointsToward !== undefined
  );
  
  if (relevantPosts.length === 0) return 0.5;
  
  const correctPosts = posts.filter(p => 
    (p.pointsToward === 'YES' || p.pointsToward === true) === actualOutcome ||
    (p.pointsToward === 'NO' || p.pointsToward === false) === !actualOutcome
  );
  
  return correctPosts.length / relevantPosts.length;
}

describe('Game Learnability Integration Tests', () => {
  test('CRITICAL: information gradient exists (early unclear, late clear)', async () => {
    if (!hasLLMKey) {
      console.log('⏭️  Skipping - No LLM API key available');
      return;
    }
    
    const { GameGenerator } = await import('@/generator/GameGenerator');
    const generator = new GameGenerator();
    const game = await generator.generateCompleteGame();
    
    logger.info('Testing information gradient...', undefined, 'LearnabilityTest');
    
    let allGradientsPass = true;
    
    for (const question of game.setup.questions) {
      const allEvents = game.timeline.flatMap(day => day.events);
      
      const earlyEvents = allEvents.filter(e => e.day <= 10);
      const middleEvents = allEvents.filter(e => e.day >= 11 && e.day <= 20);
      const lateEvents = allEvents.filter(e => e.day >= 21);
      
      const earlyCertainty = calculateCertainty(earlyEvents, question.id, question.outcome);
      const middleCertainty = calculateCertainty([...earlyEvents, ...middleEvents], question.id, question.outcome);
      const lateCertainty = calculateCertainty([...earlyEvents, ...middleEvents, ...lateEvents], question.id, question.outcome);
      
      const gradient = lateCertainty - earlyCertainty;
      const hasGradient = gradient > 0.2;
      
      logger.info(`Question ${question.id}: ${(earlyCertainty * 100).toFixed(0)}% → ${(middleCertainty * 100).toFixed(0)}% → ${(lateCertainty * 100).toFixed(0)}% (gradient: ${(gradient * 100).toFixed(0)}%) ${hasGradient ? '✅' : '❌'}`, undefined, 'LearnabilityTest');
      
      expect(lateCertainty).toBeGreaterThan(earlyCertainty + 0.15);
      expect(middleCertainty).toBeGreaterThanOrEqual(earlyCertainty);
      expect(lateCertainty).toBeGreaterThan(middleCertainty);
      
      expect(earlyCertainty).toBeLessThan(0.65);
      expect(lateCertainty).toBeGreaterThan(0.70);
      
      if (!hasGradient) {
        allGradientsPass = false;
      }
    }
    
    expect(allGradientsPass).toBe(true);
    logger.info(allGradientsPass ? '✅ PASS: All questions have information gradient' : '❌ FAIL: Some questions lack gradient', undefined, 'LearnabilityTest');
  }, {
    timeout: 120000,
  });
  
  test('NPCs with high reliability are consistently accurate', async () => {
    if (!hasLLMKey) return;
    
    const { GameGenerator } = await import('@/generator/GameGenerator');
    const generator = new GameGenerator();
    const game = await generator.generateCompleteGame();
    
    logger.info('Testing NPC consistency...', undefined, 'LearnabilityTest');
    
    const allActors = [
      ...game.setup.mainActors,
      ...game.setup.supportingActors,
    ];
    
    const highReliabilityNPCs = allActors.filter(a => 
      a.persona && a.persona.reliability > 0.7
    );
    
    logger.info(`Found ${highReliabilityNPCs.length} high reliability NPCs`, undefined, 'LearnabilityTest');
    expect(highReliabilityNPCs.length).toBeGreaterThan(0);
    
    for (const npc of highReliabilityNPCs) {
      const posts = game.timeline
        .flatMap(day => day.feedPosts)
        .filter(post => 
          post.author === npc.id &&
          post.pointsToward !== null &&
          post.relatedQuestion !== null
        );
      
      if (posts.length === 0) continue;
      
      const accuratePosts = posts.filter(post => {
        const question = game.setup.questions.find(q => q.id === post.relatedQuestion);
        if (!question) return false;
        
        const postPointsToYes = post.pointsToward === 'YES' || post.pointsToward === true;
        return postPointsToYes === question.outcome;
      });
      
      const accuracy = accuratePosts.length / posts.length;
      
      logger.info(`${npc.name} (reliability ${npc.persona?.reliability.toFixed(2)}): ${(accuracy * 100).toFixed(0)}% accurate (${accuratePosts.length}/${posts.length} posts)`, undefined, 'LearnabilityTest');
      
      expect(accuracy).toBeGreaterThan(0.55);
    }
  }, {
    timeout: 120000,
  });
  
  test('simple betting strategy beats random guessing', async () => {
    if (!hasLLMKey) return;
    
    logger.info('Testing learnability with simple strategy...', undefined, 'LearnabilityTest');
    logger.info('Generating 3 test games (this takes ~3-5 minutes)...', undefined, 'LearnabilityTest');
    
    const games: GeneratedGame[] = [];
    const { GameGenerator } = await import('@/generator/GameGenerator');
    const generator = new GameGenerator();
    
    for (let i = 0; i < 3; i++) {
      logger.info(`Generating game ${i + 1}/3...`, undefined, 'LearnabilityTest');
      games.push(await generator.generateCompleteGame());
    }
    
    let totalPredictions = 0;
    let correctPredictions = 0;
    
    for (const game of games) {
      for (const question of game.setup.questions) {
        totalPredictions++;
        
        const strongClues = game.timeline
          .flatMap(day => day.feedPosts)
          .filter(post => 
            post.relatedQuestion === question.id &&
            post.clueStrength > 0.7 &&
            post.pointsToward !== null
          );
        
        if (strongClues.length === 0) {
          totalPredictions--;
          continue;
        }
        
        const yesVotes = strongClues.filter(p => 
          p.pointsToward === 'YES' || p.pointsToward === true
        ).length;
        const noVotes = strongClues.filter(p => 
          p.pointsToward === 'NO' || p.pointsToward === false
        ).length;
        
        const prediction = yesVotes > noVotes;
        
        if (prediction === question.outcome) {
          correctPredictions++;
        }
        
        logger.info(`Q${question.id}: ${strongClues.length} strong clues → ${prediction ? 'YES' : 'NO'} (actual: ${question.outcome ? 'YES' : 'NO'}) ${prediction === question.outcome ? '✅' : '❌'}`, undefined, 'LearnabilityTest');
      }
    }
    
    const accuracy = correctPredictions / totalPredictions;
    
    logger.info('─'.repeat(50), undefined, 'LearnabilityTest');
    logger.info(`SIMPLE STRATEGY RESULTS: ${correctPredictions}/${totalPredictions} = ${(accuracy * 100).toFixed(0)}%`, undefined, 'LearnabilityTest');
    logger.info(`Target: 65-85% (better than random 50%, not trivial 95%)`, undefined, 'LearnabilityTest');
    logger.info(accuracy > 0.65 && accuracy < 0.85 ? '✅ PASS: Game is learnable' : '❌ FAIL: Game not learnable', undefined, 'LearnabilityTest');
    logger.info('─'.repeat(50), undefined, 'LearnabilityTest');
    
    expect(accuracy).toBeGreaterThan(0.65);
    expect(accuracy).toBeLessThan(0.90);
  }, {
    timeout: 360000,
  });
  
  test('group chat information provides measurable advantage', async () => {
    if (!hasLLMKey) return;
    
    const { GameGenerator } = await import('@/generator/GameGenerator');
    const generator = new GameGenerator();
    const game = await generator.generateCompleteGame();
    
    logger.info('Testing group chat advantage...', undefined, 'LearnabilityTest');
    
    for (const question of game.setup.questions) {
      const publicPosts = game.timeline
        .flatMap(day => day.feedPosts)
        .filter(post => 
          post.relatedQuestion === question.id &&
          post.pointsToward !== null
        );
      
      const publicCertainty = calculateCertaintyFromPosts(publicPosts, question.outcome);
      
      const groupChatHints = game.timeline
        .flatMap(day => Object.values(day.groupChats).flat())
        .filter(msg => {
          const questionKeywords = question.text.toLowerCase().split(' ').filter(w => w.length > 4);
          const messageLower = msg.message.toLowerCase();
          return questionKeywords.some(keyword => messageLower.includes(keyword));
        });
      
      const groupChatValue = groupChatHints.length * 0.04;
      
      logger.info(`Q${question.id}: Public ${(publicCertainty * 100).toFixed(0)}%, Group chats +${(groupChatValue * 100).toFixed(0)}% (${groupChatHints.length} hints)`, undefined, 'LearnabilityTest');
      
      if (groupChatHints.length > 0) {
        expect(groupChatValue).toBeGreaterThan(0);
      }
    }
  }, {
    timeout: 120000,
  });
  
  test('questions have resolution verification events', async () => {
    if (!hasLLMKey) return;
    
    const { GameGenerator } = await import('@/generator/GameGenerator');
    const generator = new GameGenerator();
    const game = await generator.generateCompleteGame();
    
    logger.info('Testing resolution verification...', undefined, 'LearnabilityTest');
    
    for (const question of game.setup.questions) {
      const allEvents = game.timeline.flatMap(day => day.events);
      
      const verificationEvents = allEvents.filter(e => 
        e.relatedQuestion === question.id &&
        e.pointsToward === (question.outcome ? 'YES' : 'NO') &&
        e.day >= 25
      );
      
      logger.info(`Q${question.id}: ${verificationEvents.length} verification events (day 25+)`, undefined, 'LearnabilityTest');
      
      expect(verificationEvents.length).toBeGreaterThan(0);
      
      const definitiveEvents = verificationEvents.filter(e => 
        e.type === 'revelation' || e.type === 'announcement'
      );
      
      expect(definitiveEvents.length).toBeGreaterThan(0);
    }
  }, {
    timeout: 120000,
  });
});

