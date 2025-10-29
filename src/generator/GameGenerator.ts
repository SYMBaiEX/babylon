/**
 * Babylon Game Generator - Main Orchestrator
 * 
 * Coordinates LLM-driven generation of complete 30-day games
 * with actors, scenarios, questions, events, and outcomes.
 * 
 * Generates:
 * - 3 main actors, 15 supporting, 50 extras
 * - 3 scenarios with yes/no questions
 * - 30-day timeline with events
 * - 300-500 feed posts
 * - 100-200 group messages
 * - Predetermined outcomes
 * 
 * ✅ OPTIMIZED: Batched LLM calls (90% reduction)
 * - Before: ~300 event calls + ~150 group message calls = 450 calls
 * - After: ~30 event calls + ~30 group message calls = 60 calls
 * - Combined with FeedGenerator batching: 2,000+ calls → ~200 calls total
 * 
 * Batching strategy:
 * - Event descriptions: All events per day in 1 call (3-15 → 1)
 * - Group messages: All groups per day in 1 call (~5 → 1)
 * 
 * Per-actor context preserved (personality, mood, luck)
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { FeedGenerator } from '../engine/FeedGenerator';
import { BabylonLLMClient } from './llm/openai-client';
import { generateActorContext } from '../engine/EmotionSystem';
import { shuffleArray } from '@/shared/utils';
import { loadPrompt } from '../prompts/loader';
import type {
  Actor,
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
  GameResolution,
  QuestionOutcome,
  GameSetup,
  GeneratedGame,
  ActorsDatabase,
  GameHistory,
  GenesisGame,
} from '@/shared/types';

/**
 * Structure for actors selected for a game
 */
interface SelectedActorsByTier {
  mains: SelectedActor[];
  supporting: SelectedActor[];
  extras: SelectedActor[];
}

/**
 * Generate context from previous month's game
 */
function generatePreviousMonthContext(previousHistory: GameHistory[]): string {
  if (previousHistory.length === 0) {
    return ''; // No previous history available
  }
  
  const lastGame = previousHistory[previousHistory.length - 1]!;
  
  return `
━━━ PREVIOUS MONTH CONTEXT ━━━
${lastGame.summary}

Prediction outcomes from last month:
${lastGame.keyOutcomes.map(o => `- ${o.questionText} → ${o.outcome ? 'YES' : 'NO'}`).join('\n')}

Key moments: ${lastGame.highlights.slice(0, 3).join('; ')}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
}

/**
 * Generate current month setup context
 */
function generateCurrentMonthContext(
  mainActors: SelectedActor[],
  scenarios: Scenario[],
  questions: Question[],
  day: number
): string {
  return `
━━━ CURRENT MONTH - DAY ${day}/30 ━━━

MAIN ACTORS (focus on these):
${mainActors.map(a => `- ${a.name}: ${a.description} [${a.affiliations?.join(', ') || 'independent'}]`).join('\n')}

ACTIVE SCENARIOS:
${scenarios.map(s => `- ${s.title}: ${s.description}`).join('\n')}

PREDICTION MARKETS:
${questions.map(q => `- ${q.text}`).join('\n')}

ORGANIZATIONS: ${scenarios.flatMap(s => s.involvedOrganizations).filter((v, i, a) => a.indexOf(v) === i).join(', ')}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
}

/**
 * Generate day-by-day summaries for this month
 */
function generateDaySummariesContext(previousDays: DayTimeline[]): string {
  return `
━━━ THIS MONTH SO FAR ━━━
${previousDays.map(d => `Day ${d.day}: ${d.summary}
Events: ${d.events.map(e => e.description).join('; ')}`).join('\n\n')}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
}

/**
 * Get actor's group context - all groups they're in + recent messages
 */
function getActorGroupContext(
  actorId: string,
  allGroups: GroupChat[],
  previousDays: DayTimeline[],
  allActors: SelectedActor[]
): string {
  const memberOf = allGroups.filter(g => g.members.includes(actorId));
  
  const groupContexts = memberOf.map(group => {
    const recentMessages: string[] = [];
    
    for (let i = previousDays.length - 1; i >= Math.max(0, previousDays.length - 3); i--) {
      const dayData = previousDays[i];
      if (!dayData) continue;
      
      const msgs = dayData.groupChats?.[group.id] || [];
      
      msgs.slice(-3).forEach((msg: ChatMessage) => {
        const actor = allActors.find(a => a.id === msg.from);
        recentMessages.push(`${actor?.name || msg.from}: "${msg.message}"`);
      });
    }
    
    const memberNames = group.members
      .map(id => allActors.find(a => a.id === id)?.name || id)
      .filter(name => name !== allActors.find(a => a.id === actorId)?.name);
    
    return `- "${group.name}": ${memberNames.join(', ')}
  ${recentMessages.length > 0 ? `Recent: ${recentMessages.slice(-3).join('; ')}` : 'No recent messages'}`;
  }).join('\n');
  
  return memberOf.length > 0 ? `
━━━ YOUR PRIVATE GROUP CHATS ━━━
${groupContexts}

You're aware of these conversations. They inform your knowledge and perspective.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : '';
}

export function createScenarioPrompt(mainActors: Actor[], organizations?: Organization[]) {
  const organizationContext = organizations && organizations.length > 0 ? `

AFFILIATED ORGANIZATIONS:
Organizations can participate in scenarios through their behavioral patterns:

MEDIA ORGANIZATIONS (Break Stories):
${organizations.filter(o => o.type === 'media').map(o =>
  `- ${o.name}: ${o.description}`
).join('\n') || '(none)'}

COMPANIES (Announce Products, Manage Crises):
${organizations.filter(o => o.type === 'company').map(o =>
  `- ${o.name}: ${o.description}`
).join('\n') || '(none)'}

GOVERNMENT AGENCIES (Investigate, Contain):
${organizations.filter(o => o.type === 'government').map(o =>
  `- ${o.name}: ${o.description}`
).join('\n') || '(none)'}

Organizations should:
- React to actor behavior (e.g., Xitter announces policy change after Elon's 3am rant)
- Drive scenarios (e.g., MSDNC breaks exclusive story with leaked documents)
- Create conflicts (e.g., The Fud investigates, company issues denial)
` : '';

  const mainActorsList = mainActors.map(a =>
    `- ${a.name}: ${a.description} (Domain: ${a.domain})${a.affiliations?.length ? ` [Affiliated: ${a.affiliations.join(', ')}]` : ''}`
  ).join('\n');

  return loadPrompt('game/scenarios', {
    mainActorsList,
    organizationContext
  });
}

