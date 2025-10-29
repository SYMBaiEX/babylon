/**
 * Continuous Game Generator
 * 
 * Generates games one day at a time instead of 30-day batches.
 * Manages active questions (max 20), creates new questions daily,
 * resolves questions when they reach their resolution date (24h-7d).
 * Integrates with PriceEngine for stock price movements.
 * 
 * Key differences from original GameGenerator:
 * - Generates 1 day at a time
 * - Manages GameState (active questions, prices, etc.)
 * - Creates 1-3 new questions per day
 * - Resolves questions when resolutionDate is reached
 * - Updates stock prices based on events
 * - Persists state between days
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { FeedGenerator } from '../engine/FeedGenerator';
import { BabylonLLMClient } from './llm/openai-client';
import { QuestionManager } from '../engine/QuestionManager';
import { PriceEngine } from '../engine/PriceEngine';
import { generateActorContext } from '../engine/EmotionSystem';
import { shuffleArray } from '@/shared/utils';
import { loadPrompt } from '../prompts/loader';
import type {
  ActorTier,
  SelectedActor,
  ActorConnection,
  Organization,
  WorldEvent,
  Scenario,
  Question,
  GroupChat,
  ChatMessage,
  DayTimeline,
  LuckChange,
  MoodChange,
  GameState,
  PriceUpdate,
  ActorsDatabase,
} from '@/shared/types';

// Load actors database
const actorsPath = join(process.cwd(), 'data/actors.json');
const actorsData = JSON.parse(readFileSync(actorsPath, 'utf-8')) as ActorsDatabase;
const actors = actorsData;

/**
 * Continuous Game Generator
 * 
 * Generates games day-by-day with persistent state
 */
export class ContinuousGameGenerator {
  private llm: BabylonLLMClient;
  private feedGenerator: FeedGenerator;
  private questionManager: QuestionManager;
  private priceEngine: PriceEngine;
  private gameState?: GameState;

  constructor(apiKey?: string) {
    this.llm = new BabylonLLMClient(apiKey);
    this.feedGenerator = new FeedGenerator(this.llm);
    this.questionManager = new QuestionManager(this.llm);
    this.priceEngine = new PriceEngine(Date.now()); // Seeded with current time for randomness
  }

  /**
   * Initialize a new continuous game
   * Sets up actors, scenarios, organizations, and initial state
   */
  async initializeGame(startDate: string = '2025-11-01'): Promise<GameState> {
    console.log('🎮 INITIALIZING CONTINUOUS GAME');
    console.log('================================\n');

    // Phase 1: Actor Selection
    console.log('📋 Phase 1: Selecting actors...');
    const selectedActors = this.selectActors();
    console.log(`  ✓ Selected ${selectedActors.mains.length} main actors`);
    console.log(`  ✓ Selected ${selectedActors.supporting.length} supporting actors`);
    console.log(`  ✓ Selected ${selectedActors.extras.length} extras\n`);

    // Phase 2: Extract organizations and initialize prices
    console.log('💰 Phase 2: Initializing organizations and prices...');
    const organizations = this.extractOrganizations(selectedActors);
    this.priceEngine.initializeCompanies(organizations);
    console.log(`  ✓ Extracted ${organizations.length} organizations`);
    console.log(`  ✓ Initialized prices for ${organizations.filter(o => o.type === 'company').length} companies\n`);

    // Phase 3: Generate initial scenarios
    console.log('📝 Phase 3: Generating scenarios...');
    const scenarios = await this.generateScenarios(selectedActors.mains, organizations);
    console.log(`  ✓ Generated ${scenarios.length} scenarios\n`);

    // Phase 4: World Building
    console.log('🌍 Phase 4: Building world...');
    const connections = this.generateConnections(selectedActors);
    console.log(`  ✓ Generated ${connections.length} actor relationships`);

    const groupChats = await this.createGroupChats(selectedActors, connections);
    console.log(`  ✓ Created ${groupChats.length} group chats`);

    const luckMood = this.initializeLuckMood(selectedActors);
    console.log(`  ✓ Initialized luck & mood for ${luckMood.size} actors\n`);

    // Phase 5: Generate initial questions (start with 5-10)
    console.log('🎯 Phase 5: Generating initial questions...');
    const initialQuestions = await this.questionManager.generateDailyQuestions({
      currentDate: startDate,
      scenarios,
      actors: selectedActors.mains,
      organizations,
      activeQuestions: [],
      recentEvents: [],
      nextQuestionId: 1,
    });
    console.log(`  ✓ Generated ${initialQuestions.length} initial questions\n`);

    // Create game state
    const gameState: GameState = {
      id: `babylon-continuous-${Date.now()}`,
      currentDay: 0,
      currentDate: startDate,
      activeQuestions: initialQuestions,
      resolvedQuestions: [],
      organizations: this.priceEngine.getAllCompanies(),
      priceUpdates: [],
      lastGeneratedDate: new Date().toISOString(),
    };

    this.gameState = gameState;

    console.log('✅ GAME INITIALIZED');
    console.log('===================');
    console.log(`Game ID: ${gameState.id}`);
    console.log(`Start Date: ${startDate}`);
    console.log(`Active Questions: ${gameState.activeQuestions.length}`);
    console.log(`Companies with Prices: ${gameState.organizations.length}\n`);

    return gameState;
  }

