/**
 * Babylon Game World Generator
 * 
 * Generates complete game narratives with NPCs, events, and predetermined outcomes.
 * This is the WORLD that agents observe and bet on - it doesn't handle betting itself.
 * 
 * The game generates:
 * - Daily events and developments
 * - NPC conversations and actions
 * - Clues and information reveals
 * - News reports and rumors
 * - The final outcome
 * 
 * External agents observe this world and bet on prediction markets about the outcome.
 * 
 * @module engine/GameWorld
 */

import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import { FeedGenerator, type FeedEvent } from './FeedGenerator';

export interface WorldConfig {
  /** Predetermined outcome (true = success, false = failure) */
  outcome: boolean;
  /** Number of NPCs in the world */
  numNPCs?: number;
  /** Game duration in days */
  duration?: number;
  /** How much information to generate */
  verbosity?: 'minimal' | 'normal' | 'detailed';
}

export interface WorldEvent {
  type: WorldEventType;
  day: number;
  timestamp: number;
  description: string;
  npc?: string;
  data: any;
}

export type WorldEventType =
  | 'world:started'
  | 'day:begins'
  | 'npc:action'
  | 'npc:conversation'
  | 'news:published'
  | 'rumor:spread'
  | 'clue:revealed'
  | 'development:occurred'
  | 'outcome:revealed'
  | 'world:ended';

export interface NPC {
  id: string;
  name: string;
  role: 'insider' | 'expert' | 'journalist' | 'whistleblower' | 'politician' | 'deceiver';
  knowsTruth: boolean; // Does this NPC know the real outcome?
  reliability: number; // 0-1, how often they tell truth
  personality: string;
}

export interface WorldState {
  id: string;
  question: string;
  outcome: boolean;
  currentDay: number;
  npcs: NPC[];
  events: WorldEvent[];
  timeline: DayEvent[];
  truthRevealed: boolean;
}

export interface DayEvent {
  day: number;
  summary: string;
  events: WorldEvent[];
  publicSentiment: number; // -1 to 1 (negative = NO, positive = YES)
}

/**
 * Game World Generator
 * 
 * Creates autonomous game worlds with NPCs, events, and narratives.
 * External agents observe this world and make predictions.
 * 
 * @example
 * ```typescript
 * const world = new GameWorld({ outcome: true });
 * 
 * world.on('npc:conversation', (event) => {
 *   console.log(`${event.npc}: "${event.data.dialogue}"`);
 * });
 * 
 * const finalWorld = await world.generate();
 * // Complete 30-day narrative with all NPC actions
 * ```
 */
export class GameWorld extends EventEmitter {
  private config: Required<WorldConfig>;
  private events: WorldEvent[] = [];
  private currentDay = 0;
  private npcs: NPC[] = [];
  private feedGenerator: FeedGenerator;

  constructor(config: WorldConfig) {
    super();
    
    this.config = {
      outcome: config.outcome,
      numNPCs: config.numNPCs || 8,
      duration: config.duration || 30,
      verbosity: config.verbosity || 'normal',
    };
    
    this.feedGenerator = new FeedGenerator();
  }

  /**
   * Generate complete game world from day 1 to 30
   * 
   * Returns full narrative with:
   * - Daily events and developments
   * - NPC conversations and actions
   * - Clues and information reveals
   * - News reports and rumors
   * - Final outcome
   * 
   * This is what agents observe - they don't participate in this world,
   * they BET on what will happen.
   */
  async generate(): Promise<WorldState> {
    const worldId = uuid();
    
    // 1. Create the scenario
    const question = this.generateQuestion();
    this.npcs = this.createNPCs();
    
    this.emitEvent('world:started', {
      question,
      outcome: this.config.outcome,
      npcs: this.npcs.length,
    });

    const timeline: DayEvent[] = [];

    // 2. Generate all 30 days of events
    for (let day = 1; day <= this.config.duration; day++) {
      this.currentDay = day;
      
      this.emitEvent('day:begins', { day }, `Day ${day} begins`);

      // Generate real-world events
      const worldEvents: any[] = [];
      
      if (day <= 10) {
        worldEvents.push(...this.generateEarlyWorldEvents(day));
      } else if (day <= 20) {
        worldEvents.push(...this.generateMidWorldEvents(day));
      } else {
        worldEvents.push(...this.generateLateWorldEvents(day));
      }

      // Generate feed posts from world events (news, reactions, threads)
      const feedPosts = this.feedGenerator.generateDayFeed(
        day,
        worldEvents,
        this.npcs,
        this.config.outcome
      );

      // Emit each feed post as it would appear
      feedPosts.forEach(post => {
        this.emit('feed:post', post);
      });

      // Generate group chat messages
      const groupChatMessages = this.generateGroupMessages(day, worldEvents);

      timeline.push({
        day,
        summary: `Day ${day}: ${worldEvents.length} events, ${feedPosts.length} feed posts`,
        events: worldEvents,
        feedPosts, // ← FIX: Actually save feed posts!
        groupChats: groupChatMessages, // ← FIX: Add group messages!
        publicSentiment: this.calculateFeedSentiment(feedPosts),
      });
    }

    // 3. Reveal outcome
    this.emitEvent('outcome:revealed', { outcome: this.config.outcome }, 
      `The truth is revealed: The outcome is ${this.config.outcome ? 'SUCCESS' : 'FAILURE'}`);

    this.emitEvent('world:ended', { 
      outcome: this.config.outcome,
      totalEvents: this.events.length,
    });

    return {
      id: worldId,
      question,
      outcome: this.config.outcome,
      currentDay: this.config.duration,
      npcs: this.npcs,
      events: this.events,
      timeline,
      truthRevealed: true,
    };
  }

