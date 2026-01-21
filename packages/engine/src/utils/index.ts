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
// Comprehensive context builder for rich NPC context
export {
  buildComprehensiveNPCContext,
  type ComprehensiveNPCContext,
  formatComprehensiveContext,
} from './context-builder';
// Context limits and utilities
export {
  CONTEXT_LIMITS,
  estimateTokens,
  isContextSizeSafe,
  truncateArray,
  truncateText,
} from './context-limits';
// Date utilities
export {
  extractDayFromEvent,
  extractDayFromPost,
  extractDayFromTimestamp,
} from './date-utils';
// Entropy utilities (secure random, weighted picks, cooldowns)
export {
  biasedRandomCount,
  type EventCooldownState,
  generateSentimentSignal,
  SeededRandom,
  securePickN,
  secureRandom,
  secureRandomInt,
  secureShuffle,
  shouldFireEvent,
  urgencyWeight,
  weightedPick,
} from './entropy';
// Rich game context builder for game generation prompts
export {
  buildCharacterRoster,
  buildRichGameContext,
  type CharacterRosterEntry,
  extractNarrativeThreadsWithLoopDetection,
  formatCharacterAndOrgRoster,
  formatCharacterGameContext,
  formatDaySummaries,
  formatRichGameContext,
  formatRichGameContextWithEntropy,
  generateAntiLoopContext,
  type RichGameContext,
} from './game-context-builder';
// Prompt logging utilities
export {
  isPromptLoggingEnabled,
  logPrompt,
  type PromptLogEntry,
} from './prompt-logger';
// Randomization utilities
export {
  pickRandom,
  type RngFunction,
  randomChance,
  randomInt,
  sampleRandom,
  shuffleArray,
} from './randomization';
// Shared utilities (formatActorVoiceContext, buildPhaseContext, etc.)
export {
  buildCharacterFeedContext,
  buildPhaseContext,
  deriveStrategyFromPersonality,
  formatActorVoiceContext,
  formatCharacterInfoWithEntropy,
  type GamePhase,
  generateBehavioralModifier,
  getPhaseForDay,
  getPhaseNarrativeGuidance,
  rateLimitedParallel,
  stripHashtagsAndEmojis,
  toQuestionIdNumberOrNull,
} from './shared-utils';