  /**
   * Generate a single day of content
   * This is the main method called repeatedly to advance the game
   */
  async generateNextDay(
    gameState: GameState,
    allActors: SelectedActor[],
    scenarios: Scenario[],
    groupChats: GroupChat[],
    connections: ActorConnection[],
    luckMood: Map<string, { luck: string; mood: number }>,
    previousDays: DayTimeline[]
  ): Promise<{ dayTimeline: DayTimeline; updatedGameState: GameState }> {
    const day = gameState.currentDay + 1;
    const currentDate = new Date(gameState.currentDate);
    currentDate.setDate(currentDate.getDate() + 1);
    const dateStr = currentDate.toISOString().split('T')[0]!;

    console.log(`\n📅 GENERATING DAY ${day}: ${dateStr}`);
    console.log('================================');

    // Step 1: Check for questions to resolve
    console.log('🎯 Step 1: Checking for question resolutions...');
    const questionsToResolve = this.questionManager.getQuestionsToResolve(
      gameState.activeQuestions,
      dateStr
    );

    if (questionsToResolve.length > 0) {
      console.log(`  ✓ Resolving ${questionsToResolve.length} questions`);
      for (const question of questionsToResolve) {
        const resolved = this.questionManager.resolveQuestion(question, question.outcome);
        gameState.resolvedQuestions.push(resolved);
        gameState.activeQuestions = gameState.activeQuestions.filter(q => q.id !== question.id);
      }
    } else {
      console.log(`  • No questions to resolve today`);
    }

    // Step 2: Generate new questions (if space available)
    console.log('📝 Step 2: Generating new questions...');
    if (gameState.activeQuestions.length < 20) {
      const newQuestions = await this.questionManager.generateDailyQuestions({
        currentDate: dateStr,
        scenarios,
        actors: allActors.filter(a => a.role === 'main'),
        organizations: gameState.organizations,
        activeQuestions: gameState.activeQuestions,
        recentEvents: previousDays.slice(-5),
        nextQuestionId: Math.max(...gameState.activeQuestions.map(q => q.id), 0) + 1,
      });

      if (newQuestions.length > 0) {
        console.log(`  ✓ Created ${newQuestions.length} new questions`);
        gameState.activeQuestions.push(...newQuestions);
      } else {
        console.log(`  • No new questions created`);
      }
    } else {
      console.log(`  • Max questions reached (20/20)`);
    }

    // Step 3: Generate day's events
    console.log('🌍 Step 3: Generating events...');
    const dayTimeline = await this.generateDay(
      day,
      allActors,
      gameState.activeQuestions,
      scenarios,
      groupChats,
      previousDays,
      luckMood,
      dateStr,
      connections
    );
    console.log(`  ✓ Generated ${dayTimeline.events.length} events, ${dayTimeline.feedPosts.length} posts`);

    // Step 4: Update stock prices based on events
    console.log('💰 Step 4: Updating stock prices...');
    const priceUpdates = await this.updateStockPrices(dayTimeline.events, gameState.organizations);
    if (priceUpdates.length > 0) {
      console.log(`  ✓ Updated ${priceUpdates.length} company prices`);
      gameState.priceUpdates.push(...priceUpdates);
      // Keep only last 100 price updates
      if (gameState.priceUpdates.length > 100) {
        gameState.priceUpdates = gameState.priceUpdates.slice(-100);
      }
    } else {
      console.log(`  • No significant price movements`);
    }

    // Update game state
    gameState.currentDay = day;
    gameState.currentDate = dateStr;
    gameState.organizations = this.priceEngine.getAllCompanies();
    gameState.lastGeneratedDate = new Date().toISOString();

    console.log('\n✅ DAY COMPLETE');
    console.log(`Active Questions: ${gameState.activeQuestions.length}/20`);
    console.log(`Resolved Questions: ${gameState.resolvedQuestions.length}`);

    return { dayTimeline, updatedGameState: gameState };
  }