  /**
   * Generate early world events (Days 1-10)
   * Real things happening that people will react to
   */
  private generateEarlyWorldEvents(day: number): any[] {
    const events: any[] = [];

    // Create actual world events that will trigger feed reactions
    if (day % 3 === 0) {
      events.push({
        id: `world-${day}-1`,
        day,
        type: 'announcement',
        description: this.config.outcome 
          ? 'Unnamed source leaks positive test results'
          : 'Concerns raised about project timeline',
        actors: this.npcs.filter(n => n.role === 'insider').map(n => n.id).slice(0, 1),
        visibility: 'leaked',
      });
    }

    if (day === 5) {
      const insider = this.npcs.find(n => n.role === 'insider');
      events.push({
        id: `world-${day}-2`,
        day,
        type: 'leak',
        description: this.config.outcome 
          ? 'Internal memo shows project ahead of schedule'
          : 'Leaked documents reveal budget overruns',
        actors: insider ? [insider.id] : [],
        visibility: 'leaked',
      });
    }

    return events;
  }

  /**
   * Generate mid-game world events (Days 11-20)
   */
  private generateMidWorldEvents(day: number): any[] {
    const events: any[] = [];

    if (day === 15) {
      events.push({
        id: `world-${day}-1`,
        day,
        type: 'development',
        description: this.config.outcome
          ? 'Major breakthrough achieved in critical testing phase'
          : 'Critical system failure discovered during final tests',
        actors: this.npcs.filter(n => n.role === 'expert' || n.role === 'insider').map(n => n.id).slice(0, 2),
        visibility: 'public',
      });
    }

    if (day % 4 === 0) {
      events.push({
        id: `world-${day}-2`,
        day,
        type: 'meeting',
        description: 'High-level emergency meeting held behind closed doors',
        actors: this.npcs.slice(0, 3).map(n => n.id),
        visibility: 'leaked',
      });
    }

    return events;
  }

  /**
   * Generate late game world events (Days 21-30)
   */
  private generateLateWorldEvents(day: number): any[] {
    const events: any[] = [];

    if (day === 25) {
      const whistleblower = this.npcs.find(n => n.role === 'whistleblower');
      events.push({
        id: `world-${day}-1`,
        day,
        type: 'scandal',
        description: this.config.outcome
          ? 'Whistleblower leaks documents confirming project success'
          : 'Whistleblower reveals documents showing project failure',
        actors: whistleblower ? [whistleblower.id] : [],
        visibility: 'public',
      });
    }

    if (day === 29) {
      events.push({
        id: `world-${day}-1`,
        day,
        type: 'development',
        description: this.config.outcome
          ? 'Final test successful - all systems operational'
          : 'Final test failed - project officially cancelled',
        actors: this.npcs.filter(n => n.role === 'insider' || n.role === 'expert').map(n => n.id).slice(0, 2),
        visibility: 'public',
      });
    }

    return events;
  }

