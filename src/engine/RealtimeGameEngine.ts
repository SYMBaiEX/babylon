/**
 * Enhanced Realtime Game Engine
 * 
 * IMPROVEMENTS:
 * - Events are specific to prediction questions (not generic)
 * - Posts use LLM to generate real content about events
 * - Time-aware: clue strength increases as resolution approaches
 * - Resolution events definitively prove outcomes
 * - Group chats discuss active predictions
 * - All content drives toward question resolution
 */

import { EventEmitter } from 'events';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { Prisma } from '@prisma/client';
import { FeedGenerator } from './FeedGenerator';
import { QuestionManager } from './QuestionManager';
import { PriceEngine } from './PriceEngine';
import { PerpetualsEngine } from './PerpetualsEngine';
import { A2AGameIntegration, type A2AGameConfig } from './A2AGameIntegration';
import { BabylonLLMClient } from '../generator/llm/openai-client';
import { shuffleArray, toQuestionIdNumber, toQuestionIdNumberOrNull } from '@/shared/utils';
import { db } from '../lib/database-service';
import { ReputationService } from '../lib/services/reputation-service';
import { logger } from '@/lib/logger';
import type {
  SelectedActor,
  Actor,
  ActorTier,
  Organization,
  Question,
  FeedPost,
  PriceUpdate,
  ActorConnection,
  Scenario,
  GroupChat,
  WorldEvent,
  ActorsDatabase,
  ChatMessage,
} from '@/shared/types';

interface RealtimeConfig {
  tickIntervalMs?: number;
  postsPerTick?: number;
  historyDays?: number;
  savePath?: string;
  a2a?: A2AGameConfig;
}

interface MinuteTick {
  timestamp: string;
  posts: FeedPost[];
  priceUpdates: PriceUpdate[];
  events: WorldEvent[];
  groupChatMessages: Record<string, ChatMessage[]>;
  questionsResolved: number;
  questionsCreated: number;
}

export class RealtimeGameEngine extends EventEmitter {
  private config: Required<RealtimeConfig>;
  private llm: BabylonLLMClient;
  private feedGenerator: FeedGenerator;
  private questionManager: QuestionManager;
  private priceEngine: PriceEngine;
  private perpsEngine: PerpetualsEngine;
  private a2aIntegration: A2AGameIntegration;

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

  private static readonly GAME_START_DATE = new Date('2025-10-01T00:00:00Z');
  private static readonly GAME_ID = 'realtime';

  constructor(config?: RealtimeConfig) {
    super();

    this.config = {
      tickIntervalMs: config?.tickIntervalMs || 60000,
      postsPerTick: config?.postsPerTick || 15,
      historyDays: config?.historyDays || 30,
      savePath: config?.savePath || join(process.cwd(), 'games', 'realtime'),
      a2a: config?.a2a ?? { enabled: false },
    };

    this.llm = new BabylonLLMClient();
    this.feedGenerator = new FeedGenerator(this.llm);
    this.questionManager = new QuestionManager(this.llm);
    this.priceEngine = new PriceEngine(Date.now());
    this.perpsEngine = new PerpetualsEngine();
    // Ensure a2a config is properly typed - already set in this.config above
    this.a2aIntegration = new A2AGameIntegration(this.config.a2a);
  }

  async initialize(): Promise<void> {
    logger.info('INITIALIZING ENHANCED REALTIME ENGINE', undefined, 'RealtimeGameEngine');

    const actorsPath = join(process.cwd(), 'data/actors.json');
    const actorsData = JSON.parse(readFileSync(actorsPath, 'utf-8')) as ActorsDatabase;

    logger.info('Loading actors...', undefined, 'RealtimeGameEngine');
    this.actors = this.selectAllActors(actorsData.actors);
    logger.info(`Loaded ${this.actors.length} actors`, { actorCount: this.actors.length }, 'RealtimeGameEngine');

    logger.info('Initializing organizations and prices...', undefined, 'RealtimeGameEngine');
    this.organizations = actorsData.organizations;
    this.priceEngine.initializeCompanies(this.organizations);
    this.perpsEngine.initializeMarkets(this.organizations);
    const companies = this.organizations.filter(o => o.type === 'company');
    logger.info(`Initialized ${companies.length} company prices`, { companyCount: companies.length }, 'RealtimeGameEngine');

    await this.syncDatabaseState();

    logger.info('Generating scenarios...', undefined, 'RealtimeGameEngine');
    this.scenarios = await this.generateScenarios();
    logger.info(`Generated ${this.scenarios.length} scenarios`, { scenarioCount: this.scenarios.length }, 'RealtimeGameEngine');

    logger.info('Creating connections...', undefined, 'RealtimeGameEngine');
    this.connections = this.generateConnections();
    logger.info(`Generated ${this.connections.length} relationships`, { connectionCount: this.connections.length }, 'RealtimeGameEngine');

    logger.info('Creating group chats...', undefined, 'RealtimeGameEngine');
    this.groupChats = this.createGroupChats();
    logger.info(`Created ${this.groupChats.length} group chats`, { groupChatCount: this.groupChats.length }, 'RealtimeGameEngine');

    this.initializeLuckMood();
    this.feedGenerator.setOrganizations(this.organizations);

    await this.loadHistory();

    if (this.questions.length === 0) {
      logger.info('Generating initial questions...', undefined, 'RealtimeGameEngine');
      const newQuestions = await this.generateQuestions(5);
      this.questions.push(...newQuestions);
      logger.info(`Generated ${newQuestions.length} questions`, { questionCount: newQuestions.length }, 'RealtimeGameEngine');
    }

    // Initialize A2A integration
    await this.a2aIntegration.initialize();

    const activeQuestions = this.questions.filter(q => q.status === 'active').length;
    const a2aStatus = this.a2aIntegration.getStatus();
    logger.info('ENHANCED ENGINE READY', {
      activeQuestions,
      a2aEnabled: a2aStatus.enabled,
      a2aPort: this.config.a2a?.port || 8080
    }, 'RealtimeGameEngine');
  }

