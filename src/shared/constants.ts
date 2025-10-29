/**
 * Shared Constants for Babylon Game
 *
 * Centralized constants to eliminate magic strings across codebase
 */

/**
 * Actor tier levels (influence and prominence)
 */
export const ACTOR_TIERS = {
  S_TIER: 'S_TIER',
  A_TIER: 'A_TIER',
  B_TIER: 'B_TIER',
  C_TIER: 'C_TIER',
} as const;

export type ActorTier = (typeof ACTOR_TIERS)[keyof typeof ACTOR_TIERS];

/**
 * Feed post types
 */
export const POST_TYPES = {
  WORLD_EVENT: 'world_event',
  REACTION: 'reaction',
  NEWS: 'news',
  THREAD: 'thread',
  RUMOR: 'rumor',
  POST: 'post',
  REPLY: 'reply',
} as const;

export type PostType = (typeof POST_TYPES)[keyof typeof POST_TYPES];

/**
 * Day ranges for escalation rules
 * Content gets progressively more chaotic as the game progresses
 */
export const DAY_RANGES = {
  EARLY: { min: 1, max: 10 },    // Days 1-10: Setup, introductions
  MID: { min: 11, max: 20 },     // Days 11-20: Rising action
  LATE: { min: 21, max: 30 },    // Days 21-30: Peak chaos
} as const;

/**
 * Organization types
 */
export const ORG_TYPES = {
  TECH_COMPANY: 'tech_company',
  MEDIA_OUTLET: 'media_outlet',
  GOVERNMENT: 'government',
  NONPROFIT: 'nonprofit',
  CRYPTO: 'crypto',
} as const;

export type OrgType = (typeof ORG_TYPES)[keyof typeof ORG_TYPES];

/**
 * Actor selection counts for game generation
 */
export const ACTOR_COUNTS = {
  MAIN: 3,
  SUPPORTING: 15,
  EXTRAS: 50,
} as const;

/**
 * Scenario and question counts
 */
export const GAME_STRUCTURE = {
  SCENARIOS: 3,
  QUESTIONS_PER_SCENARIO: 1,
  DAYS: 30,
} as const;

/**
 * Feed generation targets
 */
export const FEED_TARGETS = {
  MIN_POSTS: 300,
  MAX_POSTS: 500,
  MIN_GROUP_MESSAGES: 100,
  MAX_GROUP_MESSAGES: 200,
} as const;

/**
 * Escalation rules for content intensity
 * Controls how wild content can get based on day number
 */
export function getEscalationLevel(day: number): 'mild' | 'moderate' | 'intense' {
  if (day <= DAY_RANGES.EARLY.max) return 'mild';
  if (day <= DAY_RANGES.MID.max) return 'moderate';
  return 'intense';
}
