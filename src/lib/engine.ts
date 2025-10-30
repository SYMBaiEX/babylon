/**
 * Babylon Game Engine - Complete System
 * 
 * Consolidated engine that handles everything:
 * - Continuous generation (posts, events, questions)
 * - Stock price updates (Markov + sentiment)
 * - Prediction market cadence (24h/3d/7d/30d)
 * - AMM pricing for predictions
 * - Database persistence
 * 
 * Single file, complete functionality.
 */

// Load environment variables FIRST before any other imports
import 'dotenv/config';

import { BabylonLLMClient } from '@/generator/llm/openai-client';
import { PriceEngine } from '@/engine/PriceEngine';
import type { FeedPost, WorldEvent } from '@/shared/types';
import { shuffleArray } from '@/shared/utils';
import { db } from './database-service';
import { PredictionPricing } from './prediction-pricing';

// ============================================================================
// TYPES
// ============================================================================

interface PredictionCadence {
  duration: '24h' | '3d' | '7d' | '30d';
  maxActive: number;
  creationInterval: number;
  lastCreated: Date | null;
}

// ============================================================================
// PREDICTION CADENCE MANAGER
// ============================================================================

class PredictionCadenceManager {
  private llm: BabylonLLMClient;
  private cadences: Map<string, PredictionCadence>;
  private nextQuestionNumber = 1;

  constructor(llm: BabylonLLMClient) {
    this.llm = llm;
    
    this.cadences = new Map([
      ['24h', { duration: '24h', maxActive: 6, creationInterval: 4 * 60 * 60 * 1000, lastCreated: null }],
      ['3d', { duration: '3d', maxActive: 4, creationInterval: 18 * 60 * 60 * 1000, lastCreated: null }],
      ['7d', { duration: '7d', maxActive: 3, creationInterval: 56 * 60 * 60 * 1000, lastCreated: null }],
      ['30d', { duration: '30d', maxActive: 2, creationInterval: 15 * 24 * 60 * 60 * 1000, lastCreated: null }],
    ]);
  }

  async processCadence(): Promise<{ resolved: number; created: number }> {
    let resolvedCount = 0;
    let createdCount = 0;

    // Resolve expired questions
    const toResolve = await db.getQuestionsToResolve();
    for (const question of toResolve) {
      await this.resolveQuestion(question);
      resolvedCount++;
    }

    // Create new questions on schedule
    for (const [, cadence] of this.cadences) {
      if (await this.shouldCreateQuestion(cadence)) {
        if (await this.createQuestion(cadence)) {
          cadence.lastCreated = new Date();
          createdCount++;
        }
      }
    }

    return { resolved: resolvedCount, created: createdCount };
  }

  private async shouldCreateQuestion(cadence: PredictionCadence): Promise<boolean> {
    const daysMap = { '24h': 1, '3d': 3, '7d': 7, '30d': 30 };
    const days = daysMap[cadence.duration];
    
    const allActive = await db.getActiveQuestions();
    const activeOfType = allActive.filter((q: any) => {
      const resTime = new Date(q.resolutionDate).getTime();
      const targetTime = Date.now() + days * 24 * 60 * 60 * 1000;
      return Math.abs(resTime - targetTime) < 12 * 60 * 60 * 1000;
    });

    if (activeOfType.length >= cadence.maxActive) return false;
    if (cadence.lastCreated && Date.now() - cadence.lastCreated.getTime() < cadence.creationInterval) {
      return false;
    }

    return true;
  }