  start(): void {
    if (this.isRunning) return;

    logger.info('STARTING ENHANCED ENGINE', undefined, 'RealtimeGameEngine');
    this.isRunning = true;

    this.tick().catch(error => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Tick error: ${errorMessage}`, { error }, 'RealtimeGameEngine');
    });
    this.intervalId = setInterval(() => {
      this.tick().catch(error => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Tick error: ${errorMessage}`, { error }, 'RealtimeGameEngine');
      });
    }, this.config.tickIntervalMs);

    this.fundingIntervalId = setInterval(() => {
      this.perpsEngine.processFunding();
    }, 8 * 60 * 60 * 1000);

    this.dailySnapshotIntervalId = setInterval(() => {
      this.checkDailySnapshot();
    }, 60 * 1000);

    this.emit('started');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    if (this.intervalId) clearInterval(this.intervalId);
    if (this.fundingIntervalId) clearInterval(this.fundingIntervalId);
    if (this.dailySnapshotIntervalId) clearInterval(this.dailySnapshotIntervalId);

    this.isRunning = false;
    this.saveState();

    // Shutdown A2A integration
    await this.a2aIntegration.shutdown();

    this.emit('stopped');
  }

  /**
   * ENHANCED TICK: Generate content driven by active questions
   */
  private async tick(): Promise<void> {
    const timestamp = new Date().toISOString();
    const currentDate = timestamp.split('T')[0]!;
    
    logger.debug(`Generating tick at ${timestamp}`, { timestamp }, 'RealtimeGameEngine');

    try {
      // Step 1: Resolve expired questions with resolution events
      const activeQuestions = this.questions.filter(q => q.status === 'active');
      const toResolve = this.questionManager.getQuestionsToResolve(activeQuestions, currentDate);
      
      const resolutionEvents: WorldEvent[] = [];
      if (toResolve.length > 0) {
        logger.info(`Resolving ${toResolve.length} questions`, { count: toResolve.length }, 'RealtimeGameEngine');
        for (const question of toResolve) {
          // Generate definitive resolution event
          const resolutionEvent: WorldEvent = await this.generateResolutionEvent(question);
          resolutionEvents.push(resolutionEvent);

          const resolved = this.questionManager.resolveQuestion(question, question.outcome);
          const index = this.questions.findIndex(q => q.id === question.id);
          if (index >= 0) {
            this.questions[index] = resolved;
          }

          // Update on-chain reputation for all users who had positions
          logger.info(`Updating on-chain reputation for market ${question.id}`, { questionId: question.id }, 'RealtimeGameEngine');
          try {
            const reputationUpdates = await ReputationService.updateReputationForResolvedMarket({
              marketId: question.id.toString(),
              outcome: question.outcome,
            });

            const winners = reputationUpdates.filter(u => u.change > 0).length;
            const losers = reputationUpdates.filter(u => u.change < 0).length;
            const errors = reputationUpdates.filter(u => u.error).length;

            logger.info(`Reputation updated: ${winners} winners (+10), ${losers} losers (-5)${errors > 0 ? `, ${errors} errors` : ''}`, {
              winners,
              losers,
              errors,
              questionId: question.id
            }, 'RealtimeGameEngine');
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`Failed to update reputation for market ${question.id}: ${errorMessage}`, { error, questionId: question.id }, 'RealtimeGameEngine');
            // Don't fail the entire tick if reputation update fails
          }
        }
      }

      // Step 2: Create new questions
      const currentActive = this.questions.filter(q => q.status === 'active').length;
      let questionsCreated = 0;
      
      if (currentActive < 15) {
        const toCreate = Math.min(3, 20 - currentActive);
        const newQuestions = await this.generateQuestions(toCreate);
        this.questions.push(...newQuestions);
        questionsCreated = newQuestions.length;
        logger.info(`Created ${questionsCreated} new questions`, { count: questionsCreated }, 'RealtimeGameEngine');
      }

      // Step 3: Generate events for active questions (ENHANCED)
      const events = await this.generateQuestionDrivenEvents(activeQuestions, resolutionEvents);
      
      // Step 4: Update prices based on events
      const priceUpdates = await this.updatePrices(events);
      if (priceUpdates.length > 0) {
        logger.debug(`${priceUpdates.length} price updates`, { count: priceUpdates.length }, 'RealtimeGameEngine');
        
        const priceMap = new Map<string, number>();
        this.organizations.forEach(org => {
          if (org.type === 'company' && org.currentPrice) {
            priceMap.set(org.id, org.currentPrice);
          }
        });
        this.perpsEngine.updatePositions(priceMap);
      }

      // Step 5: Generate posts using LLM (ENHANCED)
      const posts = await this.generateLLMPosts(events, activeQuestions);
      logger.info(`Generated ${posts.length} LLM posts`, { count: posts.length }, 'RealtimeGameEngine');

      // Step 6: Generate group chat messages about questions (ENHANCED)
      const groupChatMessages = await this.generateGroupChatDiscussions(activeQuestions, events);

      const tick: MinuteTick = {
        timestamp,
        posts,
        priceUpdates,
        events,
        groupChatMessages,
        questionsResolved: toResolve.length,
        questionsCreated,
      };

      this.recentTicks.push(tick);
      
      const maxTicks = this.config.historyDays * 24 * 60;
      if (this.recentTicks.length > maxTicks) {
        this.recentTicks = this.recentTicks.slice(-maxTicks);
      }

      await this.persistTickData(tick).catch(error => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to persist tick data: ${errorMessage}`, { error }, 'RealtimeGameEngine');
      });

      this.emit('tick', tick);

      // Broadcast market data to A2A agents
      if (this.a2aIntegration.getStatus().enabled) {
        this.a2aIntegration.broadcastMarketData(this.questions, priceUpdates);

        // Broadcast significant events
        for (const event of events) {
          this.a2aIntegration.broadcastGameEvent({
            type: event.type,
            description: event.description,
            relatedQuestion: event.relatedQuestion ?? undefined,
            timestamp: Date.now(),
          });
        }
      }

      if (this.recentTicks.length % 10 === 0) {
        this.saveState();
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error in tick: ${errorMessage}`, { error }, 'RealtimeGameEngine');
      this.emit('error', error);
    }
  }

  /**
   * ENHANCED: Generate events that build toward question outcomes
   * Events are specific, dramatic, and hint at the predetermined outcome
   */
  private async generateQuestionDrivenEvents(
    activeQuestions: Question[],
    resolutionEvents: WorldEvent[]
  ): Promise<WorldEvent[]> {
    const events: WorldEvent[] = [...resolutionEvents];
    
    // Generate 2-4 events per tick
    const eventCount = 2 + Math.floor(Math.random() * 3);
    
    for (let i = 0; i < eventCount && activeQuestions.length > 0; i++) {
      const question = activeQuestions[Math.floor(Math.random() * activeQuestions.length)]!;
      
      // Calculate urgency based on days until resolution
      const daysUntilResolution = this.getDaysUntilResolution(question);
      const urgency = daysUntilResolution <= 1 ? 'critical' : daysUntilResolution <= 3 ? 'high' : 'normal';
      
      // Generate event using LLM
      const event = await this.generateEventForQuestion(question, urgency);
      events.push(event);
    }

    return events;
  }

  /**
   * Generate a specific event for a question using LLM
   */
  private async generateEventForQuestion(
    question: Question,
    urgency: 'normal' | 'high' | 'critical'
  ): Promise<WorldEvent> {
    const scenario = this.scenarios.find(s => s.id === question.scenario);
    const involvedActors = scenario
      ? this.actors.filter(a => scenario.mainActors.includes(a.id)).slice(0, 3)
      : shuffleArray(this.actors.filter(a => a.role === 'main')).slice(0, 3);

    const daysLeft = this.getDaysUntilResolution(question);
    const shouldPointToOutcome = urgency === 'critical' || (urgency === 'high' && Math.random() > 0.3);
    const currentDay = this.getGameDayNumber(new Date());

    const prompt = `Generate a SPECIFIC event for this prediction market question:

QUESTION: ${question.text}
PREDETERMINED OUTCOME: ${question.outcome ? 'YES' : 'NO'}
DAYS UNTIL RESOLUTION: ${daysLeft}
URGENCY: ${urgency}

INVOLVED ACTORS: ${involvedActors.map(a => `${a.name} (${a.description})`).join(', ')}

REQUIREMENTS:
- Event must be SPECIFIC and OBSERVABLE
- ${urgency === 'critical' ? 'Event must CLEARLY point toward the outcome' : urgency === 'high' ? 'Event should hint strongly at the outcome' : 'Event can be ambiguous or early development'}
- ${shouldPointToOutcome ? `Event should support the ${question.outcome ? 'YES' : 'NO'} outcome` : 'Event can be neutral or misleading'}
- Use actor names and be dramatic
- One sentence, max 150 characters
- Satirical tone

OUTPUT JSON:
{
  "description": "Your event here",
  "type": "announcement|scandal|deal|conflict|revelation"
}`;

    try {
      const response = await this.llm.generateJSON<{
        description: string;
        type: string;
      }>(prompt, undefined, { temperature: 0.8, maxTokens: 500 });

      return {
        id: `event-${Date.now()}-${Math.random()}`,
        day: currentDay,
        type: (response.type as WorldEvent['type']) || 'announcement',
        actors: involvedActors.map(a => a.id),
        description: response.description || `Development in: ${question.text}`,
        relatedQuestion: toQuestionIdNumberOrNull(question.id),
        pointsToward: shouldPointToOutcome ? (question.outcome ? 'YES' : 'NO') : null,
        visibility: 'public',
      };
    } catch (eventGenerationError) {
      const errorMessage = eventGenerationError instanceof Error ? eventGenerationError.message : 'Failed to generate event';
      logger.error(`Failed to generate event: ${errorMessage}`, { error: eventGenerationError, questionId: question.id }, 'RealtimeGameEngine');
      
      // Fallback to template-based event
      return {
        id: `event-${Date.now()}-${Math.random()}`,
        day: currentDay,
        type: 'announcement',
        actors: involvedActors.map(a => a.id),
        description: `${involvedActors[0]?.name || 'Someone'} makes move regarding: ${question.text}`,
        relatedQuestion: toQuestionIdNumberOrNull(question.id),
        pointsToward: shouldPointToOutcome ? (question.outcome ? 'YES' : 'NO') : null,
        visibility: 'public',
      };
    }
  }

  /**
   * Generate resolution event when question resolves
   */
  private async generateResolutionEvent(question: Question): Promise<WorldEvent> {
    const scenario = this.scenarios.find(s => s.id === question.scenario);
    const involvedActors = scenario
      ? this.actors.filter(a => scenario.mainActors.includes(a.id)).slice(0, 2)
      : shuffleArray(this.actors.filter(a => a.role === 'main')).slice(0, 2);

    const currentDay = this.getGameDayNumber(new Date());

    const prompt = `Generate a DEFINITIVE resolution event for this prediction market:

QUESTION: ${question.text}
FINAL OUTCOME: ${question.outcome ? 'YES' : 'NO'}

REQUIREMENT:
- Event must DEFINITIVELY PROVE the ${question.outcome ? 'YES' : 'NO'} outcome
- Must be concrete and observable
- ${question.outcome ? 'Clearly shows it HAPPENED/SUCCEEDED' : 'Clearly shows it FAILED/WAS CANCELLED/DID NOT HAPPEN'}
- Use specific details and actor names
- One sentence, max 150 characters
- Dramatic and satirical

OUTPUT JSON:
{
  "description": "Your resolution event",
  "type": "announcement|scandal|revelation"
}`;

    try {
      const response = await this.llm.generateJSON<{
        description: string;
        type: string;
      }>(prompt, undefined, { temperature: 0.7, maxTokens: 500 });

      return {
        id: `resolution-${Date.now()}`,
        day: currentDay,
        type: (response.type as WorldEvent['type']) || 'announcement',
        actors: involvedActors.map(a => a.id),
        description: response.description,
        relatedQuestion: toQuestionIdNumberOrNull(question.id),
        pointsToward: question.outcome ? 'YES' : 'NO',
        visibility: 'public',
      };
    } catch (resolutionError) {
      const errorMessage = resolutionError instanceof Error ? resolutionError.message : 'Failed to generate resolution event';
      logger.error(`Failed to generate resolution event: ${errorMessage}`, { error: resolutionError, questionId: question.id }, 'RealtimeGameEngine');
      
      return {
        id: `resolution-${Date.now()}`,
        day: currentDay,
        type: 'announcement',
        actors: involvedActors.map(a => a.id),
        description: `RESOLUTION: ${question.text} - Outcome is ${question.outcome ? 'YES' : 'NO'}`,
        relatedQuestion: toQuestionIdNumberOrNull(question.id),
        pointsToward: question.outcome ? 'YES' : 'NO',
        visibility: 'public',
      };
    }
  }

  /**
   * ENHANCED: Generate posts using LLM about events
   * Posts are specific, reference questions, and provide clues
   */
  private async generateLLMPosts(
    events: WorldEvent[],
    activeQuestions: Question[]
  ): Promise<FeedPost[]> {
    const posts: FeedPost[] = [];
    const numPosts = this.config.postsPerTick;
    
    // For each event, generate 3-5 posts from different perspectives
    for (const event of events.slice(0, Math.ceil(numPosts / 4))) {
      const question = activeQuestions.find(q => q.id === event.relatedQuestion);
      if (!question) continue;

      const daysLeft = this.getDaysUntilResolution(question);
      const clueStrength = this.calculateClueStrength(daysLeft);
      
      // Select diverse actors to comment
      const commentingActors = this.selectActorsForEvent(event, 3);
      
      for (const actor of commentingActors) {
        try {
          const post = await this.generateActorPostAboutEvent(
            actor,
            event,
            question,
            clueStrength
          );
          posts.push(post);
          
          if (posts.length >= numPosts) break;
        } catch (postGenerationError) {
          // Skip this post if LLM fails, continue to next
          const errorMessage = postGenerationError instanceof Error ? postGenerationError.message : 'Failed to generate post'
          logger.warn('Failed to generate post, skipping', { error: errorMessage, actorId: actor.id, eventId: event.id }, 'RealtimeGameEngine')
          continue;
        }
      }
      
      if (posts.length >= numPosts) break;
    }

    // Fill remaining quota with ambient posts
    while (posts.length < numPosts) {
      const question = activeQuestions[Math.floor(Math.random() * activeQuestions.length)];
      if (!question) break;

      const actor = shuffleArray(this.actors)[0];
      if (!actor) break;

      const post = await this.generateAmbientPostAboutQuestion(actor, question);
      if (post) { // Only add if LLM succeeded
        posts.push(post);
      } else {
        break; // Stop trying if LLM is failing
      }
    }

    return posts;
  }

  /**
   * Generate actor post about an event using LLM
   */
  private async generateActorPostAboutEvent(
    actor: SelectedActor,
    event: WorldEvent,
    question: Question,
    clueStrength: number
  ): Promise<FeedPost> {
    const prompt = `You are ${actor.name}. ${actor.description || ''}

EVENT: ${event.description}
RELATED QUESTION: ${question.text}
THIS EVENT ${event.pointsToward === 'YES' ? 'supports YES' : event.pointsToward === 'NO' ? 'supports NO' : 'is ambiguous'}

Write a social media post (max 280 chars) reacting to this event.
${actor.personality ? `Your personality: ${actor.personality}` : ''}
${actor.postStyle ? `Your style: ${actor.postStyle}` : ''}

The post should:
- React to the EVENT specifically
- ${clueStrength > 0.7 ? 'Provide clear insight about the outcome' : clueStrength > 0.4 ? 'Give subtle hints' : 'Be speculative'}
- Match your personality
- Be satirical and entertaining

OUTPUT JSON:
{
  "post": "your post here",
  "sentiment": -1 to 1,
  "clueStrength": 0 to 1,
  "pointsToward": true/false/null
}`;

    try {
      const response = await this.llm.generateJSON<{
        post: string;
        sentiment: number;
        clueStrength: number;
        pointsToward: boolean | null;
      }>(prompt, undefined, { temperature: 0.9, maxTokens: 1000 });

      // Strict validation
      if (!response.post || typeof response.post !== 'string') {
        throw new Error('Invalid LLM response for post');
      }

      return {
        id: `post-${Date.now()}-${Math.random()}`,
        day: Math.floor(Date.now() / (1000 * 60 * 60 * 24)),
        timestamp: new Date().toISOString(),
        type: 'post',
        content: response.post,
        author: actor.id,
        authorName: actor.name,
        sentiment: response.sentiment || 0,
        clueStrength: response.clueStrength || clueStrength,
        pointsToward: response.pointsToward ?? (event.pointsToward === 'YES'),
        relatedEvent: event.id,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to generate LLM post: ${errorMessage}`, { error, actorId: actor.id, eventId: event.id }, 'RealtimeGameEngine');
      throw error; // Propagate error instead of fallback
    }
  }

  /**
   * Generate ambient post about question using LLM
   */
  private async generateAmbientPostAboutQuestion(
    actor: SelectedActor,
    question: Question
  ): Promise<FeedPost | null> {
    const daysLeft = this.getDaysUntilResolution(question);
    const clueStrength = this.calculateClueStrength(daysLeft);

    const prompt = `You are ${actor.name}. ${actor.description || ''}

ACTIVE QUESTION: ${question.text}
DAYS LEFT: ${daysLeft}

Write a social media post (max 280 chars) speculating about this question.
${actor.postStyle ? `Your style: ${actor.postStyle}` : ''}

OUTPUT JSON:
{
  "post": "your speculation here"
}`;

    try {
      const response = await this.llm.generateJSON<{ post: string }>(
        prompt,
        undefined,
        { temperature: 0.9, maxTokens: 500 }
      );

      // Strict validation
      if (!response.post || typeof response.post !== 'string') {
        return null;
      }

      return {
        id: `post-${Date.now()}-${Math.random()}`,
        day: Math.floor(Date.now() / (1000 * 60 * 60 * 24)),
        timestamp: new Date().toISOString(),
        type: 'post',
        content: response.post,
        author: actor.id,
        authorName: actor.name,
        sentiment: Math.random() * 2 - 1,
        clueStrength,
        pointsToward: Math.random() > 0.5,
      };
    } catch (llmError) {
      // Don't create post if LLM fails
      const errorMessage = llmError instanceof Error ? llmError.message : 'Failed to generate LLM post'
      logger.warn('Failed to generate LLM post, returning null', { error: errorMessage, actorId: actor.id }, 'RealtimeGameEngine')
      return null;
    }
  }

  /**
   * ENHANCED: Generate group chat messages about active questions
   */
  private async generateGroupChatDiscussions(
    activeQuestions: Question[],
    events: WorldEvent[]
  ): Promise<Record<string, ChatMessage[]>> {
    const discussions: Record<string, ChatMessage[]> = {};

    // Each group chat discusses 0-2 questions
    for (const groupChat of this.groupChats.slice(0, 10)) { // Limit to first 10 chats
      const chatMessages: ChatMessage[] = [];
      
      // Pick 1-2 relevant questions
      const relevantQuestions = shuffleArray(activeQuestions).slice(0, 1 + Math.floor(Math.random() * 2));
      
      for (const question of relevantQuestions) {
        // Find relevant event
        const relevantEvent = events.find(e => e.relatedQuestion === question.id);
        if (!relevantEvent) continue;

        // Admin posts about the event/question
        const adminActor = this.actors.find(a => a.id === groupChat.admin);
        if (!adminActor) continue;

        const daysLeft = this.getDaysUntilResolution(question);
        const clueStrength = this.calculateClueStrength(daysLeft);

        chatMessages.push({
          from: groupChat.admin,
          message: `Thoughts on: ${relevantEvent.description}?`,
          timestamp: new Date().toISOString(),
          clueStrength,
        });

        // 1-2 members respond
        const memberCount = 1 + Math.floor(Math.random() * 2);
        const chatMembers = shuffleArray(groupChat.members.filter(m => m !== groupChat.admin)).slice(0, memberCount);
        
        for (const memberId of chatMembers) {
          const memberActor = this.actors.find(a => a.id === memberId);
          if (!memberActor) continue;

          try {
            const response = await this.generateChatResponse(memberActor, question, relevantEvent, clueStrength);
            chatMessages.push(response);
          } catch (chatError) {
            // Skip this message if LLM fails
            const errorMessage = chatError instanceof Error ? chatError.message : 'Failed to generate chat response'
            logger.warn('Failed to generate chat response, skipping', { error: errorMessage, actorId: memberActor.id, questionId: question.id }, 'RealtimeGameEngine')
            continue;
          }
        }
      }

      if (chatMessages.length > 0) {
        discussions[groupChat.id] = chatMessages;
      }
    }

    return discussions;
  }

  /**
   * Generate chat response from actor
   */
  private async generateChatResponse(
    actor: SelectedActor,
    question: Question,
    event: WorldEvent,
    clueStrength: number
  ): Promise<ChatMessage> {
    const prompt = `You are ${actor.name} in a private group chat.

EVENT: ${event.description}
QUESTION: ${question.text}
OUTCOME: ${question.outcome ? 'YES' : 'NO'} (you may hint at this)

Write a brief chat message (max 150 chars) giving your insider take.
${clueStrength > 0.7 ? 'Be fairly direct about what you think will happen.' : 'Be speculative and cautious.'}

OUTPUT JSON:
{
  "message": "your message"
}`;

    try {
      const response = await this.llm.generateJSON<{ message: string }>(
        prompt,
        undefined,
        { temperature: 0.9, maxTokens: 500 }
      );

      // Strict validation
      if (!response.message || typeof response.message !== 'string') {
        throw new Error('Invalid LLM response for message');
      }

      return {
        from: actor.id,
        message: response.message,
        timestamp: new Date().toISOString(),
        clueStrength,
      };
    } catch (error) {
      throw error; // Propagate error instead of fallback
    }
  }

  /**
   * Calculate clue strength based on days until resolution
   * - 7+ days away: 0.1-0.3 (vague speculation)
   * - 4-6 days: 0.3-0.5 (hints emerging)
   * - 2-3 days: 0.5-0.7 (clear trends)
   * - 1 day: 0.7-0.9 (strong indicators)
   * - Resolution day: 0.9-1.0 (definitive)
   */
  private calculateClueStrength(daysUntilResolution: number): number {
    if (daysUntilResolution >= 7) {
      return 0.1 + Math.random() * 0.2; // 0.1-0.3
    } else if (daysUntilResolution >= 4) {
      return 0.3 + Math.random() * 0.2; // 0.3-0.5
    } else if (daysUntilResolution >= 2) {
      return 0.5 + Math.random() * 0.2; // 0.5-0.7
    } else if (daysUntilResolution >= 1) {
      return 0.7 + Math.random() * 0.2; // 0.7-0.9
    } else {
      return 0.9 + Math.random() * 0.1; // 0.9-1.0 (resolution day)
    }
  }

  /**
   * Get days until question resolves
   */
  private getDaysUntilResolution(question: Question): number {
    if (!question.resolutionDate) return 999;
    
    const now = new Date();
    const resolution = new Date(question.resolutionDate);
    const diffTime = resolution.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return Math.max(0, diffDays);
  }

  /**
   * Select actors relevant to an event
   */
  private selectActorsForEvent(event: WorldEvent, count: number): SelectedActor[] {
    const eventActors = event.actors
      .map(id => this.actors.find(a => a.id === id))
      .filter(Boolean) as SelectedActor[];
    
    // Add other actors from same domain
    const relatedActors = this.actors.filter(a => 
      a.role === 'main' &&
      !event.actors.includes(a.id) &&
      eventActors.some(ea => ea.domain?.some(d => a.domain?.includes(d)))
    );

    const selected = [...eventActors, ...shuffleArray(relatedActors)].slice(0, count);
    return selected;
  }

  // ... rest of helper methods stay the same ...

  private async updatePrices(events: WorldEvent[]): Promise<PriceUpdate[]> {
    const updates: PriceUpdate[] = [];
    
    for (const event of events) {
      const affectedCompanies = this.organizations.filter(org => {
        if (org.type !== 'company') return false;
        return event.actors.some(actorId => {
          const actor = this.actors.find(a => a.id === actorId);
          return actor?.affiliations?.includes(org.id);
        });
      });

      for (const company of affectedCompanies) {
        // Price direction based on event outcome hint
        const direction = event.pointsToward === 'YES' ? 'positive' : event.pointsToward === 'NO' ? 'negative' : (Math.random() > 0.5 ? 'positive' : 'negative');
        const magnitude = event.type === 'scandal' ? 'major' : event.type === 'announcement' ? 'moderate' : 'minor';
        
        const update = this.priceEngine.applyEventImpact(company.id, event, direction, magnitude);
        if (update) {
          updates.push(update);
        }
      }
    }

    return updates;
  }

  private async generateQuestions(_count: number): Promise<Question[]> {
    const currentDate = new Date().toISOString().split('T')[0]!;
    const activeQuestions = this.questions.filter(q => q.status === 'active');
    const nextId = Math.max(0, ...this.questions.map(q => toQuestionIdNumber(q.id))) + 1;

    // Get recent events for context
    const recentEvents = this.recentTicks
      .slice(-60) // Last hour
      .flatMap(t => t.events);

    const recentDays = this.buildRecentDaysContext(recentEvents);

    return await this.questionManager.generateDailyQuestions({
      currentDate,
      scenarios: this.scenarios,
      actors: this.actors.filter(a => a.role === 'main'),
      organizations: this.organizations,
      activeQuestions,
      recentEvents: recentDays.map(day => ({ 
        day: day.day, 
        summary: `Day ${day.day} events`, 
        events: day.events, 
        groupChats: {}, 
        feedPosts: [], 
        luckChanges: [], 
        moodChanges: [] 
      })),
      nextQuestionId: nextId,
    });
  }

  private buildRecentDaysContext(recentEvents: WorldEvent[]): Array<{ day: number; events: WorldEvent[] }> {
    // Build pseudo-timeline from recent events for question generation context
    return [{
      day: 1,
      events: recentEvents.slice(-10),
    }];
  }

  private checkDailySnapshot(): void {
    const currentDate = new Date().toISOString().split('T')[0]!;
    
    if (currentDate !== this.lastDailySnapshot) {
      logger.info(`Recording daily snapshot for ${this.lastDailySnapshot}`, { date: this.lastDailySnapshot }, 'RealtimeGameEngine');
      this.perpsEngine.recordDailySnapshot(this.lastDailySnapshot);
      this.lastDailySnapshot = currentDate;
      this.saveState();
    }
  }

  private async syncDatabaseState(): Promise<void> {
    logger.info('Syncing engine state to database...', undefined, 'RealtimeGameEngine');
    try {
      const gameState = await db.getGameState();
      if (!gameState) {
        await db.initializeGame();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to ensure game state exists: ${errorMessage}`, { error }, 'RealtimeGameEngine');
    }

    await Promise.allSettled(
      this.actors.map(async (actor) => {
        try {
          // Convert SelectedActor to Actor (SelectedActor extends Actor, so this is safe)
          const actorData: Actor = {
            id: actor.id,
            name: actor.name,
            description: actor.description,
            domain: actor.domain,
            personality: actor.personality,
            role: actor.role,
            affiliations: actor.affiliations,
            postStyle: actor.postStyle,
            postExample: actor.postExample,
            tier: actor.tier,
          };
          await db.upsertActor(actorData);
        } catch (syncError) {
          const errorMessage = syncError instanceof Error ? syncError.message : 'Failed to sync actor';
          logger.warn(`Failed to sync actor ${actor.id}: ${errorMessage}`, { error: syncError, actorId: actor.id }, 'RealtimeGameEngine');
        }
      })
    );

    await Promise.allSettled(
      this.organizations.map(async (org) => {
        try {
          await db.upsertOrganization(org);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.warn(`Failed to sync organization ${org.id}: ${errorMessage}`, { error, orgId: org.id }, 'RealtimeGameEngine');
        }
      })
    );
  }

  private getGameDayNumber(date: Date): number {
    const diff = date.getTime() - RealtimeGameEngine.GAME_START_DATE.getTime();
    if (diff <= 0) return 0;
    const dayMs = 24 * 60 * 60 * 1000;
    return Math.floor(diff / dayMs);
  }

  private async persistTickData(tick: MinuteTick): Promise<void> {
    const tickDate = new Date(tick.timestamp);
    const dayNumber = this.getGameDayNumber(tickDate);

    if (tick.posts.length > 0) {
      await db.createManyPosts(
        tick.posts.map((post) => ({
          ...post,
          gameId: RealtimeGameEngine.GAME_ID,
          dayNumber,
        }))
      );
    }

    if (tick.events.length > 0) {
      for (const event of tick.events) {
        try {
          await db.createEvent({
            id: event.id,
            eventType: event.type,
            description: event.description,
            actors: event.actors,
            relatedQuestion: typeof event.relatedQuestion === 'number' ? event.relatedQuestion : undefined,
            pointsToward: event.pointsToward ?? undefined,
            visibility: event.visibility,
            gameId: RealtimeGameEngine.GAME_ID,
            dayNumber,
          });
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002'
          ) {
            // Duplicate event, skip
            continue;
          }
          throw error;
        }
      }
    }

    if (tick.priceUpdates.length > 0) {
      await Promise.allSettled(
        tick.priceUpdates.map(async (update) => {
          try {
            await db.updateOrganizationPrice(update.organizationId, update.newPrice);
          } catch (error) {
            if (
              error instanceof Prisma.PrismaClientKnownRequestError &&
              error.code === 'P2025'
            ) {
              const org = this.organizations.find((o) => o.id === update.organizationId);
              if (org) {
                try {
                  await db.upsertOrganization(org);
                  await db.updateOrganizationPrice(update.organizationId, update.newPrice);
                  return;
                } catch (nestedError) {
                  const nestedErrorMessage = nestedError instanceof Error ? nestedError.message : String(nestedError);
                  logger.warn(`Failed to upsert organization ${update.organizationId}: ${nestedErrorMessage}`, { error: nestedError, organizationId: update.organizationId }, 'RealtimeGameEngine');
                }
              }
            }
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.warn(`Failed to update price for ${update.organizationId}: ${errorMessage}`, { error, organizationId: update.organizationId }, 'RealtimeGameEngine');
          }

          try {
            await db.recordPriceUpdate(
              update.organizationId,
              update.newPrice,
              update.change,
              update.changePercent
            );
          } catch (error) {
            if (
              error instanceof Prisma.PrismaClientKnownRequestError &&
              error.code === 'P2003'
            ) {
              const org = this.organizations.find((o) => o.id === update.organizationId);
              if (org) {
                try {
                  await db.upsertOrganization(org);
                  await db.recordPriceUpdate(
                    update.organizationId,
                    update.newPrice,
                    update.change,
                    update.changePercent
                  );
                  return;
                } catch (nestedError) {
                  const nestedErrorMessage = nestedError instanceof Error ? nestedError.message : String(nestedError);
                  logger.warn(`Failed to reconcile price update for ${update.organizationId}: ${nestedErrorMessage}`, { error: nestedError, organizationId: update.organizationId }, 'RealtimeGameEngine');
                }
              }
            }
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.warn(`Failed to record price update for ${update.organizationId}: ${errorMessage}`, { error, organizationId: update.organizationId }, 'RealtimeGameEngine');
          }
        })
      );
    }

    try {
      await db.updateGameState({
        lastTickAt: tickDate,
        activeQuestions: this.questions.filter((q) => q.status === 'active').length,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to update game state metadata: ${errorMessage}`, { error }, 'RealtimeGameEngine');
    }
  }

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

  private async loadHistory(): Promise<void> {
    const historyPath = join(this.config.savePath, 'history.json');
    
    if (existsSync(historyPath)) {
      try {
        const data = JSON.parse(readFileSync(historyPath, 'utf-8'));
        this.recentTicks = data.ticks || [];
        this.questions = data.questions || [];
        this.lastDailySnapshot = data.lastDailySnapshot || new Date().toISOString().split('T')[0]!;
        
        if (data.perpsState) {
          this.perpsEngine.importState(data.perpsState);
        }
        
        logger.info('Loaded history', {
          ticks: this.recentTicks.length,
          questions: this.questions.length
        }, 'RealtimeGameEngine');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to load history: ${errorMessage}`, { error }, 'RealtimeGameEngine');
      }
    }
  }

  // Helper methods
  private selectAllActors(actorList: Actor[]): SelectedActor[] {
    return actorList.map((a: Actor) => ({
      ...a,
      tier: (a.tier as ActorTier) || 'C_TIER',
      role: (a.tier === 'S_TIER' || a.tier === 'A_TIER') ? 'main' : 'supporting',
      initialLuck: this.randomLuck(),
      initialMood: this.randomMood(),
    }));
  }

  private async generateScenarios(): Promise<Scenario[]> {
    return [
      { id: 1, title: 'Tech Drama', description: 'Tech companies and feuds', mainActors: [], involvedOrganizations: [], theme: 'tech' },
      { id: 2, title: 'Political Chaos', description: 'Political scandals', mainActors: [], involvedOrganizations: [], theme: 'politics' },
      { id: 3, title: 'Market Mayhem', description: 'Stock and crypto chaos', mainActors: [], involvedOrganizations: [], theme: 'finance' },
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

  getPerpsEngine(): PerpetualsEngine {
    return this.perpsEngine;
  }

  getAllQuestions(): Question[] {
    return this.questions;
  }

  getAllOrganizations(): Organization[] {
    return this.organizations;
  }

  getRecentPosts(minutes: number = 60): FeedPost[] {
    return this.recentTicks
      .slice(-minutes)
      .flatMap(t => t.posts);
  }

  getGroupChatMessages(chatId: string, minutes: number = 60): ChatMessage[] {
    return this.recentTicks
      .slice(-minutes)
      .flatMap(t => t.groupChatMessages[chatId] || []);
  }
}
