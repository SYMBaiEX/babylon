/**
 * Realtime Game Engine
 * 
 * Runs continuously at 1x speed, generating content every minute.
 * - 10-20 posts per minute from various actors
 * - Stock prices update every minute
 * - Questions created/resolved in real-time
 * - Keeps rolling 30-day history window
 * - No manual generation needed - just runs
 * 
 * Architecture:
 * - Tick every minute (60 seconds)
 * - Each tick generates 10-20 posts
 * - Updates prices for all companies
 * - Checks for question resolutions
 * - Creates new questions as needed
 * - Persists to database/file
 */

import { EventEmitter } from 'events';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { FeedGenerator } from './FeedGenerator';
import { QuestionManager } from './QuestionManager';
import { PriceEngine } from './PriceEngine';
import { PerpetualsEngine } from './PerpetualsEngine';
import { BabylonLLMClient } from '../generator/llm/openai-client';
import { shuffleArray, toQuestionIdNumberOrNull, toQuestionIdNumber } from '@/shared/utils';
import type {
  SelectedActor,
  Organization,
  Question,
  FeedPost,
  PriceUpdate,
  ActorConnection,
  Scenario,
  GroupChat,
  WorldEvent,
  ActorsDatabase,
} from '@/shared/types';

interface RealtimeConfig {
  tickIntervalMs?: number; // How often to generate (default: 60000 = 1 minute)
  postsPerTick?: number; // How many posts per tick (default: 10-20)
  historyDays?: number; // How many days to keep (default: 30)
  savePath?: string; // Where to save state
}

interface MinuteTick {
  timestamp: string; // ISO timestamp
  posts: FeedPost[];
  priceUpdates: PriceUpdate[];
  events: WorldEvent[];
  questionsResolved: number;
  questionsCreated: number;
}

/**
 * Realtime Game Engine
 * 
 * Continuously running game that generates content every minute
 */
export class RealtimeGameEngine extends EventEmitter {
  private config: Required<RealtimeConfig>;
  private llm: BabylonLLMClient;
  private feedGenerator: FeedGenerator;
  private questionManager: QuestionManager;
  private priceEngine: PriceEngine;
  private perpsEngine: PerpetualsEngine;
  
  private actors: SelectedActor[] = [];
  private organizations: Organization[] = [];
  private scenarios: Scenario[] = [];
  private questions: Question[] = [];
  private connections: ActorConnection[] = [];
  private groupChats: GroupChat[] = [];
  
  private recentTicks: MinuteTick[] = [];
  private isRunning = false;
  private intervalId?: NodeJS.Timeout;
  private fundingIntervalId?: NodeJS.Timeout;
  private dailySnapshotIntervalId?: NodeJS.Timeout;
  private luckMood: Map<string, { luck: string; mood: number }> = new Map();
  private lastDailySnapshot: string = new Date().toISOString().split('T')[0]!;

  constructor(config?: RealtimeConfig) {
    super();
    
    this.config = {
      tickIntervalMs: config?.tickIntervalMs || 60000, // 1 minute
      postsPerTick: config?.postsPerTick || 15, // Average 15 posts/minute
      historyDays: config?.historyDays || 30,
      savePath: config?.savePath || join(process.cwd(), 'games', 'realtime'),
    };

    this.llm = new BabylonLLMClient();
    this.feedGenerator = new FeedGenerator(this.llm);
    this.questionManager = new QuestionManager(this.llm);
    this.priceEngine = new PriceEngine(Date.now());
    this.perpsEngine = new PerpetualsEngine();
  }