  /**
   * Update stock prices based on events
   * Uses LLM to determine event impact, then applies to prices
   */
  private async updateStockPrices(
    events: WorldEvent[],
    organizations: Organization[]
  ): Promise<PriceUpdate[]> {
    const updates: PriceUpdate[] = [];
    const companies = organizations.filter(o => o.type === 'company');

    for (const event of events) {
      // Determine which companies are affected by this event
      const affectedCompanies = companies.filter(company =>
        event.actors.some(actorId => {
          const actor = actors.actors.find(a => a.id === actorId);
          return actor?.affiliations?.includes(company.id);
        })
      );

      if (affectedCompanies.length === 0) continue;

      // Use LLM to determine impact
      for (const company of affectedCompanies) {
        const impact = await this.analyzePriceImpact(event, company);
        if (impact.direction !== 'neutral') {
          const update = this.priceEngine.applyEventImpact(
            company.id,
            event,
            impact.direction,
            impact.magnitude
          );
          if (update) {
            updates.push(update);
          }
        }
      }
    }

    return updates;
  }

  /**
   * Use LLM to analyze how an event affects a company's stock price
   */
  private async analyzePriceImpact(
    event: WorldEvent,
    company: Organization
  ): Promise<{ direction: 'positive' | 'negative' | 'neutral'; magnitude: 'major' | 'moderate' | 'minor' }> {
    const prompt = loadPrompt('game/price-impact', {
      eventDescription: event.description,
      eventType: event.type,
      companyName: company.name,
      companyDescription: company.description,
    });

    try {
      const response = await this.llm.generateJSON<{
        direction: 'positive' | 'negative' | 'neutral';
        magnitude: 'major' | 'moderate' | 'minor';
        reasoning: string;
      }>(prompt, undefined, { temperature: 0.7, maxTokens: 500 });

      return { direction: response.direction, magnitude: response.magnitude };
    } catch (error) {
      console.error('Failed to analyze price impact:', error);
      return { direction: 'neutral', magnitude: 'minor' };
    }
  }

