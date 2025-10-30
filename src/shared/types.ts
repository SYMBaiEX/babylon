/**
 * Shared Type Definitions for Babylon Game
 *
 * Centralized TypeScript types to eliminate duplication and ensure consistency
 */

import type { ACTOR_TIERS, POST_TYPES, ORG_TYPES } from '@/shared/constants';

/**
 * Actor tier type from constants
 */
export type ActorTier = (typeof ACTOR_TIERS)[keyof typeof ACTOR_TIERS];

/**
 * Post type from constants
 */
export type PostType = (typeof POST_TYPES)[keyof typeof POST_TYPES];

/**
 * Organization type from constants
 */
export type OrgType = (typeof ORG_TYPES)[keyof typeof ORG_TYPES];

/**
 * Core Actor data structure
 * Used across all game systems
 */
export interface Actor {
  id: string;
  name: string;
  description?: string;
  domain?: string[];
  personality?: string;
  role?: string;
  affiliations?: string[]; // Organization IDs
  postStyle?: string; // Style guide for how they write posts
  postExample?: string[]; // Example posts demonstrating their voice
  tier?: ActorTier;
}

/**
 * Extended actor with game state
 * Used during game generation and simulation
 */
export interface SelectedActor extends Actor {
  tier: ActorTier;
  role: string;
  initialLuck: 'low' | 'medium' | 'high';
  initialMood: number; // -1 to 1
}

/**
 * Actor runtime state
 * Tracks mood and luck during game progression
 */
export interface ActorState {
  mood: number; // -1 to 1
  luck: 'low' | 'medium' | 'high';
}

/**
 * Relationship between two actors
 */
export interface ActorRelationship {
  actor1: string;
  actor2: string;
  relationship: string;
  context: string;
}

/**
 * Connection between actors (used in game setup)
 */
export interface ActorConnection {
  actor1: string;
  actor2: string;
  relationship: string;
  context: string;
}

/**
 * Stock price at a specific moment
 */
export interface StockPrice {
  price: number;
  timestamp: string; // ISO timestamp
  change: number; // Change from previous price
  changePercent: number; // Percentage change
}

/**
 * Price update with reason
 */
export interface PriceUpdate {
  organizationId: string;
  timestamp: string;
  oldPrice: number;
  newPrice: number;
  change: number;
  changePercent: number;
  reason: string; // Event that caused the change
  impact: 'major' | 'moderate' | 'minor'; // Magnitude of impact
}

/**
 * Markov chain state for price generation
 */
export interface MarkovChainState {
  trend: 'bullish' | 'bearish' | 'neutral';
  volatility: number; // 0-1
  momentum: number; // -1 to 1
}

/**
 * Organization entity
 */
export interface Organization {
  id: string;
  name: string;
  description: string;
  type: 'company' | 'media' | 'government';
  canBeInvolved: boolean;
  postStyle?: string;
  postExample?: string[];
  // Stock price fields (only for companies)
  initialPrice?: number; // Starting price
  currentPrice?: number; // Current price
  priceHistory?: StockPrice[]; // Historical prices
  markovState?: MarkovChainState; // Current market state
}

/**
 * Feed post (social media post)
 */
export interface FeedPost {
  id: string;
  day: number;
  timestamp: string;
  type: PostType;
  content: string;
  author: string;
  authorName: string;
  replyTo?: string;
  relatedEvent?: string;
  sentiment: number; // -1 to 1
  clueStrength: number; // 0-1 (how much this reveals)
  pointsToward: boolean | null; // Does this hint at YES or NO?
}

/**
 * Alias for backwards compatibility
 */
export type FeedEvent = FeedPost;

/**
 * World event (things that happen in the game world)
 */
export interface WorldEvent {
  id: string;
  day: number;
  type:
    | 'announcement'
    | 'meeting'
    | 'leak'
    | 'development'
    | 'scandal'
    | 'rumor'
    | 'deal'
    | 'conflict'
    | 'revelation'
    | 'development:occurred'
    | 'news:published';
  actors: string[];
  description: string;
  relatedQuestion?: number | null;
  pointsToward?: 'YES' | 'NO' | null;
  visibility: 'public' | 'leaked' | 'secret' | 'private' | 'group';
}