export function createQuestionPrompt(scenarios: Scenario[], organizations?: Organization[]) {
  const organizationContext = organizations && organizations.length > 0 ? `

ORGANIZATIONS IN PLAY:
You can create questions about organizational responses, not just actors:
- "Will [MEDIA] break story about [EVENT]?"
- "Will [COMPANY] announce [PRODUCT/DENIAL]?"
- "Will [GOVERNMENT] launch investigation into [ACTOR]?"

Available organizations: ${organizations.map(o => `${o.name} (${o.type})`).join(', ')}
` : '';

  const scenariosList = scenarios.map(s => `
Scenario ${s.id}: ${s.title}
${s.description}
Actors: ${s.mainActors.join(', ')}
${s.involvedOrganizations?.length ? `Organizations: ${s.involvedOrganizations.join(', ')}` : ''}
`).join('\n');

  return loadPrompt('game/questions', {
    scenariosList,
    organizationContext
  });
}

// Organization types
export type OrganizationType = 'company' | 'media' | 'government';

// Organization behavioral patterns
export enum OrganizationBehavior {
  // Media organizations break stories
  MEDIA_BREAKS_STORY = 'media_breaks_story',
  MEDIA_INVESTIGATES = 'media_investigates',
  MEDIA_COVERS_UP = 'media_covers_up',
  
  // Companies manage PR and announce products
  COMPANY_ANNOUNCES = 'company_announces',
  COMPANY_CRISIS_MANAGEMENT = 'company_crisis_management',
  COMPANY_DENIES = 'company_denies',
  
  // Government contains and responds
  GOVT_INVESTIGATES = 'govt_investigates',
  GOVT_DENIES = 'govt_denies',
  GOVT_ANNOUNCES_POLICY = 'govt_announces_policy',
}

// Re-export types for backwards compatibility with external consumers
export type {
  GeneratedGame,
  GameSetup,
  SelectedActor,
  Scenario,
  Question,
  GroupChat,
  ActorConnection,
  DayTimeline,
  WorldEvent,
  ChatMessage,
  LuckChange,
  MoodChange,
  GameResolution,
  QuestionOutcome,
  GameHistory,
  GenesisGame,
};

// Load actors database
const actorsPath = join(process.cwd(), 'data/actors.json');
const actorsData = JSON.parse(readFileSync(actorsPath, 'utf-8')) as ActorsDatabase;
const actors = actorsData;

/**
 * Main Game Generator
 * 
 * Orchestrates complete LLM-driven game generation
 */
export class GameGenerator {
  private llm: BabylonLLMClient;
  private feedGenerator: FeedGenerator;
  private gameHistory: GameHistory[] = [];
  constructor(apiKey?: string, previousHistory?: GameHistory[]) {
    this.llm = new BabylonLLMClient(apiKey);
    this.feedGenerator = new FeedGenerator(this.llm); // Pass LLM to FeedGenerator
    this.gameHistory = previousHistory || [];
  }

  /**
   * Generate complete game
   * @param preGenerateDays - Number of days to pre-generate (for first game initialization)
   */
  async generateCompleteGame(startDate = '2025-11-01'): Promise<GeneratedGame> {
    const gameNumber = this.gameHistory.length + 1;
    
    console.log(`🎮 GENERATING BABYLON GAME #${gameNumber}...`);
    console.log(`   Start date: ${startDate}`);
    console.log(`   Duration: 30 days`);
    if (this.gameHistory.length > 0) {
      console.log(`   ✓ Loading ${this.gameHistory.length} previous game(s) as context`);
    } else {
      console.log(`   ✓ First game - no previous context`);
    }
    console.log('================================\n');

    // Phase 1: Actor Selection
    console.log('📋 Phase 1: Selecting actors...');
    const selectedActors = this.selectActors();
    console.log(`  ✓ Selected ${selectedActors.mains.length} main actors`);
    console.log(`  ✓ Selected ${selectedActors.supporting.length} supporting actors`);
    console.log(`  ✓ Selected ${selectedActors.extras.length} extras`);
    
    if (selectedActors.mains.length > 0) {
      console.log('\n  Main cast:');
      selectedActors.mains.forEach(a => {
        console.log(`    • ${a.name} - ${(a.description || '').substring(0, 60)}...`);
      });
    }
    console.log();

    // Phase 2: Scenario & Question Generation
    console.log('📝 Phase 2: Generating scenarios & questions...');
    
    // Extract organizations first for context
    const organizations = this.extractOrganizations(selectedActors);
    
    const scenarios = await this.generateScenarios(selectedActors.mains, organizations);
    console.log(`  ✓ Generated ${scenarios.length} scenarios`);
    
    const questions = await this.generateQuestions(scenarios, organizations);
    console.log(`  ✓ Generated ${questions.length} questions total`);
    
    const topQuestions = await this.rankAndSelectQuestions(questions);
    console.log(`  ✓ Selected top 3 questions\n`);

    // Phase 3: World Building
    console.log('🌍 Phase 3: Building world...');
    const connections = this.generateConnections(selectedActors);
    console.log(`  ✓ Generated ${connections.length} actor relationships`);
    
    const groupChats = await this.createGroupChats(selectedActors, connections);
    console.log(`  ✓ Created ${groupChats.length} group chats`);
    
    const luckMood = this.initializeLuckMood(selectedActors);
    console.log(`  ✓ Initialized luck & mood for ${luckMood.size} actors\n`);

    // Phase 4: 30-Day Timeline Generation
    console.log('📅 Phase 4: Generating 30-day timeline...');
    const timeline: DayTimeline[] = [];
    const gameStartDate = new Date(startDate);
    
    // Set organizations in FeedGenerator once before timeline generation
    this.feedGenerator.setOrganizations(organizations);
    
    for (let day = 1; day <= 30; day++) {
      const currentDate = new Date(gameStartDate);
      currentDate.setDate(gameStartDate.getDate() + (day - 1));
      const dateStr = currentDate.toISOString().split('T')[0]!;

      const phase = this.getPhase(day);
      process.stdout.write(`  [${dateStr}] ${phase.padEnd(12)} `);
      
      const dayTimeline = await this.generateDay(
        day,
        selectedActors,
        topQuestions,
        scenarios,
        groupChats,
        timeline,
        luckMood,
        dateStr,
        connections
      );
      
      timeline.push(dayTimeline);
      console.log(`✓ (${dayTimeline.events.length} events, ${dayTimeline.feedPosts.length} posts)`);
    }

    // Phase 5: Resolution
    console.log('\n🎯 Phase 5: Generating resolution...');
    const resolution = this.generateResolution(topQuestions, timeline);
    console.log('  ✓ All questions resolved\n');

    // Organizations already extracted earlier for prompt generation
    const game: GeneratedGame = {
      id: `babylon-${Date.now()}`,
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      setup: {
        mainActors: selectedActors.mains,
        supportingActors: selectedActors.supporting,
        extras: selectedActors.extras,
        organizations,
        scenarios,
        questions: topQuestions,
        groupChats,
        connections,
      },
      timeline,
      resolution,
    };

    // Calculate totals
    const totalEvents = timeline.reduce((sum, day) => sum + day.events.length, 0);
    const totalPosts = timeline.reduce((sum, day) => sum + day.feedPosts.length, 0);
    const totalGroupMessages = timeline.reduce((sum, day) => {
      return sum + Object.values(day.groupChats).flat().length;
    }, 0);

    console.log('📊 GENERATION COMPLETE');
    console.log('======================');
    console.log(`Total actors: ${selectedActors.mains.length + selectedActors.supporting.length + selectedActors.extras.length}`);
    console.log(`Total events: ${totalEvents}`);
    console.log(`Total feed posts: ${totalPosts}`);
    console.log(`Total group messages: ${totalGroupMessages}`);
    console.log();

    return game;
  }

