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
  canPostFeed?: boolean;
  canPostGroups?: boolean;
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
  type: 'meeting' | 'announcement' | 'scandal' | 'deal' | 'conflict' | 'revelation';
  actors: string[];
  description: string;
  relatedQuestion: number | null;
  pointsToward: 'YES' | 'NO' | null;
  visibility: 'public' | 'private' | 'group';
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
 * Complete generated game
 */
export interface GeneratedGame {
  id: string;
  version: string;
  generatedAt: string;
  setup: GameSetup;
  timeline: DayTimeline[];
  resolution: GameResolution;
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