  /**
   * Initialize the game engine
   * Loads actors, creates scenarios, initializes prices
   */
  async initialize(): Promise<void> {
    console.log('🎮 INITIALIZING REALTIME GAME ENGINE');
    console.log('=====================================\n');

    // Load actors database
    const actorsPath = join(process.cwd(), 'data/actors.json');
    const actorsData = JSON.parse(readFileSync(actorsPath, 'utf-8')) as ActorsDatabase;

    // Select all actors (we want lots of NPCs for high throughput)
    console.log('📋 Loading actors...');
    this.actors = this.selectAllActors(actorsData.actors);
    console.log(`  ✓ Loaded ${this.actors.length} actors\n`);

    // Load organizations and initialize prices
    console.log('💰 Initializing organizations and prices...');
    this.organizations = actorsData.organizations;
    this.priceEngine.initializeCompanies(this.organizations);
    this.perpsEngine.initializeMarkets(this.organizations);
    const companies = this.organizations.filter(o => o.type === 'company');
    console.log(`  ✓ Initialized ${companies.length} company stock prices`);
    console.log(`  ✓ Initialized ${companies.length} perpetual markets\n`);

    // Generate scenarios (one-time)
    console.log('📝 Generating scenarios...');
    this.scenarios = await this.generateScenarios();
    console.log(`  ✓ Generated ${this.scenarios.length} scenarios\n`);

    // Create connections
    console.log('🔗 Creating actor connections...');
    this.connections = this.generateConnections();
    console.log(`  ✓ Generated ${this.connections.length} relationships\n`);

    // Create group chats
    console.log('💬 Creating group chats...');
    this.groupChats = this.createGroupChats();
    console.log(`  ✓ Created ${this.groupChats.length} group chats\n`);

    // Initialize luck and mood
    this.initializeLuckMood();

    // Set up feed generator
    this.feedGenerator.setOrganizations(this.organizations);

    // Load existing history if available
    await this.loadHistory();

    // Generate initial questions if needed
    if (this.questions.length === 0) {
      console.log('🎯 Generating initial questions...');
      const newQuestions = await this.generateQuestions(5);
      this.questions.push(...newQuestions);
      console.log(`  ✓ Generated ${newQuestions.length} initial questions\n`);
    }

    console.log('✅ INITIALIZATION COMPLETE');
    console.log('===========================');
    console.log(`Actors: ${this.actors.length}`);
    console.log(`Companies: ${companies.length}`);
    console.log(`Active Questions: ${this.questions.filter(q => q.status === 'active').length}`);
    console.log(`Tick Interval: ${this.config.tickIntervalMs / 1000}s`);
    console.log(`Posts per Tick: ${this.config.postsPerTick}\n`);
  }

  /**
   * Start the realtime engine
   * Begins generating content every minute
   */
  start(): void {
    if (this.isRunning) {
      console.log('⚠️  Engine already running');
      return;
    }

    console.log('🚀 STARTING REALTIME ENGINE\n');
    console.log(`Generating ${this.config.postsPerTick} posts every ${this.config.tickIntervalMs / 1000} seconds`);
    console.log('Press Ctrl+C to stop\n');

    this.isRunning = true;

    // Run first tick immediately
    this.tick().catch(error => {
      console.error('Error in tick:', error);
    });

    // Then run on interval
    this.intervalId = setInterval(() => {
      this.tick().catch(error => {
        console.error('Error in tick:', error);
      });
    }, this.config.tickIntervalMs);

    // Process funding every 8 hours (funding happens at 00:00, 08:00, 16:00 UTC)
    this.fundingIntervalId = setInterval(() => {
      this.perpsEngine.processFunding();
    }, 8 * 60 * 60 * 1000); // 8 hours

    // Check for daily snapshot at midnight UTC
    this.dailySnapshotIntervalId = setInterval(() => {
      this.checkDailySnapshot();
    }, 60 * 1000); // Check every minute

    this.emit('started');
  }

  /**
   * Stop the realtime engine
   */
  stop(): void {
    if (!this.isRunning) {
      console.log('⚠️  Engine not running');
      return;
    }

    console.log('\n🛑 STOPPING REALTIME ENGINE');
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    if (this.fundingIntervalId) {
      clearInterval(this.fundingIntervalId);
      this.fundingIntervalId = undefined;
    }

    if (this.dailySnapshotIntervalId) {
      clearInterval(this.dailySnapshotIntervalId);
      this.dailySnapshotIntervalId = undefined;
    }

    this.isRunning = false;
    this.emit('stopped');

    // Save state
    this.saveState();
    console.log('✅ Engine stopped, state saved\n');
  }