/**
 * Scenario for prediction market
 */
export interface Scenario {
  id: number;
  title: string;
  description: string;
  mainActors: string[];
  involvedOrganizations?: string[];
  theme: string;
}

/**
 * Question for prediction market
 */
export interface Question {
  id: number;
  text: string;
  scenario: number;
  outcome: boolean;
  rank: number;
  // New fields for continuous game
  createdDate?: string; // ISO date when question was created
  resolutionDate?: string; // ISO date when question resolves (24h-7d from creation)
  status?: 'active' | 'resolved' | 'cancelled'; // Question lifecycle status
  resolvedOutcome?: boolean; // Final outcome when resolved
}

/**
 * Group chat configuration
 */
export interface GroupChat {
  id: string;
  name: string;
  admin: string;
  members: string[];
  theme: string;
}

/**
 * Chat message in group chat
 */
export interface ChatMessage {
  from: string;
  message: string;
  timestamp: string;
  clueStrength: number; // 0-1
}

/**
 * Luck change event
 */
export interface LuckChange {
  actor: string;
  from: string;
  to: string;
  reason: string;
}

/**
 * Mood change event
 */
export interface MoodChange {
  actor: string;
  from: number;
  to: number;
  reason: string;
}

/**
 * Day timeline (single day in game)
 */
export interface DayTimeline {
  day: number;
  summary: string;
  events: WorldEvent[];
  groupChats: Record<string, ChatMessage[]>;
  feedPosts: FeedPost[];
  luckChanges: LuckChange[];
  moodChanges: MoodChange[];
}

/**
 * Question outcome at game resolution
 */
export interface QuestionOutcome {
  questionId: number;
  answer: boolean;
  explanation: string;
  keyEvents: string[];
}

/**
 * Game resolution (final state)
 */
export interface GameResolution {
  day: 30;
  outcomes: QuestionOutcome[];
  finalNarrative: string;
}

/**
 * Game setup configuration
 */
export interface GameSetup {
  mainActors: SelectedActor[];
  supportingActors: SelectedActor[];
  extras: SelectedActor[];
  organizations: Organization[];
  scenarios: Scenario[];
  questions: Question[];
  groupChats: GroupChat[];
  connections: ActorConnection[];
}

/**
 * Game state for continuous generation
 */
export interface GameState {
  id: string;
  currentDay: number;
  currentDate: string; // ISO date
  activeQuestions: Question[]; // Currently active questions (max 20)
  resolvedQuestions: Question[]; // Questions that have been resolved
  organizations: Organization[]; // Organizations with current prices
  priceUpdates: PriceUpdate[]; // Recent price updates
  lastGeneratedDate: string; // ISO timestamp of last generation
}

/**
 * Complete generated game
 */
export interface GeneratedGame {
  id: string;
  version: string;
  generatedAt: string;
  setup: GameSetup;
  timeline: DayTimeline[];
  resolution: GameResolution;
  // New fields for continuous game
  gameState?: GameState; // Current game state (for continuous games)
}

/**
 * Actors database structure
 */
export interface ActorsDatabase {
  version: string;
  description: string;
  actors: Actor[];
  organizations: Organization[];
}

/**
 * Game history summary (for context in subsequent games)
 */
export interface GameHistory {
  gameNumber: number;
  completedAt: string;
  summary: string;
  keyOutcomes: {
    questionText: string;
    outcome: boolean;
    explanation: string;
  }[];
  highlights: string[];
  topMoments: string[];
}

/**
 * Genesis game (initial 7-day game)
 */
export interface GenesisGame {
  id: string;
  version: string;
  generatedAt: string;
  dateRange: {
    start: string; // "2025-10-24"
    end: string; // "2025-10-31"
  };
  actors: SelectedActor[];
  timeline: DayTimeline[];
  summary: string;
}