  /**
   * Create NPCs for the world
   */
  private createNPCs(): NPC[] {
    const npcTemplates = [
      { role: 'insider' as const, name: 'Insider Ian', knowsTruth: true, reliability: 0.9 },
      { role: 'expert' as const, name: 'Expert Emma', knowsTruth: false, reliability: 0.7 },
      { role: 'journalist' as const, name: 'Channel 7 News', knowsTruth: false, reliability: 0.6 },
      { role: 'whistleblower' as const, name: 'Whistleblower Wendy', knowsTruth: true, reliability: 0.95 },
      { role: 'politician' as const, name: 'Senator Smith', knowsTruth: false, reliability: 0.3 },
      { role: 'deceiver' as const, name: 'Conspiracy Carl', knowsTruth: false, reliability: 0.1 },
      { role: 'journalist' as const, name: 'TechJournal', knowsTruth: false, reliability: 0.6 },
      { role: 'insider' as const, name: 'Engineer Eve', knowsTruth: true, reliability: 0.85 },
    ];

    return npcTemplates.slice(0, this.config.numNPCs).map((template, i) => ({
      id: `npc-${i}`,
      name: template.name,
      role: template.role,
      knowsTruth: template.knowsTruth,
      reliability: template.reliability,
      personality: this.generatePersonality(),
    }));
  }

  private generateQuestion(): string {
    const questions = [
      "Will Project Omega's satellite launch succeed?",
      "Will the scandal force President Stump to resign?",
      "Will TechCorp announce the AI breakthrough?",
      "Will the climate summit reach an agreement?",
      "Will the merger between MegaCorp and TechGiant close?",
    ];
    return questions[Math.floor(Math.random() * questions.length)];
  }

  private generatePersonality(): string {
    const personalities = ['cautious', 'bold', 'analytical', 'emotional', 'contrarian'];
    return personalities[Math.floor(Math.random() * personalities.length)];
  }

  private generateNewsReport(day: number, journalist: NPC): string {
    if (this.config.outcome) {
      return `Day ${day} analysis: Sources suggest positive developments`;
    } else {
      return `Day ${day} investigation: Multiple concerns raised by experts`;
    }
  }

  private generateRumor(day: number): string {
    const rumors = this.config.outcome
      ? ["Unconfirmed: Test results exceeding expectations", "Rumor: Key milestone reached ahead of schedule"]
      : ["Unconfirmed: Internal memos show concerns", "Rumor: Key stakeholders expressing doubts"];
    return rumors[Math.floor(Math.random() * rumors.length)];
  }

  private generateNPCConversation(day: number): string {
    return `NPCs debate the situation on Day ${day}. Mixed opinions emerge.`;
  }

  private generateExpertAnalysis(expert: NPC): string {
    return `${expert.name} publishes analysis: ${this.config.outcome ? 'Indicators positive' : 'Warning signs evident'}`;
  }

  private generateDaySummary(day: number, events: WorldEvent[]): string {
    if (events.length === 0) return `Day ${day}: Quiet day, no major developments`;
    
    const types = events.map(e => e.type);
    if (types.includes('development:occurred')) return `Day ${day}: MAJOR DEVELOPMENT`;
    if (types.includes('news:published')) return `Day ${day}: News coverage`;
    return `Day ${day}: ${events.length} events`;
  }

  private calculateFeedSentiment(feedPosts: FeedEvent[]): number {
    if (feedPosts.length === 0) return 0;
    
    const totalSentiment = feedPosts.reduce((sum, post) => sum + post.sentiment, 0);
    return totalSentiment / feedPosts.length;
  }

  /**
   * Generate group chat messages for the day
   */
  private generateGroupMessages(day: number, worldEvents: any[]): Record<string, any[]> {
    const messages: Record<string, any[]> = {};
    
    // Simple group messages for now
    // TODO: Use LLM for rich content
    if (worldEvents.length > 0 && day % 3 === 0) {
      messages['group-0'] = [
        {
          from: this.npcs[0]?.name || 'Insider',
          message: `Heard something about ${worldEvents[0].description}...`,
          timestamp: `2025-10-${String(day).padStart(2, '0')}T12:00:00Z`,
          clueStrength: 0.5,
        },
      ];
    }

    return messages;
  }

  private createEvent(
    type: WorldEventType,
    npcId: string | undefined,
    description: string
  ): WorldEvent {
    const npc = npcId ? this.npcs.find(n => n.id === npcId) : undefined;
    
    const event: WorldEvent = {
      type,
      day: this.currentDay,
      timestamp: Date.now(),
      description,
      npc: npc?.name,
      data: { npcId, description },
    };

    return event;
  }

  private emitEvent(type: WorldEventType, data: any, description?: string) {
    const event: WorldEvent = {
      type,
      day: this.currentDay,
      timestamp: Date.now(),
      description: description || type,
      data,
    };

    this.events.push(event);
    this.emit(type, event);
    this.emit('event', event);
  }

  private emitWorldEvent(event: WorldEvent) {
    this.events.push(event);
    this.emit(event.type, event);
    this.emit('event', event);
  }
}