  /**
   * Generate Genesis Game
   * October 2025 (full 30 days) - world initialization
   * No questions, just events and social media to establish baseline
   */
  async generateGenesis(): Promise<GenesisGame> {
    console.log('🌍 GENERATING GENESIS GAME...');
    console.log('October 2025 - World Initialization (30 days)');
    console.log('==============================================\n');

    // Select actors for the world
    console.log('📋 Selecting actors for world initialization...');
    const selectedActors = this.selectActors();
    const allActors = [...selectedActors.mains, ...selectedActors.supporting, ...selectedActors.extras];
    console.log(`  ✓ Selected ${allActors.length} actors\n`);

    // Create relationships
    const connections = this.generateConnections(selectedActors);
    
    // Create group chats
    const groupChats = await this.createGroupChats(selectedActors, connections);
    console.log(`  ✓ Created ${groupChats.length} group chats\n`);

    // Initialize luck and mood
    const luckMood = this.initializeLuckMood(selectedActors);

    // Generate 30 days: October 1-31, 2025
    console.log('📅 Generating October 1-31, 2025 (30 days)...');
    const timeline: DayTimeline[] = [];
    const startDate = new Date('2025-10-01');

    for (let day = 1; day <= 30; day++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + (day - 1));
      const dateStr = currentDate.toISOString().split('T')[0]!;

      process.stdout.write(`  [${dateStr}] `);

      // Generate baseline events (no questions, just world activity)
      const events = await this.generateGenesisEvents(day, allActors, dateStr);
      
      // Generate luck and mood changes based on events
      const luckChanges = this.generateLuckChanges(day, events, allActors, luckMood);
      const moodChanges = this.generateMoodChanges(day, events, allActors, luckMood);
      
      // Apply ambient mood drift with correct parameters
      this.applyAmbientMoodDrift(allActors, luckMood);
      
      // Generate feed posts
      const feedPosts = await this.feedGenerator.generateDayFeed(
        day,
        events.map(e => ({
          id: e.id,
          day,
          type: e.type,
          description: e.description,
          actors: e.actors,
          visibility: e.visibility,
        })),
        allActors,
        true // Neutral baseline
      );

      // Generate group messages (function signature: day, events, groupChats, allActors)
      const groupMessages = await this.generateGroupMessages(day, events, groupChats, allActors);

      timeline.push({
        day,
        summary: `${dateStr}: ${events.length} events, ${feedPosts.length} posts`,
        events,
        groupChats: groupMessages,
        feedPosts,
        luckChanges,
        moodChanges,
      });

      console.log(`✓ (${events.length} events, ${feedPosts.length} posts, ${luckChanges.length + moodChanges.length} state changes)`);
    }

    const genesis: GenesisGame = {
      id: 'genesis-2025-10',
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      dateRange: {
        start: '2025-10-01',
        end: '2025-10-31',
      },
      actors: allActors,
      timeline,
      summary: 'World initialization - October 2025 (30 days). Normal activity establishing baseline.',
    };

    console.log('\n✅ GENESIS COMPLETE');
    console.log('===================');
    console.log(`Total events: ${timeline.reduce((sum, day) => sum + day.events.length, 0)}`);
    console.log(`Total posts: ${timeline.reduce((sum, day) => sum + day.feedPosts.length, 0)}`);
    console.log(`Total state changes: ${timeline.reduce((sum, day) => sum + day.luckChanges.length + day.moodChanges.length, 0)}`);
    console.log();

