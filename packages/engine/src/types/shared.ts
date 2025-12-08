/**
 * Shared Type Definitions for Babylon Game Engine
 *
 * Re-exports from @babylon/shared for convenience, plus engine-specific types
 */

// Re-export all types from @babylon/shared
export type {
  Actor,
  ActorConnection,
  ActorData,
  ActorFollow,
  ActorRelationship,
  ActorState,
  ActorsDatabase,
  ActorTier,
  DayTimeline,
  ElizaCharacter,
  ElizaMessageExample,
  FeedEvent,
  FeedPost,
  GameHistory,
  GameResolution,
  GameSetup,
  GameState,
  GeneratedGame,
  GenesisGame,
  GroupChat,
  GroupChatMessage as ChatMessage,
  GroupChatMessage,
  LuckChange,
  MarkovChainState,
  MoodChange,
  Organization,
  OrgType,
  PostType,
  PriceUpdate,
  Question,
  QuestionOutcome,
  RelationshipType,
  Scenario,
  SeedActorsDatabase,
  SelectedActor,
  StockPrice,
  WorldEvent,
} from '@babylon/shared';

// Re-export all constants from @babylon/shared
export {
  ACTOR_COUNTS,
  ACTOR_TIERS,
  DAY_RANGES,
  FEED_TARGETS,
  FEED_WIDGET_CONFIG,
  GAME_STRUCTURE,
  getEscalationLevel,
  ORG_TYPES,
  POST_TYPES,
  RELATIONSHIP_TYPES,
} from '@babylon/shared';

/**
 * World context for prompts (engine-specific)
 */
export interface WorldContext {
  crypto?: string;
  politics?: string;
  economy?: string;
  technology?: string;
  general?: string;
  timestamp?: string;
  headlines?: string;
}