  /**
   * Single tick - generates content for this minute
   */
  private async tick(): Promise<void> {
    const timestamp = new Date().toISOString();
    const currentDate = timestamp.split('T')[0]!;
    
    console.log(`⏰ [${timestamp}] Generating tick...`);

    try {
      // Step 1: Resolve expired questions
      const activeQuestions = this.questions.filter(q => q.status === 'active');
      const toResolve = this.questionManager.getQuestionsToResolve(activeQuestions, currentDate);
      
      if (toResolve.length > 0) {
        console.log(`  🎯 Resolving ${toResolve.length} questions`);
        for (const question of toResolve) {
          const resolved = this.questionManager.resolveQuestion(question, question.outcome);
          const index = this.questions.findIndex(q => q.id === question.id);
          if (index >= 0) {
            this.questions[index] = resolved;
          }
        }
      }

      // Step 2: Create new questions if needed (maintain 15-20 active)
      const currentActive = this.questions.filter(q => q.status === 'active').length;
      let questionsCreated = 0;
      
      if (currentActive < 15) {
        const toCreate = Math.min(3, 20 - currentActive);
        const newQuestions = await this.generateQuestions(toCreate);
        this.questions.push(...newQuestions);
        questionsCreated = newQuestions.length;
        console.log(`  📝 Created ${questionsCreated} new questions`);
      }

      // Step 3: Generate events (2-4 per minute)
      const events = this.generateEventsForTick();
      
      // Step 4: Update prices based on events
      const priceUpdates = await this.updatePrices(events);
      if (priceUpdates.length > 0) {
        console.log(`  💰 ${priceUpdates.length} price updates`);
        
        // Update perpetuals positions with new prices
        const priceMap = new Map<string, number>();
        this.organizations.forEach(org => {
          if (org.type === 'company' && org.currentPrice) {
            priceMap.set(org.id, org.currentPrice);
          }
        });
        this.perpsEngine.updatePositions(priceMap);
      }

      // Step 5: Generate posts (10-20 per minute)
      const posts = await this.generatePostsForTick(events);
      console.log(`  📱 Generated ${posts.length} posts`);

      // Step 6: Save this tick
      const tick: MinuteTick = {
        timestamp,
        posts,
        priceUpdates,
        events,
        questionsResolved: toResolve.length,
        questionsCreated,
      };

      this.recentTicks.push(tick);
      
      // Keep only last 30 days worth of ticks (43,200 minutes)
      const maxTicks = this.config.historyDays * 24 * 60;
      if (this.recentTicks.length > maxTicks) {
        this.recentTicks = this.recentTicks.slice(-maxTicks);
      }

      // Emit tick event
      this.emit('tick', tick);

      // Save state periodically (every 10 ticks = 10 minutes)
      if (this.recentTicks.length % 10 === 0) {
        this.saveState();
      }

    } catch (error) {
      console.error('  ❌ Error in tick:', error);
      this.emit('error', error);
    }
  }

  /**
   * Generate events for this tick (2-4 events)
   */
  private generateEventsForTick(): WorldEvent[] {
    const events: WorldEvent[] = [];
    const eventCount = 2 + Math.floor(Math.random() * 3); // 2-4 events
    const activeQuestions = this.questions.filter(q => q.status === 'active');

    for (let i = 0; i < eventCount; i++) {
      const question = activeQuestions[Math.floor(Math.random() * activeQuestions.length)];
      if (!question) continue;

      const scenario = this.scenarios.find(s => s.id === question.scenario);
      const involvedActors = scenario 
        ? this.actors.filter(a => scenario.mainActors.includes(a.id)).slice(0, 2)
        : this.actors.slice(0, 2);

      // Calculate game day number from start date
      const startDate = new Date('2024-01-01'); // Game start date
      const now = new Date();
      const daysSinceStart = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const currentDay = daysSinceStart + 1; // Day 1 is the first day
      events.push({
        id: `event-${Date.now()}-${i}`,
        day: currentDay,
        type: this.randomEventType(),
        actors: involvedActors.map(a => a.id),
        description: `Event related to: ${question.text}`,
        relatedQuestion: toQuestionIdNumberOrNull(question.id),
        pointsToward: Math.random() > 0.5 ? (question.outcome ? 'YES' : 'NO') : null,
        visibility: 'public',
      });
    }

    return events;
  }