    return genesis;
  }

  /**
   * Generate baseline events for genesis (no questions)
   */
  private async generateGenesisEvents(
    day: number,
    allActors: SelectedActor[],
    dateStr: string
  ): Promise<WorldEvent[]> {
    const events: WorldEvent[] = [];
    const eventCount = 2 + Math.floor(Math.random() * 2); // 2-3 events per day
    const eventTypes: Array<WorldEvent['type']> = ['meeting', 'announcement', 'deal'];

    for (let i = 0; i < eventCount; i++) {
      const type = eventTypes[Math.floor(Math.random() * eventTypes.length)]!;
      const numActorsInvolved = type === 'meeting' ? 2 + Math.floor(Math.random() * 2) : 1;
      const involvedActors = shuffleArray(allActors).slice(0, numActorsInvolved);

      const description = await this.generateBaselineEvent(type, involvedActors, dateStr);

      events.push({
        id: `genesis-${day}-${i}`,
        type,
        actors: involvedActors.map(a => a.id),
        description,
        relatedQuestion: null,
        pointsToward: null,
        visibility: 'public',
      });
    }

    return events;
  }

  /**
   * Generate baseline event description (normal world activity)
   */
  private async generateBaselineEvent(
    type: WorldEvent['type'],
    actors: SelectedActor[],
    dateStr: string
  ): Promise<string> {
    const actorDescriptions = actors.map(a => `${a.name} (${a.description})`).join(', ');

    const prompt = `You must respond with valid JSON only.

Date: ${dateStr}
Event type: ${type}
Involved: ${actorDescriptions}

Generate a normal, mundane baseline event. One sentence, max 100 chars.

Respond with ONLY this JSON format:
{"event": "your event description"}

No other text.`;

    const response = await this.llm.generateJSON<{ event: string }>(
      prompt,
      undefined,
      { temperature: 0.7, maxTokens: 5000 }
    );

    return response.event || `${actors[0]?.name || 'Actor'} ${type}`;
  }

  /**
   * Create game history summary from completed game
   */
  createGameHistory(game: GeneratedGame): GameHistory {
    const highlights = game.timeline
      .flatMap(day => day.events)
      .filter(e => e.pointsToward !== null)
      .slice(0, 10)
      .map(e => e.description);
    
    const topMoments = game.timeline
      .flatMap(day => day.feedPosts)
      .sort((a, b) => Math.abs(b.sentiment) - Math.abs(a.sentiment))
      .slice(0, 5)
      .map(p => `${p.authorName}: "${p.content}"`);
    
    return {
      gameNumber: this.gameHistory.length + 1,
      completedAt: new Date().toISOString(),
      summary: game.resolution.finalNarrative,
      keyOutcomes: game.resolution.outcomes.map(o => {
        const question = game.setup.questions.find(q => q.id === o.questionId);
        return {
          questionText: question?.text || '',
          outcome: o.answer,
          explanation: o.explanation,
        };
      }),
      highlights,
      topMoments,
    };
  }

  /**
   * Get game history context for prompts
   */
  private getHistoryContext(): string {
    let context = '';
    
    // Add previous game history
    if (this.gameHistory.length > 0) {
      const recent = this.gameHistory.slice(-2); // Last 2 games
      context += `Previous games:
${recent.map(h => `
Game #${h.gameNumber}:
Summary: ${h.summary}
Key outcomes: ${h.keyOutcomes.map(o => `${o.questionText} → ${o.outcome ? 'YES' : 'NO'}`).join('; ')}
`).join('\n')}
`;
    }
    
    if (!context) {
      return 'This is the first game.';
    }
    
    return context + '\nBuild on this history naturally - reference past events, create continuity, but don\'t contradict what happened.';
  }

  /**
   * Select actors with weighted randomness
   * Prioritizes S/A tier for mains, mixed tiers for supporting, C/D for extras
   */
  private selectActors() {
    const allActors = actors.actors;
    
    // Weighted random selection - higher tiers have more weight
    const tierWeights: Record<string, number> = {
      'S_TIER': 10,
      'A_TIER': 6,
      'B_TIER': 3,
      'C_TIER': 1,
      'D_TIER': 0.5,
    };

    // Create weighted pool for mains (heavily favor S/A tier)
    const mainPool = allActors.flatMap(a =>
      Array(Math.ceil(tierWeights[a.tier || 'C_TIER'] || 1)).fill(a)
    );
    const shuffledMains = shuffleArray(mainPool);
    const uniqueMains = Array.from(new Set(shuffledMains.map(a => a.id)))
      .slice(0, 3)
      .map(id => allActors.find(a => a.id === id)!)
      .map(a => ({
        ...a,
        tier: a.tier as ActorTier, // Ensure tier is always set
        role: 'main',
        initialLuck: this.randomLuck(),
        initialMood: this.randomMood(),
      }));

    // Create weighted pool for supporting (moderate favor for A/B tier)
    const supportWeights: Record<string, number> = {
      'S_TIER': 2,
      'A_TIER': 5,
      'B_TIER': 4,
      'C_TIER': 2,
      'D_TIER': 0.5,
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
        tier: a.tier as ActorTier, // Ensure tier is always set
        role: 'supporting',
        initialLuck: this.randomLuck(),
        initialMood: this.randomMood(),
      }));

    // Create weighted pool for extras (favor C/D tier)
    const extraWeights: Record<string, number> = {
      'S_TIER': 0.5,
      'A_TIER': 1,
      'B_TIER': 2,
      'C_TIER': 4,
      'D_TIER': 5,
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
        tier: a.tier as ActorTier, // Ensure tier is always set
        role: 'extra',
        initialLuck: this.randomLuck(),
        initialMood: this.randomMood(),
      }));

    return { mains: uniqueMains, supporting: uniqueSupporting, extras: uniqueExtras };
  }

  /**
   * Extract organizations affiliated with selected actors
   * Weighs by actor tier and involvement
   */
  private extractOrganizations(selectedActors: { mains: SelectedActor[], supporting: SelectedActor[], extras: SelectedActor[] }): Organization[] {
    const allSelectedActors = [...selectedActors.mains, ...selectedActors.supporting, ...selectedActors.extras];
    const orgIds = new Set<string>();
    const orgWeights = new Map<string, number>();

    // Collect all affiliated organization IDs with weights
    for (const actor of allSelectedActors) {
      if (!actor.affiliations) continue;
      
      // Weight by actor role
      let weight = 1;
      if (actor.role === 'main') weight = 3;
      else if (actor.role === 'supporting') weight = 2;
      
      for (const orgId of actor.affiliations) {
        orgIds.add(orgId);
        orgWeights.set(orgId, (orgWeights.get(orgId) || 0) + weight);
      }
    }

    // Get full organization objects and sort by weight
    const organizations = actors.organizations
      .filter(org => orgIds.has(org.id))
      .sort((a, b) => (orgWeights.get(b.id) || 0) - (orgWeights.get(a.id) || 0));

    console.log(`  📊 Extracted ${organizations.length} organizations (${organizations.filter(o => o.type === 'company').length} companies, ${organizations.filter(o => o.type === 'media').length} media, ${organizations.filter(o => o.type === 'government').length} government)`);
    
    return organizations;
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

  public getActorTier(id: string): string {
    const actor = actors.actors.find(a => a.id === id);
    return actor ? (actor.tier || 'D_TIER') : 'D_TIER';
  }

  /**
   * Generate scenarios using LLM with rich prompt
   */
  private async generateScenarios(mains: SelectedActor[], organizations: Organization[]): Promise<Scenario[]> {
    const historyContext = this.getHistoryContext();
    const basePrompt = createScenarioPrompt(mains, organizations);
    const prompt = `${basePrompt}

${historyContext}

If there's previous game history, reference it naturally (e.g., "After the events of last game...", "Following up on...").
Otherwise, start fresh.`;
    
    const result = await this.llm.generateJSON<{ scenarios: Scenario[] }>(prompt, undefined, {
      temperature: 0.9,
      maxTokens: 8000,
    });
    
    // Validate scenarios - LLM must provide all required fields
    if (!result || !result.scenarios || !Array.isArray(result.scenarios)) {
      console.error('❌ Invalid scenarios response from LLM:', JSON.stringify(result, null, 2));
      throw new Error('LLM returned invalid scenarios response');
    }

    // Validate each scenario has required fields
    for (const scenario of result.scenarios) {
      if (!scenario.mainActors || !Array.isArray(scenario.mainActors)) {
        console.error('❌ Scenario missing mainActors:', JSON.stringify(scenario, null, 2));
        throw new Error(`Scenario "${scenario.title}" is missing mainActors array`);
      }
      if (!scenario.title || !scenario.description) {
        console.error('❌ Scenario missing required fields:', JSON.stringify(scenario, null, 2));
        throw new Error('Scenario is missing title or description');
      }
    }
    
    return result.scenarios;
  }

  /**
   * Generate questions using LLM with rich prompt
   */
  private async generateQuestions(scenarios: Scenario[], organizations: Organization[]): Promise<Question[]> {
    const prompt = createQuestionPrompt(scenarios, organizations);
    // Note: Not using schema validation here because LLM sometimes returns array format
    const rawResult = await this.llm.generateJSON<{ questions: Question[] } | Array<{ questions: Question[] }>>(prompt, undefined, {
      temperature: 0.85,
      maxTokens: 8000,
    });
    
    // Handle both possible response formats:
    // 1. { questions: [...] } - expected format
    // 2. [{ questions: [...] }, { questions: [...] }] - grouped by scenario
    let result: { questions: Question[] };
    
    if (Array.isArray(rawResult)) {
      // LLM returned array of objects - flatten into single object
      console.log('⚠️  LLM returned array format, flattening...');
      const allQuestions = rawResult.flatMap(item => {
        if (item && item.questions && Array.isArray(item.questions)) {
          return item.questions;
        }
        return [];
      });
      result = { questions: allQuestions };
    } else if (rawResult && rawResult.questions && Array.isArray(rawResult.questions)) {
      // LLM returned expected object format
      result = rawResult;
    } else {
      // Invalid format
      console.error('❌ Invalid response from LLM:', JSON.stringify(rawResult, null, 2));
      throw new Error(
        'LLM returned invalid response. Expected { questions: [...] } but got: ' + 
        (rawResult ? JSON.stringify(rawResult).substring(0, 200) : 'undefined')
      );
    }

    if (result.questions.length === 0) {
      throw new Error('LLM returned empty questions array');
    }
    
    // Assign predetermined outcomes to each question
    const questionsWithOutcomes = result.questions.map((q, i) => ({
      ...q,
      outcome: Math.random() > 0.5, // Random YES or NO outcome
      rank: q.rank || (i + 1), // Default rank if not provided
    }));
    
    return questionsWithOutcomes;
  }

  /**
   * Rank questions and select top 3
   */
  private async rankAndSelectQuestions(questions: Question[]): Promise<Question[]> {
    const questionsList = questions.map((q, i) => `${i + 1}. ${q.text}`).join('\n');

    const prompt = loadPrompt('game/question-rankings', {
      questionCount: questions.length,
      questionsList
    });

    const result = await this.llm.generateJSON<{ rankings: { questionId: number; rank: number }[] }>(prompt);
    
    // Apply rankings (with safety check)
    if (result?.rankings) {
      result.rankings.forEach(r => {
        const q = questions.find(q => q.id === r.questionId);
        if (q) q.rank = r.rank;
      });
    }

    // Sort by rank and take top 3
    return questions.sort((a, b) => a.rank - b.rank).slice(0, 3);
  }

  /**
   * Generate actor connections with richer network
   */
  private generateConnections(selectedActors: SelectedActorsByTier): ActorConnection[] {
    const connections: ActorConnection[] = [];
    
    // Connect each main to each other (rivalry or alliance)
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

    // Each main has connections to 3-5 supporting actors
    selectedActors.mains.forEach((main: SelectedActor) => {
      const numConnections = 3 + Math.floor(Math.random() * 3);
      const connected = shuffleArray([...selectedActors.supporting]).slice(0, numConnections);
      
      connected.forEach((supporting: SelectedActor) => {
        const relationships = ['advisor', 'source', 'critic', 'ally', 'friend'];
        connections.push({
          actor1: main.id,
          actor2: supporting.id,
          relationship: relationships[Math.floor(Math.random() * relationships.length)]!,
          context: `Professional relationship in ${main.domain?.[0] || 'industry'}`,
        });
      });
    });

    // Supporting actors connect to each other (creates richer network)
    selectedActors.supporting.forEach((supporting: SelectedActor, i: number) => {
      const numConnections = 2 + Math.floor(Math.random() * 2); // 2-3 connections
      const potentials = selectedActors.supporting
        .filter((_: SelectedActor, idx: number) => idx !== i)
        .filter((other: SelectedActor) => 
          !connections.some(c => 
            (c.actor1 === supporting.id && c.actor2 === other.id) ||
            (c.actor2 === supporting.id && c.actor1 === other.id)
          )
        );
      
      const connected = shuffleArray(potentials).slice(0, numConnections) as SelectedActor[];
      
      connected.forEach((other: SelectedActor) => {
        const relationships = ['ally', 'friend', 'source', 'critic'];
        connections.push({
          actor1: supporting.id,
          actor2: other.id,
          relationship: relationships[Math.floor(Math.random() * relationships.length)]!,
          context: `Peers in ${supporting.domain?.[0] || 'industry'}`,
        });
      });
    });

    return connections;
  }

  /**
   * Initialize luck and mood tracking for all actors
   */
  private initializeLuckMood(selectedActors: { mains: SelectedActor[]; supporting: SelectedActor[]; extras: SelectedActor[] }): Map<string, { luck: string; mood: number }> {
    const tracking = new Map<string, { luck: string; mood: number }>();
    
    const allActors = [
      ...(selectedActors.mains || []),
      ...(selectedActors.supporting || []),
      ...(selectedActors.extras || []),
    ];

    allActors.forEach((actor: SelectedActor) => {
      if (actor && actor.id) {
        tracking.set(actor.id, {
          luck: actor.initialLuck || 'medium',
          mood: actor.initialMood || 0,
        });
      }
    });

    return tracking;
  }

  /**
   * Generate a contextually relevant group chat name using LLM
   */
  private async generateGroupChatName(
    admin: SelectedActor,
    members: SelectedActor[],
    domain: string
  ): Promise<string> {
    const memberDescriptions = members.map(m => {
      const affiliations = m.affiliations?.slice(0, 2).join(', ') || 'various organizations';
      return `- ${m.name}: ${m.role || 'Notable figure'} at ${affiliations}`;
    }).join('\n');

    const prompt = loadPrompt('game/group-chat-name', {
      adminName: admin.name,
      adminRole: admin.role || 'Notable figure',
      domain,
      adminAffiliations: admin.affiliations?.slice(0, 3).join(', ') || 'various organizations',
      memberDescriptions
    });

    const response = await this.llm.generateJSON<{ name: string }>(prompt, {
      required: ['name']
    });

    return response.name.toLowerCase();
  }

  /**
   * Create group chats - one per main actor + some for high-tier supporting
   */
  private async createGroupChats(selectedActors: SelectedActorsByTier, connections: ActorConnection[]): Promise<GroupChat[]> {
    const chats: GroupChat[] = [];
    
    // Helper to get positive relationships for an actor
    const getPositiveConnections = (actorId: string): string[] => {
      const positiveRelationships = ['ally', 'friend', 'advisor', 'source'];
      return connections
        .filter(c => 
          (c.actor1 === actorId || c.actor2 === actorId) &&
          positiveRelationships.includes(c.relationship)
        )
        .map(c => c.actor1 === actorId ? c.actor2 : c.actor1);
    };
    
    // Helper to get actor details by ID
    const getActorById = (id: string): SelectedActor | undefined => {
      return [...selectedActors.mains, ...selectedActors.supporting, ...selectedActors.extras]
        .find((a: SelectedActor) => a.id === id);
    };
    
    console.log('🎭 Generating contextual group chat names...');
    
    // One group per main actor
    for (const main of selectedActors.mains) {
      const positiveConnections = getPositiveConnections(main.id);
      const memberIds = [main.id, ...positiveConnections.slice(0, 6)];
      const members = memberIds.map(id => getActorById(id)).filter(Boolean);
      
      const domain = main.domain?.[0] || 'general';
      
      // Generate contextual name using LLM
      const groupName = await this.generateGroupChatName(main, members, domain);
      const kebabName = groupName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      
      console.log(`  💬 "${groupName}" (admin: ${main.name})`);
      
      chats.push({
        id: kebabName,
        name: groupName,
        admin: main.id,
        members: memberIds,
        theme: domain,
      });
    }
    
    // Add 1-2 groups for S/A-tier supporting actors
    const highTierSupporting = selectedActors.supporting
      .filter((a: SelectedActor) => a.tier === 'S_TIER' || a.tier === 'A_TIER')
      .slice(0, 2);
    
    for (const supporting of highTierSupporting) {
      const positiveConnections = getPositiveConnections(supporting.id);
      const memberIds = [supporting.id, ...positiveConnections.slice(0, 5)];
      const members = memberIds.map(id => getActorById(id)).filter(Boolean);
      
      const domain = supporting.domain?.[0] || 'general';
      
      // Generate contextual name using LLM
      const groupName = await this.generateGroupChatName(supporting, members, domain);
      const kebabName = groupName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + `-${chats.length}`;
      
      console.log(`  💬 "${groupName}" (admin: ${supporting.name})`);
      
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

  /**
   * Generate single day's events, feed posts, and group messages
   */
  private async generateDay(
    day: number,
    actors: { mains: SelectedActor[]; supporting: SelectedActor[]; extras: SelectedActor[] },
    questions: Question[],
    scenarios: Scenario[],
    groupChats: GroupChat[],
    previousDays: DayTimeline[],
    luckMood: Map<string, { luck: string; mood: number }>,
    dateStr: string,
    connections: ActorConnection[]
  ): Promise<DayTimeline> {
    const phase = this.getPhase(day);
    const eventCount = this.getEventCount(day);
    const allActors = [...actors.mains, ...actors.supporting, ...actors.extras];

    // Build comprehensive context
    const previousMonthContext = this.gameHistory.length > 0 
      ? generatePreviousMonthContext(this.gameHistory) 
      : '';
    const currentMonthContext = generateCurrentMonthContext(actors.mains, scenarios, questions, day);
    const daySummariesContext = previousDays.length > 0 
      ? generateDaySummariesContext(previousDays) 
      : '';
    
    const fullContext = previousMonthContext + currentMonthContext + daySummariesContext;

    // Generate events with full context
    const events: WorldEvent[] = [];
    const eventTypes: Array<WorldEvent['type']> = ['meeting', 'announcement', 'scandal', 'deal', 'conflict', 'revelation'];
    
    const eventRequests: Array<{
      eventNumber: number;
      type: WorldEvent['type'];
      actors: SelectedActor[];
      questionId: number;
    }> = [];
    
    for (let i = 0; i < eventCount; i++) {
      const type = eventTypes[Math.floor(Math.random() * eventTypes.length)]!;
      const numActorsInvolved = type === 'meeting' ? 2 + Math.floor(Math.random() * 3) : 1;
      const involvedActors = shuffleArray(allActors).slice(0, numActorsInvolved);
      const questionId = questions[i % questions.length]!.id;

      eventRequests.push({
        eventNumber: i,
        type,
        actors: involvedActors,
        questionId,
      });
    }
    
    // Generate all descriptions in one batched call with full context
    const descriptions = await this.generateDayEventsBatch(
      day,
      eventRequests,
      questions,
      fullContext,
      luckMood,
      connections
    );
      
    // Determine if this day should reveal answer hints based on phase
    const shouldReveal = this.shouldRevealAnswer(day, phase);

    descriptions.forEach((desc, i) => {
      const req = eventRequests[i];
      if (!req) return; // Skip if no matching request

      events.push({
        id: `event-${day}-${i}`,
        type: req.type,
        actors: req.actors.map((a: SelectedActor) => a.id),
        description: desc.event,
        relatedQuestion: req.questionId,
        // Only reveal hints if phase allows it
        pointsToward: shouldReveal ? (desc.pointsToward || null) : null,
        visibility: req.type === 'meeting' ? 'private' : 'public',
      });
    });

    // Prepare actor states for this day
    const actorStateMap = new Map();
    allActors.forEach((actor: SelectedActor) => {
      const state = luckMood.get(actor.id);
      actorStateMap.set(actor.id, {
        mood: state?.mood || 0,
        luck: (state?.luck as 'low' | 'medium' | 'high') || 'medium',
      });
    });
    
    // Build group contexts for all actors
    const actorGroupContextMap = new Map<string, string>();
    allActors.forEach((actor: SelectedActor) => {
      const groupContext = getActorGroupContext(actor.id, groupChats, previousDays, allActors);
      actorGroupContextMap.set(actor.id, groupContext);
    });
    
    // Set context and states in feed generator
    this.feedGenerator.setActorStates(actorStateMap);
    this.feedGenerator.setRelationships(connections);
    this.feedGenerator.setActorGroupContexts(actorGroupContextMap);

    // Generate feed posts from events
    const feedPosts = await this.feedGenerator.generateDayFeed(
      day,
      events.map(e => ({
        id: e.id,
        day,
        type: e.type,
        description: e.description,
        actors: e.actors,
        visibility: e.visibility,
      })),
      allActors,
      questions[0]!.outcome
    );

    // Generate group messages - BATCHED
    const groupMessages = await this.generateDayGroupMessagesBatch(
      day, 
      events, 
      groupChats, 
      allActors, 
      previousDays, 
      luckMood, 
      connections,
      scenarios,
      questions,
      fullContext
    );

    // Apply ambient mood drift for all actors (small random changes)
    this.applyAmbientMoodDrift(allActors, luckMood);

    // Generate luck and mood changes (for actors in events - larger changes)
    const luckChanges = this.generateLuckChanges(day, events, allActors, luckMood);
    const moodChanges = this.generateMoodChanges(day, events, allActors, luckMood);

    // Generate resolution events during the Resolution phase (days 27-30)
    if (phase === 'Resolution' && day >= 28) {
      // Generate one resolution event per question on days 28-30
      const questionIndex = day - 28; // Day 28 = question 0, day 29 = question 1, day 30 = question 2
      if (questionIndex < questions.length) {
        const resolutionEvent = await this.generateResolutionEvent(
          questions[questionIndex]!,
          allActors,
          day,
          previousDays
        );
        events.push(resolutionEvent);
      }
    }

    return {
      day,
      summary: `${dateStr}: ${phase} phase - ${events.length} events, ${feedPosts.length} posts, ${Object.values(groupMessages).flat().length} group messages`,
      events,
      groupChats: groupMessages,
      feedPosts,
      luckChanges,
      moodChanges,
    };
  }

  /**
   * BATCHED: Generate all event descriptions for a day in ONE call with full context
   */
  private async generateDayEventsBatch(
    day: number,
    eventRequests: Array<{
      eventNumber: number;
      type: WorldEvent['type'];
      actors: SelectedActor[];
      questionId: number;
    }>,
    questions: Question[],
    fullContext: string,
    luckMood: Map<string, { luck: string; mood: number }>,
    connections: ActorConnection[]
  ): Promise<Array<{ eventNumber: number; event: string; pointsToward: 'YES' | 'NO' | null }>> {
    const eventRequestsList = eventRequests.map((req, i) => {
      const question = questions.find(q => q.id === req.questionId);
      const actorsWithMood = req.actors.map(a => {
        const state = luckMood.get(a.id);
        const emotionalContext = state
          ? generateActorContext(state.mood, state.luck as 'low' | 'medium' | 'high', undefined, connections, a.id)
          : '';
        return `${a.name} (${a.description})${emotionalContext ? '\n   ' + emotionalContext.replace(/\n/g, '\n   ') : ''}`;
      }).join('\n   ');
      return `${i + 1}. Type: ${req.type}
   Actors: 
   ${actorsWithMood}
   Related to: ${question?.text || 'General drama'}
   
   Create event involving these actors. Build on the narrative above.
   Their mood and luck should influence the nature of the event.
   One sentence, max 120 chars, satirical but plausible.`;
    }).join('\n');

    const prompt = loadPrompt('game/day-events', {
      fullContext,
      day,
      eventCount: eventRequests.length,
      eventRequestsList
    });

    const response = await this.llm.generateJSON<{ 
      events: Array<{ 
        eventNumber: number; 
        event: string; 
        pointsToward: 'YES' | 'NO' | null 
      }> 
    }>(prompt, undefined, { temperature: 0.9, maxTokens: 5000 });

    return response.events || [];
  }

  /**
   * Should this day's events reveal the answer?
   */
  private shouldRevealAnswer(_day: number, phase: string): boolean {
    if (phase === 'Early') return Math.random() > 0.0;
    if (phase === 'Middle') return Math.random() > 0.1; // 40% chance
    if (phase === 'Late') return Math.random() > 0.6; // 60% chance
    if (phase === 'Climax') return Math.random() > 0.3; // 80% chance
    return true; // Resolution always reveals
  }

  /**
   * Generate concrete event description using LLM
   * Events should be specific, concrete things that happened
   */
  public async generateEventDescription(
    actors: SelectedActor[],
    type: WorldEvent['type'],
    _questionId: number,
    day: number
  ): Promise<string> {
    const actorNames = actors.map(a => a.name).join(' and ');
    const prompt = `Generate a satirical event description for day ${day}.
Event type: ${type}
Actors: ${actorNames}
Max 120 characters, one sentence.`;

    const response = await this.llm.generateJSON<{ event: string }>(
      prompt,
      undefined,
      { temperature: 0.9 }
    );

    return response.event || `${actorNames} ${type}`;
  }

  /**
   * Generate a resolution event that definitively resolves a question
   * These happen on days 21-30 and provide clear YES or NO evidence
   */
  private async generateResolutionEvent(
    question: Question,
    allActors: SelectedActor[],
    day: number,
    previousDays: DayTimeline[]
  ): Promise<WorldEvent> {
    // Get actors involved in this question's scenario
    const mainActors = allActors.filter(a => a.role === 'main').slice(0, 2);
    
    // Build context from previous events
    const relatedEvents = previousDays
      .flatMap(d => d.events)
      .filter(e => e.relatedQuestion === question.id)
      .slice(-3); // Last 3 related events
    
    const eventHistory = relatedEvents.length > 0
      ? `Recent events: ${relatedEvents.map(e => e.description).join('; ')}`
      : 'No prior events';
    
    const prompt = `You must respond with valid JSON only.

Question: ${question.text}
Outcome: ${question.outcome ? 'YES' : 'NO'}
History: ${eventHistory}

Generate a definitive resolution event proving the ${question.outcome ? 'YES' : 'NO'} outcome.
${question.outcome ? 'PROVES it happened' : 'PROVES it failed/was cancelled'}
One sentence, max 150 chars, concrete and observable.

Respond with ONLY this JSON format:
{
  "event": "your resolution event",
  "type": "announcement"
}

No other text.`;

    const response = await this.llm.generateJSON<{ event: string; type: 'announcement' | 'revelation' }>(
      prompt,
      undefined,
      { temperature: 0.7, maxTokens: 5000 }
    );

    return {
      id: `resolution-${day}-${question.id}`,
      type: response.type || 'revelation',
      actors: mainActors.map(a => a.id),
      description: response.event || `Resolution event for question ${question.id}`,
      relatedQuestion: question.id,
      pointsToward: question.outcome ? 'YES' : 'NO',
      visibility: 'public',
    };
  }

  /**
   * BATCHED: Generate all group messages for the day in ONE call
   * Reduces ~5 calls per day → 1 call per day
   */
  private async generateDayGroupMessagesBatch(
    day: number,
    events: WorldEvent[],
    groupChats: GroupChat[],
    allActors: SelectedActor[],
    previousDays: DayTimeline[] = [],
    luckMood?: Map<string, { luck: string; mood: number }>,
    connections?: ActorConnection[],
    scenarios?: Scenario[],
    questions?: Question[],
    fullContext?: string
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
        const activeMembers = shuffleArray(
          allActors.filter(a => group.members.includes(a.id))
        ).slice(0, numMessages);
        
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
    
    // Generate all messages in one batch
    const recentEvent = events.length > 0 ? events[Math.floor(Math.random() * events.length)] : null;

    // Build additional context from optional parameters
    const scenarioContext = scenarios && scenarios.length > 0
      ? `\n\nACTIVE SCENARIOS: ${scenarios.map(s => s.description).join('; ')}`
      : '';

    const questionContext = questions && questions.length > 0
      ? `\n\nQUESTIONS TO RESOLVE: ${questions.map(q => q.text).join('; ')}`
      : '';

    // Build emotional state context for actors
    const getEmotionalState = (actorId: string): string => {
      if (!luckMood) return '';
      const state = luckMood.get(actorId);
      if (!state) return '';
      
      const moodDesc = state.mood > 0.3 ? 'confident' : state.mood < -0.3 ? 'pessimistic' : 'neutral';
      const luckDesc = state.luck === 'high' ? '🍀 lucky streak' : state.luck === 'low' ? '💀 unlucky' : 'average luck';
      return ` [${moodDesc}, ${luckDesc}]`;
    };

    // Build relationship context between group members
    const getRelationshipContext = (groupMembers: Array<{ actorId: string; actorName: string }>): string => {
      if (!connections || groupMembers.length < 2) return '';

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
    };;

    const groupsList = groupRequests.map((req, i) => `${i + 1}. "${req.groupName}"
   
   MEMBERS IN THIS CHAT (don't gossip about them):
${req.members.map((m, j) => {
  const actor = allActors.find(a => a.id === m.actorId);
  const emotionalState = getEmotionalState(m.actorId);
  return `   ${j + 1}. ${m.actorName}${emotionalState} [${actor?.affiliations?.join(', ') || 'independent'}]`;
}).join('\n')}${getRelationshipContext(req.members)}
   
   PEOPLE NOT IN THIS CHAT (you can gossip):
   ${allActors.filter(a => !req.members.find(m => m.actorId === a.id)).slice(0, 12).map(a => a.name).join(', ')}
   
   ${req.previousMessages.length > 0 ? `CONVERSATION HISTORY:
${req.previousMessages.map(pm => `   [Day ${pm.day}] ${pm.actorName}: "${pm.message}"`).join('\n')}
   
   ` : ''}PRIVATE CHAT RULES:
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
      fullContext: fullContext || `Day ${day} of 30`,
      scenarioContext,
      questionContext,
      day,
      eventsList: events.map(e => e.description).join('; '),
      recentEventContext: recentEvent ? `\nMost talked about: ${recentEvent.description}` : '',
      groupCount: groupRequests.length,
      groupsList
    });

    const maxRetries = 5;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const response = await this.llm.generateJSON<{ 
        groups: Array<{
          groupId: string;
          messages: Array<{
            actorId: string;
            message: string;
          }>;
        }> 
      }>(
        prompt,
        { required: ['groups'] },
        { temperature: 1.0, maxTokens: 5000 }
      );

      const groups = response.groups || [];
      if (groups.length === groupRequests.length && groups.every(g => g.messages && g.messages.length > 0)) {
        // Convert to expected format
        groups.forEach((group, i) => {
          const req = groupRequests[i];
          if (!req) return; // Skip if no matching request

          messages[group.groupId] = group.messages.map((msg, j) => ({
            from: msg.actorId,
            message: msg.message,
            timestamp: `2025-10-${String(day).padStart(2, '0')}T${String(10 + j * 2).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}:00Z`,
            clueStrength: req.members.find(m => m.actorId === msg.actorId)?.role === 'main' ? 0.7 : 0.4,
          }));
        });
        
        return messages;
      }

      console.warn(`⚠️  Invalid group messages batch for day ${day} (attempt ${attempt + 1}/${maxRetries}). Expected ${groupRequests.length}, got ${groups.length}`);
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    throw new Error(`Failed to generate group messages batch for day ${day} after ${maxRetries} attempts`);
  }

  /**
   * DEPRECATED: Old individual message generation - kept for reference
   * Use generateDayGroupMessagesBatch instead
   */
  private async generateGroupMessages(
    day: number,
    events: WorldEvent[],
    groupChats: GroupChat[],
    allActors: SelectedActor[]
  ): Promise<Record<string, ChatMessage[]>> {
    return this.generateDayGroupMessagesBatch(
      day, 
      events, 
      groupChats, 
      allActors, 
      [], 
      new Map(), 
      [], 
      [], 
      [], 
      ''
    );
  }

  /**
   * Get group activity chance based on day
   */
  private getGroupActivityChance(day: number): number {
    if (day <= 10) return 0.3; // Quiet early
    if (day <= 20) return 0.5; // Moderate mid-game
    if (day <= 25) return 0.7; // Active late game
    return 0.9; // Very active near end
  }

  /**
   * Generate group message content using LLM
   * Private insider information shared in groups
   */
  public async generateGroupMessage(
    actor: SelectedActor, 
    events: WorldEvent[], 
    day: number,
    groupTheme: string
  ): Promise<string> {
    const recentEvent = events[Math.floor(Math.random() * events.length)];
    
    const prompt = `You are ${actor.name}, a ${actor.description}.
Personality: ${actor.personality}
Domain: ${actor.domain?.join(', ')}

You're in a PRIVATE group chat about ${groupTheme} with trusted insiders.
${recentEvent ? `Recent event: ${recentEvent.description}` : `It's Day ${day} of 30`}

Write a private message (max 200 chars) sharing insider info or your real thoughts.
- This is PRIVATE - be more candid than on public feed
- Share information you wouldn't post publicly
- ${day < 15 ? 'Drop vague hints' : 'Share more concrete information'}
- Stay in character
- Can use emojis (🤫, 👀, 🔥, etc.) if natural

Write ONLY the message text:`;

    const response = await this.llm.generateJSON<{ message: string }>(
      prompt,
      undefined,
      { temperature: 1.0 }
    );

    return response.message || `Day ${day}: Interesting developments...`;
  }

  /**
   * Generate luck changes for the day
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
   * Generate mood changes for the day
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
   * Apply ambient mood drift to all actors
   * Small random mood changes each day to simulate natural emotional variation
   * Ensures all actors (not just those in events) have evolving emotional states
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

  /**
   * Generate final resolution
   */
  private generateResolution(
    questions: Question[],
    timeline: DayTimeline[]
  ): GameResolution {
    const outcomes = questions.map(q => {
      // Find key events that pointed to this outcome
      const relevantEvents = timeline
        .flatMap(day => day.events)
        .filter(e => e.relatedQuestion === q.id && e.pointsToward === (q.outcome ? 'YES' : 'NO'))
        .slice(0, 3);

      return {
        questionId: q.id,
        answer: q.outcome,
        explanation: `Throughout the 30 days, events aligned toward ${q.outcome ? 'YES' : 'NO'}. ${relevantEvents.length} key events confirmed this outcome.`,
        keyEvents: relevantEvents.map(e => e.description),
      };
    });

    return {
      day: 30,
      outcomes,
      finalNarrative: `All ${questions.length} questions have been resolved. The 30-day narrative concludes with clear outcomes based on the events that unfolded.`,
    };
  }

  private getPhase(day: number): string {
    if (day <= 10) return 'Early';
    if (day <= 20) return 'Middle';
    if (day <= 25) return 'Late';
    if (day < 30) return 'Climax';
    return 'Resolution';
  }

  private getEventCount(day: number): number {
    // Match GDD requirements
    if (day <= 10) return 3 + Math.floor(Math.random() * 3); // 3-5 events (WILD PHASE)
    if (day <= 20) return 5 + Math.floor(Math.random() * 3); // 5-7 events (CONNECTION PHASE)
    if (day <= 25) return 7 + Math.floor(Math.random() * 4); // 7-10 events (CONVERGENCE)
    if (day < 30) return 10 + Math.floor(Math.random() * 6); // 10-15 events (CLIMAX)
    return 5; // Day 30 resolution (5 final events)
  }
}

