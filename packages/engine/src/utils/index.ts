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

// Entropy utilities (secure random, weighted picks, cooldowns)
export {
  biasedRandomCount,
  type EventCooldownState,
  generateSentimentSignal,
  securePickN,
  secureRandom,
  secureRandomInt,
  secureShuffle,
  SeededRandom,
  shouldFireEvent,
  urgencyWeight,
  weightedPick,
} from './entropy';

// Shared utilities (formatActorVoiceContext, buildPhaseContext, etc.)
export {
  buildCharacterFeedContext,
  buildPhaseContext,
  formatActorVoiceContext,
  formatCharacterInfoWithEntropy,
  generateBehavioralModifier,
  getPhaseForDay,
  getPhaseNarrativeGuidance,
  rateLimitedParallel,
  stripHashtagsAndEmojis,
  toQuestionIdNumberOrNull,
  type GamePhase,
} from './shared-utils';

// Comprehensive context builder for rich NPC context
export {
  buildComprehensiveNPCContext,
  formatComprehensiveContext,
  type ComprehensiveNPCContext,
} from './context-builder';

// Rich game context builder for game generation prompts
export {
  buildRichGameContext,
  formatRichGameContext,
  formatRichGameContextWithEntropy,
  formatCharacterGameContext,
  formatDaySummaries,
  extractNarrativeThreadsWithLoopDetection,
  generateAntiLoopContext,
  buildCharacterRoster,
  formatCharacterAndOrgRoster,
  type RichGameContext,
  type CharacterRosterEntry,
} from './game-context-builder';

// Context limits and utilities
export {
  CONTEXT_LIMITS,
  truncateText,
  truncateArray,
  estimateTokens,
  isContextSizeSafe,
} from './context-limits';

// Date utilities
export {
  extractDayFromTimestamp,
  extractDayFromEvent,
  extractDayFromPost,
} from './date-utils';
