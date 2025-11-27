/**
 * Prompt Utilities
 *
 * Utilities for working with feed prompts and world context
 */

// World context generation - re-export from prompts
export {
  generateActivePredictions,
  generateCurrentMarkets,
  generateRecentTrades,
  generateWorldActors,
  generateWorldContext,
  getForbiddenRealNames,
  getParodyActorNames,
  type WorldContextOptions,
} from '@/prompts';

// Re-export ActorData from shared types for convenience
export type { ActorData } from '@/shared/types';

// Output validation
export {
  CHARACTER_LIMITS,
  type ValidationResult,
  validateCharacterLimit,
  validateFeedPost,
  validateNoEmojis,
  validateNoHashtags,
  validateNoRealNames,
  validatePostBatch,
} from './validate-output';
