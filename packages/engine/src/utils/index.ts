/**
 * Utility Functions Index
 *
 * Re-exports all utility functions from the engine package
 */

// Content analysis utilities
// Content safety utilities
export {
  analyzeCertainty,
  analyzeSentiment,
  type ContentCheckResult,
  calculateContentQuality,
  calculateFreshness,
  checkAgentOutput,
  checkUserInput,
  detectPrediction,
  hasInsiderLanguage,
  sanitizeContent,
} from '@babylon/shared';

// Prompt logging utilities
export {
  isPromptLoggingEnabled,
  logPrompt,
  type PromptLogEntry,
} from './prompt-logger';

// Randomization utilities
export {
  pickRandom,
  randomChance,
  randomInt,
  sampleRandom,
  shuffleArray,
} from './randomization';

// Shared utilities (formatActorVoiceContext, buildPhaseContext, etc.)
export {
  buildCharacterVoiceBlock,
  buildPhaseContext,
  buildRelationshipContext,
  formatActorVoiceContext,
  toQuestionIdNumberOrNull,
} from './shared-utils';