  private async createQuestion(cadence: PredictionCadence): Promise<boolean> {
    try {
      const actors = await db.getAllActors();
      const orgs = await db.getAllOrganizations();
      const daysMap = { '24h': 1, '3d': 3, '7d': 7, '30d': 30 };
      const resolutionDate = new Date(Date.now() + daysMap[cadence.duration] * 24 * 60 * 60 * 1000);

      const prompt = this.buildPrompt(cadence.duration, actors, orgs);
      const response = await this.llm.generateJSON<{ question: string; expectedOutcome: boolean }>(
        prompt,
        undefined,
        { temperature: 0.9, maxTokens: 500 }
      );

      // Strict validation - no fallbacks
      if (!response.question || typeof response.question !== 'string' || response.question.trim().length === 0) {
        throw new Error(`LLM returned invalid question: ${JSON.stringify(response)}`);
      }
      
      if (response.expectedOutcome === undefined || typeof response.expectedOutcome !== 'boolean') {
        throw new Error(`LLM returned invalid expectedOutcome: ${JSON.stringify(response)}`);
      }

      await db.createQuestion({
        id: `q-${cadence.duration}-${this.nextQuestionNumber}`,
        questionNumber: this.nextQuestionNumber++,
        text: response.question,
        scenario: 1,
        outcome: response.expectedOutcome,
        rank: 1,
        createdDate: new Date().toISOString(),
        resolutionDate: resolutionDate.toISOString(),
        status: 'active',
      } as any);

      console.log(`    ✓ Created ${cadence.duration} question: "${response.question.slice(0, 50)}..."`);
      return true;
    } catch (error) {
      console.error(`    ❌ Failed to create ${cadence.duration} question:`, error);
      return false;
    }
  }

  private async resolveQuestion(question: any): Promise<void> {
    try {
      const event = await this.generateResolutionEvent(question);
      
      await db.createEvent({
        id: `resolution-${question.id}`,
        eventType: 'revelation',
        description: event,
        actors: [],
        relatedQuestion: question.questionNumber,
        pointsToward: question.outcome ? 'YES' : 'NO',
        visibility: 'public',
        gameId: 'continuous',
        dayNumber: Math.floor((Date.now() - new Date('2025-10-01').getTime()) / (1000 * 60 * 60 * 24)),
      });
      
      await db.resolveQuestion(question.id, question.outcome);
      console.log(`    ✓ Resolved: "${question.text}" → ${question.outcome ? 'YES' : 'NO'}`);
    } catch (error) {
      console.error('    ❌ Failed to resolve question:', error);
    }
  }

  private async generateResolutionEvent(question: any): Promise<string> {
    try {
      const response = await this.llm.generateJSON<{ event: string }>(
        `Generate a brief resolution event (max 120 chars) for: "${question.text}" → ${question.outcome ? 'YES' : 'NO'}. JSON: {"event": "..."}`,
        undefined,
        { temperature: 0.7, maxTokens: 300 }
      );
      return response.event || `Resolved: ${question.outcome ? 'YES' : 'NO'}`;
    } catch {
      return `Resolved: ${question.outcome ? 'YES' : 'NO'}`;
    }
  }

  private buildPrompt(duration: string, actors: any[], orgs: any[]): string {
    const timeframes = { '24h': 'within 24 hours', '3d': 'within 3 days', '7d': 'within 7 days', '30d': 'within 30 days' };
    const actorList = actors.slice(0, 20).map(a => a.name).join(', ');
    const companyList = orgs.filter((o: any) => o.type === 'company').slice(0, 15).map((o: any) => o.name).join(', ');

    return `Generate ONE prediction market question that will resolve ${timeframes[duration as keyof typeof timeframes]}.

ACTORS: ${actorList}
COMPANIES: ${companyList}

The question MUST:
- Be a clear YES/NO question
- Mention specific actors or companies
- Be measurable and resolvable
- Be satirical but realistic

Examples:
- "Will Elon's Husk tweet about Mars colonization?"
- "Will NVIDIOT stock price reach $1,500?"
- "Will Mork Zorkorborg announce metaverse legs feature?"

You MUST respond with valid JSON in this EXACT format:
{
  "question": "Will [specific actor] do [specific action]?",
  "expectedOutcome": true
}

The question field MUST be a non-empty string. The expectedOutcome MUST be a boolean.`;
  }
}

// ============================================================================
// MAIN ENGINE
// ============================================================================