  /**
   * Generate posts for this tick (10-20 posts from various actors)
   */
  private async generatePostsForTick(events: WorldEvent[]): Promise<FeedPost[]> {
    const posts: FeedPost[] = [];
    const numPosts = this.config.postsPerTick + Math.floor(Math.random() * 10) - 5; // ±5 variance
    
    // Select random actors to post
    const postingActors = shuffleArray(this.actors).slice(0, numPosts);
    
    for (const actor of postingActors) {
      const event = events[Math.floor(Math.random() * events.length)];
      
      posts.push({
        id: `post-${Date.now()}-${Math.random()}`,
        day: Math.floor(Date.now() / (1000 * 60 * 60 * 24)), // Days since epoch
        timestamp: new Date().toISOString(),
        type: 'post',
        content: `${actor.name}'s take on: ${event?.description || 'current events'}`,
        author: actor.id,
        authorName: actor.name,
        sentiment: Math.random() * 2 - 1,
        clueStrength: Math.random(),
        pointsToward: Math.random() > 0.5,
      });
    }

    return posts;
  }

  /**
   * Update stock prices based on events
   */
  private async updatePrices(events: WorldEvent[]): Promise<PriceUpdate[]> {
    const updates: PriceUpdate[] = [];
    
    for (const event of events) {
      // Find companies affected by this event
      const affectedCompanies = this.organizations.filter(org => {
        if (org.type !== 'company') return false;
        return event.actors.some(actorId => {
          const actor = this.actors.find(a => a.id === actorId);
          return actor?.affiliations?.includes(org.id);
        });
      });

      for (const company of affectedCompanies) {
        // Simple price impact logic (can enhance with LLM later)
        const direction = Math.random() > 0.5 ? 'positive' : 'negative';
        const magnitude = Math.random() > 0.7 ? 'major' : Math.random() > 0.4 ? 'moderate' : 'minor';
        
        const update = this.priceEngine.applyEventImpact(company.id, event, direction, magnitude);
        if (update) {
          updates.push(update);
        }
      }
    }

    return updates;
  }

  /**
   * Generate new questions
   */
  private async generateQuestions(_count: number): Promise<Question[]> {
    const currentDate = new Date().toISOString().split('T')[0]!;
    const activeQuestions = this.questions.filter(q => q.status === 'active');
    const nextId = Math.max(0, ...this.questions.map(q => toQuestionIdNumber(q.id))) + 1;

    return await this.questionManager.generateDailyQuestions({
      currentDate,
      scenarios: this.scenarios,
      actors: this.actors.filter(a => a.role === 'main'),
      organizations: this.organizations,
      activeQuestions,
      recentEvents: [],
      nextQuestionId: nextId,
    });
  }

  /**
   * Check if we need to record daily snapshot (at midnight UTC)
   */
  private checkDailySnapshot(): void {
    const currentDate = new Date().toISOString().split('T')[0]!;
    
    if (currentDate !== this.lastDailySnapshot) {
      console.log(`\n📊 Recording daily snapshot for ${this.lastDailySnapshot}`);
      this.perpsEngine.recordDailySnapshot(this.lastDailySnapshot);
      this.lastDailySnapshot = currentDate;
      this.saveState(); // Save after snapshot
    }
  }

  /**
   * Save current state to disk
   */
  private saveState(): void {
    if (!existsSync(this.config.savePath)) {
      mkdirSync(this.config.savePath, { recursive: true });
    }

    const state = {
      ticks: this.recentTicks,
      questions: this.questions,
      organizations: this.priceEngine.getAllCompanies(),
      perpsState: this.perpsEngine.exportState(),
      lastDailySnapshot: this.lastDailySnapshot,
      timestamp: new Date().toISOString(),
    };

    const statePath = join(this.config.savePath, 'history.json');
    writeFileSync(statePath, JSON.stringify(state, null, 2));
  }