  // Re-use existing methods from GameGenerator with minor adaptations
  private selectActors() {
    const allActors = actors.actors;

    // Weighted random selection - same as before
    const tierWeights: Record<string, number> = {
      S_TIER: 10,
      A_TIER: 6,
      B_TIER: 3,
      C_TIER: 1,
      D_TIER: 0.5,
    };

    const mainPool = allActors.flatMap(a =>
      Array(Math.ceil(tierWeights[a.tier || 'C_TIER'] || 1)).fill(a)
    );
    const shuffledMains = shuffleArray(mainPool);
    const uniqueMains = Array.from(new Set(shuffledMains.map(a => a.id)))
      .slice(0, 3)
      .map(id => allActors.find(a => a.id === id)!)
      .map(a => ({
        ...a,
        tier: a.tier as ActorTier,
        role: 'main',
        initialLuck: this.randomLuck(),
        initialMood: this.randomMood(),
      }));

    const supportWeights: Record<string, number> = {
      S_TIER: 2,
      A_TIER: 5,
      B_TIER: 4,
      C_TIER: 2,
      D_TIER: 0.5,
    };
    const supportPool = allActors
      .filter(a => !uniqueMains.some(m => m.id === a.id))
      .flatMap(a => Array(Math.ceil(supportWeights[a.tier || 'C_TIER'] || 1)).fill(a));
    const shuffledSupport = shuffleArray(supportPool);
    const uniqueSupporting = Array.from(new Set(shuffledSupport.map(a => a.id)))
      .slice(0, 15)
      .map(id => allActors.find(a => a.id === id)!)
      .map(a => ({
        ...a,
        tier: a.tier as ActorTier,
        role: 'supporting',
        initialLuck: this.randomLuck(),
        initialMood: this.randomMood(),
      }));

    const extraWeights: Record<string, number> = {
      S_TIER: 0.5,
      A_TIER: 1,
      B_TIER: 2,
      C_TIER: 4,
      D_TIER: 5,
    };
    const usedIds = new Set([...uniqueMains, ...uniqueSupporting].map(a => a.id));
    const extraPool = allActors
      .filter(a => !usedIds.has(a.id))
      .flatMap(a => Array(Math.ceil(extraWeights[a.tier || 'C_TIER'] || 1)).fill(a));
    const shuffledExtras = shuffleArray(extraPool);
    const uniqueExtras = Array.from(new Set(shuffledExtras.map(a => a.id)))
      .slice(0, 50)
      .map(id => allActors.find(a => a.id === id)!)
      .map(a => ({
        ...a,
        tier: a.tier as ActorTier,
        role: 'extra',
        initialLuck: this.randomLuck(),
        initialMood: this.randomMood(),
      }));

    return { mains: uniqueMains, supporting: uniqueSupporting, extras: uniqueExtras };
  }

  private extractOrganizations(selectedActors: {
    mains: SelectedActor[];
    supporting: SelectedActor[];
    extras: SelectedActor[];
  }): Organization[] {
    const allSelectedActors = [...selectedActors.mains, ...selectedActors.supporting, ...selectedActors.extras];
    const orgIds = new Set<string>();
    const orgWeights = new Map<string, number>();

    for (const actor of allSelectedActors) {
      if (!actor.affiliations) continue;

      let weight = 1;
      if (actor.role === 'main') weight = 3;
      else if (actor.role === 'supporting') weight = 2;

      for (const orgId of actor.affiliations) {
        orgIds.add(orgId);
        orgWeights.set(orgId, (orgWeights.get(orgId) || 0) + weight);
      }
    }

    return actors.organizations
      .filter(org => orgIds.has(org.id))
      .sort((a, b) => (orgWeights.get(b.id) || 0) - (orgWeights.get(a.id) || 0));
  }

  private async generateScenarios(
    mains: SelectedActor[],
    organizations: Organization[]
  ): Promise<Scenario[]> {
    // Same implementation as GameGenerator
    const prompt = this.createScenarioPrompt(mains, organizations);

    const result = await this.llm.generateJSON<{ scenarios: Scenario[] }>(prompt, undefined, {
      temperature: 0.9,
      maxTokens: 8000,
    });

    if (!result || !result.scenarios || !Array.isArray(result.scenarios)) {
      throw new Error('LLM returned invalid scenarios response');
    }

    return result.scenarios;
  }

  private createScenarioPrompt(mains: SelectedActor[], organizations: Organization[]): string {
    const organizationContext =
      organizations && organizations.length > 0
        ? `\n\nAFFILIATED ORGANIZATIONS:\n${organizations.map(o => `- ${o.name}: ${o.description}`).join('\n')}`
        : '';

    const mainActorsList = mains
      .map(
        a =>
          `- ${a.name}: ${a.description} (Domain: ${a.domain})${a.affiliations?.length ? ` [Affiliated: ${a.affiliations.join(', ')}]` : ''}`
      )
      .join('\n');

    return loadPrompt('game/scenarios', {
      mainActorsList,
      organizationContext,
    });
  }

