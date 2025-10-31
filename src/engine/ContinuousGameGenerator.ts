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
import { BabylonLLMClient } from '../generator/llm/openai-client';
import { QuestionManager } from '../engine/QuestionManager';
import { PriceEngine } from '../engine/PriceEngine';
import { shuffleArray, toQuestionIdNumber, toQuestionIdNumberOrNull } from '@/shared/utils';
import { loadPrompt } from '../prompts/loader';
import { logger } from '@/lib/logger';
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
  FeedPost,
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
import { generateActorContext } from '../engine/EmotionSystem';

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
   * Get the current game state
   */
  getGameState(): GameState | undefined {
    return this.gameState;
  }

  /**
   * Initialize a new continuous game
   * Sets up actors, scenarios, organizations, and initial state
   */
  async initializeGame(startDate: string = '2025-11-01'): Promise<{
    gameState: GameState;
    assets: {
      allActors: SelectedActor[];
      scenarios: Scenario[];
      groupChats: GroupChat[];
      connections: ActorConnection[];
      luckMood: Map<string, { luck: string; mood: number }>;
    };
  }> {
    logger.info('INITIALIZING CONTINUOUS GAME', undefined, 'ContinuousGameGenerator');
    logger.info('================================', undefined, 'ContinuousGameGenerator');

    // Phase 1: Actor Selection
    logger.info('Phase 1: Selecting actors...', undefined, 'ContinuousGameGenerator');
    const selectedActors = this.selectActors();
    logger.info(`Selected ${selectedActors.mains.length} main actors`, undefined, 'ContinuousGameGenerator');
    logger.info(`Selected ${selectedActors.supporting.length} supporting actors`, undefined, 'ContinuousGameGenerator');
    logger.info(`Selected ${selectedActors.extras.length} extras`, undefined, 'ContinuousGameGenerator');

    // Phase 2: Extract organizations and initialize prices
    logger.info('Phase 2: Initializing organizations and prices...', undefined, 'ContinuousGameGenerator');
    const organizations = this.extractOrganizations(selectedActors);
    this.priceEngine.initializeCompanies(organizations);
    logger.info(`Extracted ${organizations.length} organizations`, undefined, 'ContinuousGameGenerator');
    logger.info(`Initialized prices for ${organizations.filter(o => o.type === 'company').length} companies`, undefined, 'ContinuousGameGenerator');

    // Phase 3: Generate initial scenarios
    logger.info('Phase 3: Generating scenarios...', undefined, 'ContinuousGameGenerator');
    const scenarios = await this.generateScenarios(selectedActors.mains, organizations);
    logger.info(`Generated ${scenarios.length} scenarios`, undefined, 'ContinuousGameGenerator');

    // Phase 4: World Building
    logger.info('Phase 4: Building world...', undefined, 'ContinuousGameGenerator');
    const connections = this.generateConnections(selectedActors);
    logger.info(`Generated ${connections.length} actor relationships`, undefined, 'ContinuousGameGenerator');

    const groupChats = await this.createGroupChats(selectedActors, connections);
    logger.info(`Created ${groupChats.length} group chats`, undefined, 'ContinuousGameGenerator');

    const luckMood = this.initializeLuckMood(selectedActors);
    logger.info(`Initialized luck & mood for ${luckMood.size} actors`, undefined, 'ContinuousGameGenerator');

    // Phase 5: Generate initial questions (start with 5-10)
    logger.info('Phase 5: Generating initial questions...', undefined, 'ContinuousGameGenerator');
    const initialQuestions = await this.questionManager.generateDailyQuestions({
      currentDate: startDate,
      scenarios,
      actors: selectedActors.mains,
      organizations,
      activeQuestions: [],
      recentEvents: [],
      nextQuestionId: 1,
    });
    logger.info(`Generated ${initialQuestions.length} initial questions`, undefined, 'ContinuousGameGenerator');

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

    // Flatten all actors into single array for easy access
    const allActors = [
      ...selectedActors.mains,
      ...selectedActors.supporting,
      ...selectedActors.extras,
    ];

    logger.info('GAME INITIALIZED', undefined, 'ContinuousGameGenerator');
    logger.info('===================', undefined, 'ContinuousGameGenerator');
    logger.info(`Game ID: ${gameState.id}`, undefined, 'ContinuousGameGenerator');
    logger.info(`Start Date: ${startDate}`, undefined, 'ContinuousGameGenerator');
    logger.info(`Active Questions: ${gameState.activeQuestions.length}`, undefined, 'ContinuousGameGenerator');
    logger.info(`Companies with Prices: ${gameState.organizations.length}`, undefined, 'ContinuousGameGenerator');

    return {
      gameState,
      assets: {
        allActors,
        scenarios,
        groupChats,
        connections,
        luckMood,
      },
    };
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

    logger.info(`GENERATING DAY ${day}: ${dateStr}`, undefined, 'ContinuousGameGenerator');
    logger.info('================================', undefined, 'ContinuousGameGenerator');

    // Step 1: Check for questions to resolve
    logger.info('Step 1: Checking for question resolutions...', undefined, 'ContinuousGameGenerator');
    const questionsToResolve = this.questionManager.getQuestionsToResolve(
      gameState.activeQuestions,
      dateStr
    );

    const resolvedQuestionsData: Array<{ question: Question; resolved: Question }> = [];
    
    if (questionsToResolve.length > 0) {
      logger.info(`Resolving ${questionsToResolve.length} questions`, undefined, 'ContinuousGameGenerator');
      for (const question of questionsToResolve) {
        const resolved = this.questionManager.resolveQuestion(question, question.outcome);
        gameState.resolvedQuestions.push(resolved);
        gameState.activeQuestions = gameState.activeQuestions.filter(q => q.id !== question.id);
        resolvedQuestionsData.push({ question, resolved });
      }
    } else {
      logger.debug('No questions to resolve today', undefined, 'ContinuousGameGenerator');
    }

    // Step 2: Generate new questions (if space available)
    logger.info('Step 2: Generating new questions...', undefined, 'ContinuousGameGenerator');
    if (gameState.activeQuestions.length < 20) {
      const newQuestions = await this.questionManager.generateDailyQuestions({
        currentDate: dateStr,
        scenarios,
        actors: allActors.filter(a => a.role === 'main'),
        organizations: gameState.organizations,
        activeQuestions: gameState.activeQuestions,
        recentEvents: previousDays.slice(-5),
        nextQuestionId: Math.max(...gameState.activeQuestions.map(q => toQuestionIdNumber(q.id)), 0) + 1,
      });

      if (newQuestions.length > 0) {
        logger.info(`Created ${newQuestions.length} new questions`, undefined, 'ContinuousGameGenerator');
        gameState.activeQuestions.push(...newQuestions);
      } else {
        logger.debug('No new questions created', undefined, 'ContinuousGameGenerator');
      }
    } else {
      logger.debug('Max questions reached (20/20)', undefined, 'ContinuousGameGenerator');
    }

    // Step 3: Generate day's events
    logger.info('Step 3: Generating events...', undefined, 'ContinuousGameGenerator');
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
    logger.info(`Generated ${dayTimeline.events.length} events, ${dayTimeline.feedPosts.length} posts`, undefined, 'ContinuousGameGenerator');

    // Step 3.5: Generate question resolution posts
    if (resolvedQuestionsData.length > 0) {
      logger.info('Step 3.5: Generating resolution announcements...', undefined, 'ContinuousGameGenerator');
      for (const { question, resolved } of resolvedQuestionsData) {
        // Find most recent event related to this question for context
        const relatedEvents = dayTimeline.events
          .filter(e => e.relatedQuestion === question.id)
          .slice(-1); // Get the most recent one
        
        const resolutionEventDesc = relatedEvents.length > 0
          ? relatedEvents[0]!.description
          : `Market conditions determined the outcome of: ${question.text}`;
        
        // Generate resolution post
        const resolutionPost = await this.feedGenerator.generateQuestionResolutionPost(
          resolved,
          resolutionEventDesc,
          day,
          Math.random() * 100 // Random winning percentage for now
        );
        
        if (resolutionPost) {
          dayTimeline.feedPosts.push(resolutionPost);
          logger.info(`Created resolution post for: "${question.text}"`, undefined, 'ContinuousGameGenerator');
        }
      }
    }

    // Step 4: Update stock prices based on events
    logger.info('Step 4: Updating stock prices...', undefined, 'ContinuousGameGenerator');
    const priceUpdates = await this.updateStockPrices(dayTimeline.events, gameState.organizations);
    if (priceUpdates.length > 0) {
      logger.info(`Updated ${priceUpdates.length} company prices`, undefined, 'ContinuousGameGenerator');
      gameState.priceUpdates.push(...priceUpdates);
      // Keep only last 100 price updates
      if (gameState.priceUpdates.length > 100) {
        gameState.priceUpdates = gameState.priceUpdates.slice(-100);
      }
    } else {
      logger.debug('No significant price movements', undefined, 'ContinuousGameGenerator');
    }

    // Update game state
    gameState.currentDay = day;
    gameState.currentDate = dateStr;
    gameState.organizations = this.priceEngine.getAllCompanies();
    gameState.lastGeneratedDate = new Date().toISOString();

    // Update internal game state
    this.gameState = gameState;

    logger.info('DAY COMPLETE', undefined, 'ContinuousGameGenerator');
    logger.info(`Active Questions: ${gameState.activeQuestions.length}/20`, undefined, 'ContinuousGameGenerator');
    logger.info(`Resolved Questions: ${gameState.resolvedQuestions.length}`, undefined, 'ContinuousGameGenerator');

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
      logger.error('Failed to analyze price impact:', error, 'ContinuousGameGenerator');
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
        const actor1 = selectedActors.mains[i];
        const actor2 = selectedActors.mains[j];
        if (!actor1 || !actor2) continue;

        const relationship = Math.random() > 0.5 ? 'rivals' : 'allies';
        connections.push({
          actor1: actor1.id,
          actor2: actor2.id,
          relationship,
          context: `${relationship === 'rivals' ? 'Competing' : 'Collaborating'} in ${actor1.domain?.[0] || 'same space'}`,
        });
      }
    }

    return connections;
  }

  private async createGroupChats(
    selectedActors: { mains: SelectedActor[]; supporting: SelectedActor[]; extras: SelectedActor[] },
    connections: ActorConnection[]
  ): Promise<GroupChat[]> {
    const chats: GroupChat[] = [];
    
    // Helper to get positive relationships for an actor
    const getPositiveConnections = (actorId: string): string[] => {
      const positiveRelationships = ['ally', 'friend', 'advisor', 'source', 'allies'];
      return connections
        .filter(c => 
          (c.actor1 === actorId || c.actor2 === actorId) &&
          positiveRelationships.includes(c.relationship)
        )
        .map(c => c.actor1 === actorId ? c.actor2 : c.actor1);
    };

    // One group per main actor
    for (const main of selectedActors.mains) {
      const positiveConnections = getPositiveConnections(main.id);
      const memberIds = [main.id, ...positiveConnections.slice(0, 6)];

      const domain = main.domain?.[0] || 'general';

      // Generate contextual name
      const groupName = `${main.name}'s Circle`;
      const kebabName = groupName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      
      chats.push({
        id: kebabName,
        name: groupName,
        admin: main.id,
        members: memberIds,
        theme: domain,
      });
    }
    
    // Add 1-2 groups for high-tier supporting actors
    const highTierSupporting = selectedActors.supporting
      .filter((a: SelectedActor) => a.tier === 'S_TIER' || a.tier === 'A_TIER')
      .slice(0, 2);
    
    for (const supporting of highTierSupporting) {
      const positiveConnections = getPositiveConnections(supporting.id);
      const memberIds = [supporting.id, ...positiveConnections.slice(0, 5)];

      const domain = supporting.domain?.[0] || 'general';

      // Generate contextual name
      const groupName = `${supporting.name}'s Network`;
      const kebabName = groupName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + `-${chats.length}`;
      
      chats.push({
        id: kebabName,
        name: groupName,
        admin: supporting.id,
        members: memberIds,
        theme: domain,
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
    const eventCount = 3 + Math.floor(Math.random() * 3); // 3-5 events per day

    // Generate events with emotional context, scenarios, and narrative continuity
    const events = await this.generateEventsWithContext(
      day,
      actors,
      questions,
      scenarios,
      eventCount,
      luckMood,
      connections
    );

    // Generate luck and mood changes based on events
    const luckChanges = this.generateLuckChanges(day, events, actors, luckMood);
    const moodChanges = this.generateMoodChanges(day, events, actors, luckMood);

    // Apply ambient mood drift
    this.applyAmbientMoodDrift(actors, luckMood);

    // Prepare actor states for FeedGenerator
    const actorStateMap = new Map();
    actors.forEach(a => {
      const state = luckMood.get(a.id);
      if (state) {
        actorStateMap.set(a.id, {
          luck: state.luck as 'low' | 'medium' | 'high',
          mood: state.mood,
        });
      }
    });
    this.feedGenerator.setActorStates(actorStateMap);
    this.feedGenerator.setRelationships(connections.map(c => ({
      actor1: c.actor1,
      actor2: c.actor2,
      relationship: c.relationship as 'allies' | 'rivals' | 'neutral',
      context: c.context,
    })));

    // Set actor group contexts from previous days' messages
    if (previousDays.length > 0) {
      const actorGroupContexts = new Map<string, string>();
      actors.forEach(actor => {
        const context = this.getActorGroupContext(actor.id, groupChats, previousDays, actors);
        if (context) {
          actorGroupContexts.set(actor.id, context);
        }
      });
      this.feedGenerator.setActorGroupContexts(actorGroupContexts);
    }

    // Generate feed posts from events
    const feedPosts: FeedPost[] = [];
    const eventFeedPosts = await this.feedGenerator.generateDayFeed(day, events, actors, true);
    feedPosts.push(...eventFeedPosts);

    // Generate group chat messages
    const groupMessages = await this.generateGroupMessages(
      day,
      events,
      groupChats,
      actors,
      previousDays,
      luckMood,
      connections,
      scenarios,
      questions
    );

    // Build summary with context from previous days
    const summary = previousDays.length > 0
      ? `${dateStr}: ${events.length} events (building on day ${previousDays[previousDays.length - 1]?.day || 0}), ${feedPosts.length} posts, ${Object.values(groupMessages).flat().length} messages`
      : `${dateStr}: ${events.length} events, ${feedPosts.length} posts, ${Object.values(groupMessages).flat().length} messages`;

    return {
      day,
      summary,
      events,
      groupChats: groupMessages,
      feedPosts,
      luckChanges,
      moodChanges,
    };
  }

  /**
   * Generate events with emotional context using LLM
   */
  private async generateEventsWithContext(
    day: number,
    actors: SelectedActor[],
    questions: Question[],
    scenarios: Scenario[],
    eventCount: number,
    luckMood: Map<string, { luck: string; mood: number }>,
    connections: ActorConnection[]
  ): Promise<WorldEvent[]> {
    const events: WorldEvent[] = [];
    const eventTypes: WorldEvent['type'][] = [
      'announcement',
      'development',
      'deal',
      'leak',
      'scandal',
      'rumor',
      'conflict',
      'revelation'
    ];

    // Build event requests with emotional context
    const eventRequests: Array<{
      eventNumber: number;
      type: WorldEvent['type'];
      actors: SelectedActor[];
      actorsWithContext: string;
      questionId: number;
      questionText: string;
    }> = [];
    
    for (let i = 0; i < eventCount; i++) {
      const question = questions[i % questions.length];
      if (!question) continue;

      // Select random actors for this event
      const selectedActors = actors
        .sort(() => Math.random() - 0.5)
        .slice(0, 2 + Math.floor(Math.random() * 2)); // 2-3 actors per event

      const actorsWithContext = selectedActors.map((a: SelectedActor) => {
        const state = luckMood.get(a.id);
        const emotionalContext = state
          ? generateActorContext(
              state.mood,
              state.luck as 'low' | 'medium' | 'high',
              undefined,
              connections,
              a.id
            )
          : '';
        return `${a.name} (${a.description})${emotionalContext ? '\n   ' + emotionalContext.replace(/\n/g, '\n   ') : ''}`;
      }).join('\n   ');

      const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)] as WorldEvent['type'];

      eventRequests.push({
        eventNumber: i + 1,
        type: eventType,
        actors: selectedActors,
        actorsWithContext,
        questionId: toQuestionIdNumber(question.id),
        questionText: question.text
      });
    }

    // Generate events using LLM if available
    if (this.llm) {
      const eventRequestsList = eventRequests.map(req => 
        `${req.eventNumber}. Type: ${req.type}
   Actors: 
   ${req.actorsWithContext}
   Related to: ${req.questionText}
   
   Create event involving these actors. Build on the narrative.
   Their mood and luck should influence the nature of the event.
   One sentence, max 120 chars, satirical but plausible.`
      ).join('\n\n');

      // Build scenario context
      const scenarioContext = scenarios && scenarios.length > 0
        ? `\n\nACTIVE SCENARIOS: ${scenarios.map(s => s.description).join('; ')}`
        : '';

      const prompt = loadPrompt('game/day-events', {
        fullContext: `Day ${day}: Generate events for the continuous simulation.${scenarioContext}`,
        day,
        eventCount: eventRequests.length,
        eventRequestsList
      });

      try {
        const response = await this.llm.generateJSON<{
          events: Array<{
            eventNumber: number;
            event: string;
            pointsToward: 'YES' | 'NO' | null;
          }>;
        }>(prompt, undefined, { temperature: 0.9, maxTokens: 5000 });

        // Create WorldEvent objects from LLM response
        response.events?.forEach((eventData, idx) => {
          const req = eventRequests[idx];
          if (!req) return;

          events.push({
            id: `event-${day}-${idx}`,
            day,
            type: req.type,
            actors: req.actors.map((a: SelectedActor) => a.id),
            description: eventData.event,
            relatedQuestion: req.questionId,
            pointsToward: eventData.pointsToward,
            visibility: 'public'
          });
        });
      } catch (error) {
        logger.error('Error generating events with LLM:', error, 'ContinuousGameGenerator');
        // Fallback to simple events if LLM fails
        return this.generateSimpleEvents(day, actors, questions, eventCount);
      }
    } else {
      // No LLM available, use simple events
      return this.generateSimpleEvents(day, actors, questions, eventCount);
    }

    return events;
  }

  /**
   * Generate simple placeholder events (fallback when LLM is not available)
   */
  private generateSimpleEvents(
    day: number,
    actors: SelectedActor[],
    questions: Question[],
    eventCount: number
  ): WorldEvent[] {
    const events: WorldEvent[] = [];

    for (let i = 0; i < eventCount; i++) {
      const question = questions[i % questions.length];
      if (!question) continue;

      events.push({
        id: `event-${day}-${i}`,
        day,
        type: 'announcement',
        actors: actors.slice(0, 2).map(a => a.id),
        description: `Event related to: ${question.text}`,
        relatedQuestion: toQuestionIdNumberOrNull(question.id),
        pointsToward: Math.random() > 0.5 ? (question.outcome ? 'YES' : 'NO') : null,
        visibility: 'public',
      });
    }

    return events;
  }

  /**
   * Get actor's group context - all groups they're in + recent messages
   */
  private getActorGroupContext(
    actorId: string,
    allGroups: GroupChat[],
    previousDays: DayTimeline[],
    allActors: SelectedActor[]
  ): string {
    const memberOf = allGroups.filter(g => g.members.includes(actorId));
    
    if (memberOf.length === 0) return '';
    
    const groupContexts = memberOf.map(group => {
      const recentMessages: string[] = [];
      
      // Get messages from last 3 days
      for (let i = previousDays.length - 1; i >= Math.max(0, previousDays.length - 3); i--) {
        const dayData = previousDays[i];
        if (!dayData) continue;
        
        const groupMessages = dayData.groupChats[group.id];
        if (groupMessages && groupMessages.length > 0) {
          // Get last 2 messages from this day
          const lastMessages = groupMessages.slice(-2);
          lastMessages.forEach(msg => {
            const sender = allActors.find(a => a.id === msg.from);
            if (sender) {
              recentMessages.push(`${sender.name}: ${msg.message}`);
            }
          });
        }
      }
      
      return `Group: ${group.name}\nRecent: ${recentMessages.length > 0 ? recentMessages.join('; ') : 'No recent messages'}`;
    }).join('\n\n');
    
    return `Your Groups:\n${groupContexts}`;
  }

  /**
   * Get group activity chance based on day
   */
  private getGroupActivityChance(day: number): number {
    // Early days: Less activity (30%)
    if (day <= 10) return 0.3;
    // Mid game: More activity (60%)
    if (day <= 20) return 0.6;
    // Late game: High activity (80%)
    return 0.8;
  }

  /**
   * Generate group chat messages for the day
   */
  private async generateGroupMessages(
    day: number,
    events: WorldEvent[],
    groupChats: GroupChat[],
    allActors: SelectedActor[],
    previousDays: DayTimeline[],
    luckMood: Map<string, { luck: string; mood: number }>,
    connections: ActorConnection[],
    scenarios: Scenario[],
    questions: Question[]
  ): Promise<Record<string, ChatMessage[]>> {
    const messages: Record<string, ChatMessage[]> = {};
    const groupRequests: Array<{
      groupId: string;
      groupName: string;
      groupTheme: string;
      members: Array<{
        actorId: string;
        actorName: string;
        description: string;
        personality: string;
        role: string;
      }>;
      previousMessages: Array<{
        actorName: string;
        message: string;
        day: number;
      }>;
    }> = [];

    // Build requests for active groups
    for (const group of groupChats) {
      const activityChance = this.getGroupActivityChance(day);

      if (Math.random() < activityChance) {
        const numMessages = 1 + Math.floor(Math.random() * 3); // 1-3 messages

        // Pick random members to post
        const activeMembers = allActors
          .filter(a => group.members.includes(a.id))
          .sort(() => Math.random() - 0.5)
          .slice(0, numMessages);

        if (activeMembers.length > 0) {
          // Get recent conversation history from this group (last 2-3 days, max 5 messages)
          const recentMessages: Array<{
            actorName: string;
            message: string;
            day: number;
          }> = [];

          for (let i = previousDays.length - 1; i >= Math.max(0, previousDays.length - 3); i--) {
            const dayData = previousDays[i];
            if (!dayData) continue;

            const groupMessages = dayData.groupChats?.[group.id] || [];

            for (const msg of groupMessages.slice(-5)) {
              const actor = allActors.find(a => a.id === msg.from);
              if (actor) {
                recentMessages.unshift({
                  actorName: actor.name,
                  message: msg.message,
                  day: dayData.day,
                });
              }
            }
          }

          groupRequests.push({
            groupId: group.id,
            groupName: group.name,
            groupTheme: group.theme,
            members: activeMembers.map(a => ({
              actorId: a.id,
              actorName: a.name,
              description: a.description || '',
              personality: a.personality || '',
              role: a.role,
            })),
            previousMessages: recentMessages.slice(-5), // Keep last 5 messages max
          });
        }
      }
    }

    // If no active groups, return empty
    if (groupRequests.length === 0) {
      return messages;
    }

    // If no LLM available, return empty
    if (!this.llm) {
      return messages;
    }

    // Build emotional state context for actors
    const getEmotionalState = (actorId: string): string => {
      const state = luckMood.get(actorId);
      if (!state) return '';

      const moodDesc = state.mood > 0.3 ? 'confident' : state.mood < -0.3 ? 'pessimistic' : 'neutral';
      const luckDesc = state.luck === 'high' ? '🍀 lucky streak' : state.luck === 'low' ? '💀 unlucky' : 'average luck';
      return ` [${moodDesc}, ${luckDesc}]`;
    };

    // Build relationship context between group members
    const getRelationshipContext = (groupMembers: Array<{ actorId: string; actorName: string }>): string => {
      if (groupMembers.length < 2) return '';

      const relevantConnections = connections.filter(conn =>
        groupMembers.some(m => m.actorId === conn.actor1) &&
        groupMembers.some(m => m.actorId === conn.actor2)
      );

      if (relevantConnections.length === 0) return '';

      const connectionLines = relevantConnections.map(conn => {
        const actor1 = groupMembers.find(m => m.actorId === conn.actor1);
        const actor2 = groupMembers.find(m => m.actorId === conn.actor2);
        return `   • ${actor1?.actorName} ↔️ ${actor2?.actorName}: ${conn.relationship}`;
      }).join('\n');

      return `\n   \n   RELATIONSHIPS IN THIS GROUP:\n${connectionLines}\n`;
    };

    const scenarioContext = scenarios.length > 0
      ? `\n\nACTIVE SCENARIOS: ${scenarios.map(s => s.description).join('; ')}`
      : '';

    const questionContext = questions.length > 0
      ? `\n\nQUESTIONS TO RESOLVE: ${questions.map(q => q.text).join('; ')}`
      : '';

    const groupsList = groupRequests.map((req, i) => `${i + 1}. "${req.groupName}"
   
   MEMBERS IN THIS CHAT (don't gossip about them):
${req.members.map((m, j) => {
  const actor = allActors.find(a => a.id === m.actorId);
  const emotionalState = getEmotionalState(m.actorId);
  return `   ${j + 1}. ${m.actorName}${emotionalState} [${actor?.affiliations?.join(', ') || 'independent'}]`;
}).join('\n')}${getRelationshipContext(req.members)}
   
   PEOPLE NOT IN THIS CHAT (you can gossip):
   ${allActors.filter(a => !req.members.find(m => m.actorId === a.id)).slice(0, 12).map(a => a.name).join(', ')}
   
   ${req.previousMessages.length > 0 ? `CONVERSATION HISTORY:\n${req.previousMessages.map(pm => `   [Day ${pm.day}] ${pm.actorName}: "${pm.message}"`).join('\n')}\n   \n   ` : ''}PRIVATE CHAT RULES:
   ✅ Share insider info about YOUR orgs (be strategic about what you reveal)
   ✅ Discuss vulnerabilities, doubts, real plans
   ✅ Gossip about outsiders
   ✅ Respond naturally to each other
   ✅ Reference scenarios/questions/events from insider perspective
   ✅ Let emotional state influence your tone (confident/pessimistic/neutral)
   ✅ Consider your relationships with other members
   ❌ DON'T gossip about members IN this chat
   ❌ DON'T just repeat public statements
   
   Generate ${req.members.length} messages:
${req.members.map((m, idx) => {
  const actor = allActors.find(a => a.id === m.actorId);
  const emotionalState = getEmotionalState(m.actorId);
  return `   ${idx + 1}. ${m.actorName}${emotionalState} [${actor?.affiliations?.join(', ') || 'independent'}]:
      ${idx === 0
        ? 'Start/continue - share insider knowledge, strategic thoughts, or private reactions'
        : 'Respond to previous - add insider perspective, gossip about outsiders, share org info'}`;
}).join('\n')}
   
   Max 200 chars each. PRIVATE conversation - strategic, vulnerable, gossipy.
`).join('\n');

    const prompt = loadPrompt('game/group-messages', {
      fullContext: `Day ${day}: Continuous game simulation`,
      scenarioContext,
      questionContext,
      day,
      eventsList: events.map(e => e.description).join('; '),
      recentEventContext: events.length > 0 ? `\nMost talked about: ${events[0]!.description}` : '',
      groupCount: groupRequests.length,
      groupsList
    });

    try {
      const response = await this.llm.generateJSON<{
        groups: Array<{
          groupId: string;
          messages: Array<{
            actorId: string;
            message: string;
          }>;
        }>;
      }>(
        prompt,
        { required: ['groups'] },
        { temperature: 1.0, maxTokens: 5000 }
      );

      const groups = response.groups || [];
      if (groups.length > 0) {
        // Convert to expected format
        groups.forEach((group, i) => {
          const req = groupRequests[i];
          if (!req) return;

          messages[group.groupId] = group.messages.map((msg, j) => ({
            from: msg.actorId,
            message: msg.message,
            timestamp: `2025-10-${String(day).padStart(2, '0')}T${String(10 + j * 2).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}:00Z`,
            clueStrength: req.members.find(m => m.actorId === msg.actorId)?.role === 'main' ? 0.7 : 0.4,
          }));
        });
      }

      return messages;
    } catch (error) {
      logger.error('Failed to generate group messages:', error, 'ContinuousGameGenerator');
      return messages;
    }
  }

  /**
   * Generate luck changes based on events
   */
  private generateLuckChanges(
    day: number,
    events: WorldEvent[],
    actors: SelectedActor[],
    luckMood: Map<string, { luck: string; mood: number }>
  ): LuckChange[] {
    const changes: LuckChange[] = [];
    
    // Create a Set of valid actor IDs for efficient lookup
    const validActorIds = new Set(actors.map(a => a.id));
    
    // Actors involved in events may have luck changes
    events.forEach(event => {
      event.actors.forEach(actorId => {
        // Validate that actor exists in selected actors list
        if (!validActorIds.has(actorId)) {
          return; // Skip actors not in the game
        }
        
        if (Math.random() > 0.7) { // 30% chance
          const current = luckMood.get(actorId);
          if (current) {
            const luckLevels: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high'];
            const currentIdx = luckLevels.indexOf(current.luck as 'low' | 'medium' | 'high');
            
            // Determine direction based on event type and outcome
            let change: number;
            const isPositiveEvent = event.type === 'deal' || event.type === 'announcement' || event.pointsToward === 'YES';
            const isNegativeEvent = event.type === 'scandal' || event.type === 'conflict' || event.pointsToward === 'NO';
            
            if (isPositiveEvent) {
              // 70% chance to increase luck, 30% to decrease
              change = Math.random() > 0.3 ? 1 : -1;
            } else if (isNegativeEvent) {
              // 70% chance to decrease luck, 30% to increase
              change = Math.random() > 0.3 ? -1 : 1;
            } else {
              // Neutral: 50/50
              change = Math.random() > 0.5 ? 1 : -1;
            }
            
            const newIdx = Math.max(0, Math.min(2, currentIdx + change));
            const newLuck = luckLevels[newIdx] as 'low' | 'medium' | 'high';
            
            if (newLuck !== current.luck) {
              changes.push({
                actor: actorId,
                from: current.luck,
                to: newLuck,
                reason: `Day ${day}: ${event.description}`,
              });
              current.luck = newLuck;
            }
          }
        }
      });
    });

    return changes;
  }

  /**
   * Generate mood changes based on events
   */
  private generateMoodChanges(
    day: number,
    events: WorldEvent[],
    actors: SelectedActor[],
    luckMood: Map<string, { luck: string; mood: number }>
  ): MoodChange[] {
    const changes: MoodChange[] = [];
    
    // Create a Set of valid actor IDs for efficient lookup
    const validActorIds = new Set(actors.map(a => a.id));
    
    // Actors involved in events may have mood changes
    events.forEach(event => {
      event.actors.forEach(actorId => {
        // Validate that actor exists in selected actors list
        if (!validActorIds.has(actorId)) {
          return; // Skip actors not in the game
        }
        
        if (Math.random() > 0.6) { // 40% chance
          const current = luckMood.get(actorId);
          if (current) {
            // Determine direction and magnitude based on event type and outcome
            let moodChange: number;
            const isPositiveEvent = event.type === 'deal' || event.type === 'announcement' || event.pointsToward === 'YES';
            const isNegativeEvent = event.type === 'scandal' || event.type === 'conflict' || event.pointsToward === 'NO';
            
            if (isPositiveEvent) {
              // Positive events: bias toward positive mood change (0 to +0.3)
              moodChange = Math.random() * 0.3;
            } else if (isNegativeEvent) {
              // Negative events: bias toward negative mood change (-0.3 to 0)
              moodChange = Math.random() * -0.3;
            } else {
              // Neutral events: balanced change (-0.2 to +0.2)
              moodChange = (Math.random() - 0.5) * 0.4;
            }
            
            const newMood = Math.max(-1, Math.min(1, current.mood + moodChange));
            
            if (Math.abs(newMood - current.mood) > 0.05) {
              changes.push({
                actor: actorId,
                from: current.mood,
                to: newMood,
                reason: `Day ${day}: ${event.description}`,
              });
              current.mood = newMood;
            }
          }
        }
      });
    });

    return changes;
  }

  /**
   * Apply ambient mood drift for all actors
   * Small random variations to keep actors feeling alive
   */
  private applyAmbientMoodDrift(
    actors: SelectedActor[],
    luckMood: Map<string, { luck: string; mood: number }>
  ): void {
    actors.forEach(actor => {
      const current = luckMood.get(actor.id);
      if (current) {
        // 60% chance of mood drift each day
        if (Math.random() > 0.4) {
          // Small drift: -0.1 to +0.1 (bidirectional, perfectly balanced)
          // 5% chance of larger mood swing for variety
          const isLargeSwing = Math.random() > 0.95;
          const range = isLargeSwing ? 0.4 : 0.2; // Large: ±0.2, Normal: ±0.1
          const drift = (Math.random() - 0.5) * range;
          const newMood = Math.max(-1, Math.min(1, current.mood + drift));
          current.mood = newMood;
        }
        
        // 15% chance of luck changing (up or down equally)
        if (Math.random() > 0.85) {
          const luckLevels: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high'];
          const currentIdx = luckLevels.indexOf(current.luck as 'low' | 'medium' | 'high');
          // 50/50 chance to go up or down
          const change = Math.random() > 0.5 ? 1 : -1;
          const newIdx = Math.max(0, Math.min(2, currentIdx + change));
          // Type assertion safe because newIdx is clamped to [0, 2]
          current.luck = luckLevels[newIdx] as 'low' | 'medium' | 'high';
        }
      }
    });
  }
}


