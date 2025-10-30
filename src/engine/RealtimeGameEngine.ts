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
import { FeedGenerator } from './FeedGenerator';
import { QuestionManager } from './QuestionManager';
import { PriceEngine } from './PriceEngine';
import { PerpetualsEngine } from './PerpetualsEngine';
import { BabylonLLMClient } from '../generator/llm/openai-client';
import { shuffleArray } from '@/shared/utils';
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
  GameState,
  ActorsDatabase,
  ChatMessage,
} from '@/shared/types';

interface RealtimeConfig {
  tickIntervalMs?: number;
  postsPerTick?: number;
  historyDays?: number;
  savePath?: string;
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
      tickIntervalMs: config?.tickIntervalMs || 60000,
      postsPerTick: config?.postsPerTick || 15,
      historyDays: config?.historyDays || 30,
      savePath: config?.savePath || join(process.cwd(), 'games', 'realtime'),
    };

    this.llm = new BabylonLLMClient();
    this.feedGenerator = new FeedGenerator(this.llm);
    this.questionManager = new QuestionManager(this.llm);
    this.priceEngine = new PriceEngine(Date.now());
    this.perpsEngine = new PerpetualsEngine();
  }

  async initialize(): Promise<void> {
    console.log('🎮 INITIALIZING ENHANCED REALTIME ENGINE');
    console.log('=========================================\n');

    const actorsPath = join(process.cwd(), 'data/actors.json');
    const actorsData = JSON.parse(readFileSync(actorsPath, 'utf-8')) as ActorsDatabase;

    console.log('📋 Loading actors...');
    this.actors = this.selectAllActors(actorsData.actors);
    console.log(`  ✓ Loaded ${this.actors.length} actors\n`);

    console.log('💰 Initializing organizations and prices...');
    this.organizations = actorsData.organizations;
    this.priceEngine.initializeCompanies(this.organizations);
    this.perpsEngine.initializeMarkets(this.organizations);
    const companies = this.organizations.filter(o => o.type === 'company');
    console.log(`  ✓ Initialized ${companies.length} company prices\n`);

    console.log('📝 Generating scenarios...');
    this.scenarios = await this.generateScenarios();
    console.log(`  ✓ Generated ${this.scenarios.length} scenarios\n`);

    console.log('🔗 Creating connections...');
    this.connections = this.generateConnections();
    console.log(`  ✓ Generated ${this.connections.length} relationships\n`);

    console.log('💬 Creating group chats...');
    this.groupChats = this.createGroupChats();
    console.log(`  ✓ Created ${this.groupChats.length} group chats\n`);

    this.initializeLuckMood();
    this.feedGenerator.setOrganizations(this.organizations);

    await this.loadHistory();

    if (this.questions.length === 0) {
      console.log('🎯 Generating initial questions...');
      const newQuestions = await this.generateQuestions(5);
      this.questions.push(...newQuestions);
      console.log(`  ✓ Generated ${newQuestions.length} questions\n`);
    }

    console.log('✅ ENHANCED ENGINE READY');
    console.log('========================');
    console.log(`Active Questions: ${this.questions.filter(q => q.status === 'active').length}\n`);
  }

  start(): void {
    if (this.isRunning) return;

    console.log('🚀 STARTING ENHANCED ENGINE\n');
    this.isRunning = true;

    this.tick().catch(error => console.error('Tick error:', error));
    this.intervalId = setInterval(() => {
      this.tick().catch(error => console.error('Tick error:', error));
    }, this.config.tickIntervalMs);

    this.fundingIntervalId = setInterval(() => {
      this.perpsEngine.processFunding();
    }, 8 * 60 * 60 * 1000);

    this.dailySnapshotIntervalId = setInterval(() => {
      this.checkDailySnapshot();
    }, 60 * 1000);

    this.emit('started');
  }

  stop(): void {
    if (!this.isRunning) return;

    if (this.intervalId) clearInterval(this.intervalId);
    if (this.fundingIntervalId) clearInterval(this.fundingIntervalId);
    if (this.dailySnapshotIntervalId) clearInterval(this.dailySnapshotIntervalId);

    this.isRunning = false;
    this.saveState();
    this.emit('stopped');
  }

  /**
   * ENHANCED TICK: Generate content driven by active questions
   */
  private async tick(): Promise<void> {
    const timestamp = new Date().toISOString();
    const currentDate = timestamp.split('T')[0]!;
    
    console.log(`⏰ [${timestamp}] Generating tick...`);

    try {
      // Step 1: Resolve expired questions with resolution events
      const activeQuestions = this.questions.filter(q => q.status === 'active');
      const toResolve = this.questionManager.getQuestionsToResolve(activeQuestions, currentDate);
      
      const resolutionEvents: WorldEvent[] = [];
      if (toResolve.length > 0) {
        console.log(`  🎯 Resolving ${toResolve.length} questions`);
        for (const question of toResolve) {
          // Generate definitive resolution event
          const resolutionEvent = await this.generateResolutionEvent(question);
          resolutionEvents.push(resolutionEvent);
          
          const resolved = this.questionManager.resolveQuestion(question, question.outcome);
          const index = this.questions.findIndex(q => q.id === question.id);
          if (index >= 0) {
            this.questions[index] = resolved;
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
        console.log(`  📝 Created ${questionsCreated} new questions`);
      }

      // Step 3: Generate events for active questions (ENHANCED)
      const events = await this.generateQuestionDrivenEvents(activeQuestions, resolutionEvents);
      
      // Step 4: Update prices based on events
      const priceUpdates = await this.updatePrices(events);
      if (priceUpdates.length > 0) {
        console.log(`  💰 ${priceUpdates.length} price updates`);
        
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
      console.log(`  📱 Generated ${posts.length} LLM posts`);

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

      this.emit('tick', tick);

      if (this.recentTicks.length % 10 === 0) {
        this.saveState();
      }

    } catch (error) {
      console.error('  ❌ Error in tick:', error);
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
        type: (response.type as WorldEvent['type']) || 'announcement',
        actors: involvedActors.map(a => a.id),
        description: response.description || `Development in: ${question.text}`,
        relatedQuestion: question.id,
        pointsToward: shouldPointToOutcome ? (question.outcome ? 'YES' : 'NO') : null,
        visibility: 'public',
      };
    } catch (error) {
      console.error('Failed to generate event:', error);
      
      // Fallback to template-based event
      return {
        id: `event-${Date.now()}-${Math.random()}`,
        type: 'announcement',
        actors: involvedActors.map(a => a.id),
        description: `${involvedActors[0]?.name || 'Someone'} makes move regarding: ${question.text}`,
        relatedQuestion: question.id,
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
        type: (response.type as WorldEvent['type']) || 'announcement',
        actors: involvedActors.map(a => a.id),
        description: response.description,
        relatedQuestion: question.id,
        pointsToward: question.outcome ? 'YES' : 'NO',
        visibility: 'public',
      };
    } catch (error) {
      console.error('Failed to generate resolution event:', error);
      
      return {
        id: `resolution-${Date.now()}`,
        type: 'announcement',
        actors: involvedActors.map(a => a.id),
        description: `RESOLUTION: ${question.text} - Outcome is ${question.outcome ? 'YES' : 'NO'}`,
        relatedQuestion: question.id,
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
        } catch (error) {
          // Skip this post if LLM fails, continue to next
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
      console.error('Failed to generate LLM post:', error);
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
    } catch (error) {
      return null; // Don't create post if LLM fails
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
          } catch (error) {
            // Skip this message if LLM fails
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

  private async generateQuestions(count: number): Promise<Question[]> {
    const currentDate = new Date().toISOString().split('T')[0]!;
    const activeQuestions = this.questions.filter(q => q.status === 'active');
    const nextId = Math.max(0, ...this.questions.map(q => q.id)) + 1;

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
      recentEvents: recentDays,
      nextQuestionId: nextId,
    });
  }

  private buildRecentDaysContext(recentEvents: WorldEvent[]): any[] {
    // Build pseudo-timeline from recent events for question generation context
    return [{
      day: 1,
      events: recentEvents.slice(-10),
      summary: 'Recent developments',
    }];
  }

  private checkDailySnapshot(): void {
    const currentDate = new Date().toISOString().split('T')[0]!;
    
    if (currentDate !== this.lastDailySnapshot) {
      console.log(`\n📊 Recording daily snapshot for ${this.lastDailySnapshot}`);
      this.perpsEngine.recordDailySnapshot(this.lastDailySnapshot);
      this.lastDailySnapshot = currentDate;
      this.saveState();
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
        
        console.log('📚 Loaded history');
        console.log(`  Ticks: ${this.recentTicks.length}`);
        console.log(`  Questions: ${this.questions.length}\n`);
      } catch (error) {
        console.error('Failed to load history:', error);
      }
    }
  }

  // Helper methods
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
        connections.push({
          actor1: mains[i].id,
          actor2: mains[j].id,
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

