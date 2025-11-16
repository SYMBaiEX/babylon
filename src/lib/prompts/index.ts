/**
 * Prompt Utilities
 * 
 * Utilities for working with feed prompts and world context
 */

// World context generation - re-export from prompts
export {
  generateWorldContext,
  generateWorldActors,
  generateCurrentMarkets,
  generateActivePredictions,
  generateRecentTrades,
  getParodyActorNames,
  getForbiddenRealNames,
  type WorldContextOptions,
} from '@/prompts';

// Re-export ActorData from shared types for convenience
export type { ActorData } from '@/shared/types';

// Output validation
export {
  validateFeedPost,
  validatePostBatch,
  validateNoRealNames,
  validateNoHashtags,
  validateNoEmojis,
  validateCharacterLimit,
  CHARACTER_LIMITS,
  type ValidationResult,
} from './validate-output';