export class BabylonEngine {
  private llm: BabylonLLMClient;
  private priceEngine: PriceEngine;
  private predictionCadence: PredictionCadenceManager;
  private intervalId?: NodeJS.Timeout;
  private isRunning = false;
  private initialized = false;

  constructor() {
    this.llm = new BabylonLLMClient();
    this.priceEngine = new PriceEngine(Date.now());
    this.predictionCadence = new PredictionCadenceManager(this.llm);
  }

  // ========== INITIALIZATION ==========

  async initialize() {
    if (this.initialized) return;

    console.log('\n🎮 BABYLON ENGINE: Initializing...\n');

    try {
      // Check database
      await db.getStats();
      console.log('✅ Database connected');

      // Initialize game state
      const gameState = await db.getGameState();
      if (!gameState) {
        await db.initializeGame();
        console.log('✅ Game state initialized');
      } else {
        console.log(`✅ Game state loaded (Day ${gameState.currentDay})`);
      }

      // Initialize price engine
      const orgs = await db.getAllOrganizations();
      this.priceEngine.initializeCompanies(orgs as any);
      console.log(`💰 Initialized ${orgs.filter((o: any) => o.type === 'company').length} company prices`);

      // Show stats
      const stats = await db.getStats();
      console.log(`\n📊 Stats: ${stats.totalPosts} posts, ${stats.activeQuestions}/${stats.totalQuestions} questions, ${stats.totalActors} actors\n`);

      this.initialized = true;
    } catch (error) {
      console.error('❌ Initialization failed:', error);
      throw error;
    }
  }

  // ========== START/STOP ==========