  /**
   * Load existing history from disk
   */
  private async loadHistory(): Promise<void> {
    const historyPath = join(this.config.savePath, 'history.json');
    
    if (existsSync(historyPath)) {
      try {
        const data = JSON.parse(readFileSync(historyPath, 'utf-8'));
        this.recentTicks = data.ticks || [];
        this.questions = data.questions || [];
        this.lastDailySnapshot = data.lastDailySnapshot || new Date().toISOString().split('T')[0]!;
        
        // Import perps state
        if (data.perpsState) {
          this.perpsEngine.importState(data.perpsState);
        }
        
        console.log('📚 Loaded existing history');
        console.log(`  Ticks: ${this.recentTicks.length}`);
        console.log(`  Questions: ${this.questions.length}`);
        console.log(`  Last Snapshot: ${this.lastDailySnapshot}\n`);
      } catch (error) {
        console.error('Failed to load history:', error);
      }
    }
  }

  // Helper methods (simplified versions)
  
  private selectAllActors(actorList: any[]): SelectedActor[] {
    return actorList.map(a => ({
      ...a,
      tier: a.tier || 'C_TIER',
      role: a.tier === 'S_TIER' || a.tier === 'A_TIER' ? 'main' : 'supporting',
      initialLuck: this.randomLuck(),
      initialMood: this.randomMood(),
    }));
  }

  private async generateScenarios(): Promise<Scenario[]> {
    // Simplified - just create basic scenarios
    return [
      { id: 1, title: 'Tech Drama', description: 'Tech companies and their feuds', mainActors: [], involvedOrganizations: [], theme: 'tech' },
      { id: 2, title: 'Political Chaos', description: 'Political figures and scandals', mainActors: [], involvedOrganizations: [], theme: 'politics' },
      { id: 3, title: 'Market Mayhem', description: 'Stock market and crypto chaos', mainActors: [], involvedOrganizations: [], theme: 'finance' },
    ];
  }

  private generateConnections(): ActorConnection[] {
    const connections: ActorConnection[] = [];
    const mains = this.actors.filter(a => a.role === 'main');
    
    for (let i = 0; i < mains.length; i++) {
      for (let j = i + 1; j < Math.min(i + 5, mains.length); j++) {
        const actor1 = mains[i];
        const actor2 = mains[j];
        if (!actor1 || !actor2) continue;
        connections.push({
          actor1: actor1.id,
          actor2: actor2.id,
          relationship: Math.random() > 0.5 ? 'rivals' : 'allies',
          context: 'Industry relationship',
        });
      }
    }
    
    return connections;
  }

  private createGroupChats(): GroupChat[] {
    return this.actors
      .filter(a => a.role === 'main')
      .slice(0, 10)
      .map(a => ({
        id: `${a.id}-group`,
        name: `${a.name}'s Circle`,
        admin: a.id,
        members: [a.id],
        theme: a.domain?.[0] || 'general',
      }));
  }

  private initializeLuckMood(): void {
    this.actors.forEach(actor => {
      this.luckMood.set(actor.id, {
        luck: actor.initialLuck,
        mood: actor.initialMood,
      });
    });
  }

  private randomLuck(): 'low' | 'medium' | 'high' {
    const r = Math.random();
    return r < 0.3 ? 'low' : r < 0.7 ? 'medium' : 'high';
  }

  private randomMood(): number {
    return (Math.random() - 0.5) * 2;
  }

  private randomEventType(): WorldEvent['type'] {
    const types: WorldEvent['type'][] = ['announcement', 'scandal', 'deal', 'conflict', 'revelation'];
    return types[Math.floor(Math.random() * types.length)]!;
  }

  /**
   * Get current game state
   */
  getState() {
    return {
      actors: this.actors.length,
      companies: this.organizations.filter(o => o.type === 'company').length,
      activeQuestions: this.questions.filter(q => q.status === 'active').length,
      totalQuestions: this.questions.length,
      recentTicks: this.recentTicks.length,
      isRunning: this.isRunning,
      perpMarkets: this.perpsEngine.getMarkets().length,
    };
  }

  /**
   * Get perpetuals engine (for UI/API access)
   */
  getPerpsEngine(): PerpetualsEngine {
    return this.perpsEngine;
  }

  /**
   * Get all questions
   */
  getAllQuestions(): Question[] {
    return this.questions;
  }

  /**
   * Get all organizations
   */
  getAllOrganizations(): Organization[] {
    return this.organizations;
  }
}