  private generateConnections(selectedActors: {
    mains: SelectedActor[];
    supporting: SelectedActor[];
    extras: SelectedActor[];
  }): ActorConnection[] {
    // Same implementation as GameGenerator
    const connections: ActorConnection[] = [];

    for (let i = 0; i < selectedActors.mains.length; i++) {
      for (let j = i + 1; j < selectedActors.mains.length; j++) {
        const relationship = Math.random() > 0.5 ? 'rivals' : 'allies';
        connections.push({
          actor1: selectedActors.mains[i].id,
          actor2: selectedActors.mains[j].id,
          relationship,
          context: `${relationship === 'rivals' ? 'Competing' : 'Collaborating'} in ${selectedActors.mains[i].domain?.[0] || 'same space'}`,
        });
      }
    }

    return connections;
  }

  private async createGroupChats(
    selectedActors: { mains: SelectedActor[]; supporting: SelectedActor[]; extras: SelectedActor[] },
    connections: ActorConnection[]
  ): Promise<GroupChat[]> {
    // Simplified version for now - create one group per main actor
    const chats: GroupChat[] = [];

    for (const main of selectedActors.mains) {
      chats.push({
        id: `${main.id}-group`,
        name: `${main.name}'s Circle`,
        admin: main.id,
        members: [main.id, ...selectedActors.supporting.slice(0, 5).map(a => a.id)],
        theme: main.domain?.[0] || 'general',
      });
    }

    return chats;
  }

  private initializeLuckMood(selectedActors: {
    mains: SelectedActor[];
    supporting: SelectedActor[];
    extras: SelectedActor[];
  }): Map<string, { luck: string; mood: number }> {
    const tracking = new Map<string, { luck: string; mood: number }>();

    const allActors = [...selectedActors.mains, ...selectedActors.supporting, ...selectedActors.extras];

    allActors.forEach(actor => {
      if (actor && actor.id) {
        tracking.set(actor.id, {
          luck: actor.initialLuck || 'medium',
          mood: actor.initialMood || 0,
        });
      }
    });

    return tracking;
  }

  private randomLuck(): 'low' | 'medium' | 'high' {
    const r = Math.random();
    if (r < 0.3) return 'low';
    if (r < 0.7) return 'medium';
    return 'high';
  }

  private randomMood(): number {
    return (Math.random() - 0.5) * 2; // -1 to 1
  }

  private async generateDay(
    day: number,
    actors: SelectedActor[],
    questions: Question[],
    scenarios: Scenario[],
    groupChats: GroupChat[],
    previousDays: DayTimeline[],
    luckMood: Map<string, { luck: string; mood: number }>,
    dateStr: string,
    connections: ActorConnection[]
  ): Promise<DayTimeline> {
    // Simplified version - generate events for all active questions
    const events: WorldEvent[] = [];
    const eventCount = 3 + Math.floor(Math.random() * 3); // 3-5 events per day

    for (let i = 0; i < eventCount; i++) {
      const question = questions[i % questions.length];
      if (!question) continue;

      events.push({
        id: `event-${day}-${i}`,
        type: 'announcement',
        actors: actors.slice(0, 2).map(a => a.id),
        description: `Event related to: ${question.text}`,
        relatedQuestion: question.id,
        pointsToward: Math.random() > 0.5 ? (question.outcome ? 'YES' : 'NO') : null,
        visibility: 'public',
      });
    }

    // Generate feed posts
    const feedPosts = await this.feedGenerator.generateDayFeed(day, events, actors, true);

    // Placeholder for group chats
    const groupMessages: Record<string, ChatMessage[]> = {};

    return {
      day,
      summary: `${dateStr}: ${events.length} events, ${feedPosts.length} posts`,
      events,
      groupChats: groupMessages,
      feedPosts,
      luckChanges: [],
      moodChanges: [],
    };
  }
}