  async start() {
    if (this.isRunning) return;

    await this.initialize();
    
    this.isRunning = true;
    console.log('🚀 Engine started (60s ticks)\n');

    // First tick after 5s
    setTimeout(() => this.tick(), 5000);

    // Then every 60s
    this.intervalId = setInterval(() => this.tick(), 60000);
  }

  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
    this.isRunning = false;
    console.log('🛑 Engine stopped');
  }

  // ========== MAIN TICK ==========

  private async tick() {
    const timestamp = new Date();
    console.log(`⏰ [${timestamp.toISOString()}] Tick...`);

    try {
      // 1. Process prediction cadence
      const cadence = await this.predictionCadence.processCadence();
      if (cadence.resolved > 0) console.log(`  🎯 Resolved ${cadence.resolved} questions`);
      if (cadence.created > 0) console.log(`  📝 Created ${cadence.created} questions`);

      // 2. Get active questions
      const activeQuestions = await db.getActiveQuestions();
      console.log(`  📊 Active: ${activeQuestions.length} questions`);

      // 3. Generate events
      const events = await this.generateEvents(activeQuestions);
      if (events.length > 0) {
        console.log(`  🌍 Generated ${events.length} events`);
        for (const event of events) {
          await db.createEvent({
            id: event.id,
            eventType: event.type,
            description: event.description,
            actors: event.actors,
            relatedQuestion: event.relatedQuestion || undefined,
            pointsToward: event.pointsToward || undefined,
            visibility: event.visibility,
            gameId: 'continuous',
            dayNumber: Math.floor((timestamp.getTime() - new Date('2025-10-01').getTime()) / (1000 * 60 * 60 * 24)),
          });
        }
      }

      // 4. Update stock prices
      const priceUpdates = await this.updateAllStockPrices(events, activeQuestions);
      if (priceUpdates > 0) console.log(`  💰 Updated ${priceUpdates} prices`);

      // 5. Generate posts
      const posts = await this.generatePosts(events, activeQuestions);
      if (posts.length > 0) {
        await db.createManyPosts(posts.map(p => ({
          ...p,
          gameId: 'continuous',
          dayNumber: Math.floor((timestamp.getTime() - new Date('2025-10-01').getTime()) / (1000 * 60 * 60 * 24)),
        })));
        console.log(`  📱 Generated ${posts.length} posts`);
      }

      // 6. Update game state
      await db.updateGameState({
        lastTickAt: timestamp,
        activeQuestions: activeQuestions.length,
      });

    } catch (error) {
      console.error('  ❌ Tick failed:', error);
    }
  }

  // ========== EVENT GENERATION ==========

  private async generateEvents(questions: any[]): Promise<WorldEvent[]> {
    if (questions.length === 0) return [];

    const events: WorldEvent[] = [];
    const numEvents = 1 + Math.floor(Math.random() * 3);
    
    for (let i = 0; i < numEvents; i++) {
      const question = questions[Math.floor(Math.random() * questions.length)];
      if (!question) continue;

      const actors = await db.getAllActors();
      const involvedActors = shuffleArray(actors as any[]).slice(0, 2);
      
      try {
        const response = await this.llm.generateJSON<{ event: string }>(
          `Brief event (max 120 chars) for: "${question.text}" pointing ${question.outcome ? 'YES' : 'NO'}. JSON: {"event": "..."}`,
          undefined,
          { temperature: 0.9, maxTokens: 200 }
        );

        events.push({
          id: `event-${Date.now()}-${i}`,
          type: Math.random() > 0.7 ? 'scandal' : Math.random() > 0.5 ? 'announcement' : 'meeting',
          description: response.event || `Event: ${question.text}`,
          actors: involvedActors.map((a: any) => a.id).filter(Boolean),
          relatedQuestion: question.questionNumber,
          pointsToward: question.outcome ? 'YES' : 'NO',
          visibility: 'public',
        });
      } catch (error) {
        // Skip on error
      }
    }

    return events;
  }

  // ========== PRICE UPDATES ==========

  private async updateAllStockPrices(events: WorldEvent[], questions: any[]): Promise<number> {
    let updateCount = 0;
    const orgs = await db.getAllOrganizations();
    const companies = orgs.filter((o: any) => o.type === 'company');
    const marketSentiment = this.calculateMarketSentiment(events, questions);
    
    for (const company of companies) {
      try {
        const companyId = (company as any).id;
        const currentPrice = (company as any).currentPrice || (company as any).initialPrice || 100;
        
        // Calculate price change (Markov + sentiment)
        const volatility = 0.0001 + Math.random() * 0.0009; // 0.01-0.1% per minute
        const trendBias = marketSentiment * 0.0002;
        const randomWalk = (Math.random() - 0.5) * 2;
        let priceChange = currentPrice * (trendBias + randomWalk * volatility);
        
        // Clamp to ±1% per minute
        priceChange = Math.max(-currentPrice * 0.01, Math.min(currentPrice * 0.01, priceChange));
        
        const newPrice = Math.max(0.01, currentPrice + priceChange);
        const changePercent = (priceChange / currentPrice) * 100;
        
        // Update database
        await db.updateOrganizationPrice(companyId, newPrice);
        await db.recordPriceUpdate(companyId, newPrice, priceChange, changePercent);
        
        updateCount++;
      } catch (error) {
        // Skip on error
      }
    }
    
    return updateCount;
  }

  private calculateMarketSentiment(events: WorldEvent[], questions: any[]): number {
    let sentiment = 0;
    let count = 0;
    
    for (const event of events) {
      if (event.pointsToward === 'YES') sentiment += 0.5;
      else if (event.pointsToward === 'NO') sentiment -= 0.5;
      
      if (event.type === 'deal' || event.type === 'announcement') sentiment += 0.3;
      if (event.type === 'scandal' || event.type === 'conflict') sentiment -= 0.3;
      
      count++;
    }
    
    const questionBias = Math.min(0, (questions.length - 10) * -0.05);
    sentiment += questionBias * count;
    
    return count > 0 ? Math.max(-1, Math.min(1, sentiment / count)) : 0;
  }

  // ========== POST GENERATION ==========

  private async generatePosts(events: WorldEvent[], questions: any[]): Promise<FeedPost[]> {
    const posts: FeedPost[] = [];
    const numPosts = 10 + Math.floor(Math.random() * 11);
    
    const actors = await db.getAllActors();
    if (actors.length === 0) return posts;

    const postingActors = shuffleArray(actors).slice(0, numPosts) as any[];
    const validActors = postingActors.filter((a: any) => a?.id && a?.name);
    
    if (validActors.length === 0) return posts;
    
    try {
      const recentEvents = events.slice(0, 3).map(e => e.description).join('; ');
      const activeQuestionsList = questions.slice(0, 5).map((q: any) => q.text).join('; ');
      
      const contextNote = events.length > 0 || questions.length > 0
        ? `\nRECENT: ${recentEvents || 'None'}\nQUESTIONS: ${activeQuestionsList || 'None'}\n`
        : '';

      const actorPrompts = validActors
        .map((a: any, i: number) => `${i + 1}. ${a.name}: ${a.description || ''}
${a.postStyle || ''}
Examples: ${a.postExample?.slice(0, 2).join('; ') || 'None'}
Post (max 280 chars):`)
        .join('\n\n');

      const prompt = `Generate ${validActors.length} social media posts. ONE per actor.${contextNote}

${actorPrompts}

You MUST respond with a JSON array of ${validActors.length} STRINGS (not objects).

Correct format:
{
  "posts": [
    "Post text 1",
    "Post text 2",
    "Post text 3"
  ]
}

WRONG (do NOT do this):
{
  "posts": [
    {"author": "X", "content": "..."},  // ❌ NO OBJECTS
    {"text": "..."}  // ❌ NO OBJECTS
  ]
}

Generate ${validActors.length} post STRINGS now:`;

      const response = await this.llm.generateJSON<{ posts: string[] }>(
        prompt,
        undefined,
        { temperature: 1.0, maxTokens: 3000 }
      );

      // Strict validation - no fallbacks
      if (!response.posts || !Array.isArray(response.posts)) {
        throw new Error(`LLM returned invalid posts array: ${JSON.stringify(response)}`);
      }
      validActors.forEach((actor: any, i: number) => {
        const postContent = response.posts[i];
        
        // Strict validation
        if (!postContent || typeof postContent !== 'string') {
          throw new Error(`LLM returned non-string post at index ${i}: ${typeof postContent}`);
        }
        
        posts.push({
          id: `post-${Date.now()}-${actor.id}`,
          day: Math.floor((Date.now() - new Date('2025-10-01').getTime()) / (1000 * 60 * 60 * 24)),
          timestamp: new Date().toISOString(),
          type: 'post',
          content: postContent,
          author: actor.id,
          authorName: actor.name,
          sentiment: Math.random() * 2 - 1,
          clueStrength: Math.random(),
          pointsToward: Math.random() > 0.5,
        });
      });
    } catch (error) {
      console.error('  ❌ Post generation failed:', error);
    }

    return posts;
  }

  // ========== STATUS ==========

  getStatus() {
    return {
      isRunning: this.isRunning,
      initialized: this.initialized,
    };
  }

  async getStats() {
    return await db.getStats();
  }
}

// ============================================================================
// SINGLETON EXPORTS
// ============================================================================

let engineInstance: BabylonEngine | null = null;

export function getEngine(): BabylonEngine {
  // Only instantiate on server side
  if (typeof window !== 'undefined') {
    throw new Error('BabylonEngine can only be instantiated on the server side');
  }
  
  if (!engineInstance) {
    engineInstance = new BabylonEngine();
  }
  return engineInstance;
}

// Re-export pricing for convenience (safe for client-side)
export { PredictionPricing as pricing };

// Auto-start on server (with delay to ensure env vars loaded)
if (typeof window === 'undefined') {
  // Check for API key before starting
  const hasApiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
  
  if (!hasApiKey) {
    console.error('\n❌ BABYLON ENGINE: No API key found!');
    console.error('   Set GROQ_API_KEY or OPENAI_API_KEY in .env file');
    console.error('   Then restart: bun run dev\n');
  } else {
    // Start after a short delay to ensure Next.js is fully initialized
    setTimeout(() => {
      getEngine().start().catch(error => {
        console.error('❌ Engine failed to start:', error);
      });
    }, 2000);
  }
}

