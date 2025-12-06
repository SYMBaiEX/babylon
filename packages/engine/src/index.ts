/**
 * Babylon Engine Package
 * Core game simulation, generation, and decision engines
 */

// Article Generator
export { type Article, ArticleGenerator } from './ArticleGenerator';

// Emotion System
export {
  type EmotionalState,
  generateActorContext,
  getRelationshipModifier,
  luckToDescription,
  moodToEmotion,
} from './EmotionSystem';

// Feed Generator
export { FeedGenerator } from './FeedGenerator';

// Game Generator
export {
  createQuestionPrompt,
  createScenarioPrompt,
  GameGenerator,
  OrganizationBehavior,
  type OrganizationType,
} from './GameGenerator';
// GameHistory, GeneratedGame types are re-exported from ./types/shared

// Game Loop
export { GameLoop, type TickResult } from './GameLoop';

// Game World
export {
  type DayEvent,
  GameWorld,
  type GameWorldEvents,
  type GroupMessage,
  type MarketContext,
  type NPC,
  type WorldConfig,
  type WorldState,
} from './GameWorld';

// WorldEvent type is re-exported from ./types/shared

// Token Counter (now in @babylon/api)
export {
  budgetTokens,
  countTokens,
  countTokensSync,
  getModelTokenLimit,
  getSafeContextLimit,
  MODEL_TOKEN_LIMITS,
  truncateToTokenLimit,
  truncateToTokenLimitSync,
} from '@babylon/api';
// Logger
// Snowflake ID Generator
// Utils - Content Analysis
// Utils - Content Safety
export {
  analyzeCertainty,
  analyzeSentiment,
  type ContentCheckResult,
  calculateContentQuality,
  calculateFreshness,
  checkAgentOutput,
  checkUserInput,
  detectPrediction,
  generateSnowflakeId,
  hasInsiderLanguage,
  isValidSnowflakeId,
  Logger,
  type LogLevel,
  logger,
  parseSnowflakeId,
  SnowflakeGenerator,
  sanitizeContent,
} from '@babylon/shared';
// Actors Data Loader
export {
  clearDataCache,
  getActorIds,
  getOrganizationIds,
  type LoadActorsOptions,
  loadActorById,
  loadActorsData,
  loadOrganizationById,
} from './actors-loader';
// Configuration
export {
  FEE_CONFIG,
  type FeeTransactionType,
  type FeeType,
} from './config/fees';
// Data Exports
export {
  getQuestionExamples,
  questionExamples,
} from './data/question-examples';
export { realityGroundingContent } from './data/reality-grounding';
// Bias Engine
export {
  type BiasAdjustment,
  type BiasConfig,
  BiasEngine,
  biasEngine,
} from './feedback/bias-engine';
// Game Service
export { gameService } from './game-service';
export {
  cleanMarkdownCodeBlocks,
  extractJsonFromText,
  parseContinuationContent,
} from './llm/json-continuation-parser';
// LLM Exports (re-exported for convenience)
export { BabylonLLMClient } from './llm/openai-client';
export { parseXML, type XMLParseResult } from './llm/xml-parser';
// Market Decision Engine
export { MarketDecisionEngine } from './MarketDecisionEngine';
// News Article Pacing Engine
export {
  type ArticleStage,
  NewsArticlePacingEngine,
} from './NewsArticlePacingEngine';
// NPC Investment Manager
export {
  NPCInvestmentManager,
  type PortfolioMetrics,
  type PortfolioPosition,
  type RebalanceAction,
} from './npc/npc-investment-manager';
// NPC Portfolio Strategy
export {
  NPCPortfolioStrategy,
  type StrategyConfig,
} from './npc/npc-portfolio-strategy';
// Perpetuals Engine
export { PerpetualsEngine } from './PerpetualsEngine';
// Perps Utilities (funding rate calculator, etc.)
export * from './perps';
// Perps Service
export {
  ensurePerpsEngineReady,
  getPerpsEngine,
  getReadyPerpsEngine,
  withPerpsEngine,
} from './perps-service';
// Post ID Parser
export {
  type ParsedPostMetadata,
  type ParseResult,
  parsePostId,
} from './post-id-parser';
// Concentrated Liquidity
export {
  type AddPositionParams,
  ConcentratedLiquidityPool,
  type ConcentratedPosition,
  type ConcentratedTradeResult,
  calculateOptimalRange,
  createPoolFromMarket,
  estimateFeeAPR,
  type PoolConfig,
  type PoolState,
  type RemovePositionResult,
} from './prediction-concentrated-liquidity';
// Prediction Pricing
export {
  calculateExpectedPayout,
  PredictionPricing,
  type ShareCalculation,
  type ShareCalculationWithFees,
} from './prediction-pricing';
// Prompts
export * from './prompts';
// Question Manager
export {
  type QuestionCreationParams,
  QuestionManager,
} from './QuestionManager';
// Relationship Evolution Engine
export {
  type Interaction,
  type RelationshipChange,
  RelationshipEvolutionEngine,
} from './RelationshipEvolutionEngine';
// Rate Limiting
export {
  checkDuplicate,
  checkRateLimit,
  cleanupDuplicates,
  cleanupRateLimits,
  clearAllDuplicates,
  clearAllRateLimits,
  clearDuplicates,
  DUPLICATE_DETECTION_CONFIGS,
  getDuplicateStats,
  getRateLimitStatus,
  RATE_LIMIT_CONFIGS,
  resetRateLimit,
} from './rate-limiting';
// Reputation Module
export {
  calculateAverageROI,
  calculateConfidenceScore,
  // Trade Feedback Calculator
  calculateEntryTimingScore,
  calculateExitTimingScore,
  calculateGameScore,
  // Reputation Calculation Service
  calculateReputationScore,
  calculateRiskScore,
  calculateSharpeRatio,
  calculateTradeMetrics,
  calculateTradeScore,
  calculateWinRate,
  denormalizePnL,
  type GameMetrics,
  generateBatchGameFeedback,
  generateGameCompletionFeedback,
  generateTradeCompletionFeedback,
  getReputationBreakdown,
  getReputationLeaderboard,
  getTradeFeedbackSummary,
  getTrustLevel,
  // PNL Normalization utilities
  normalizePnL,
  type ReputationScoreBreakdown,
  recalculateReputation,
  type TradeMetrics,
  updateFeedbackMetrics,
  updateGameMetrics,
  updateTradingMetrics,
} from './reputation';
// Serverless Game Tick
export {
  executeGameTick,
  type GameTickResult,
  resolveQuestionPayouts,
} from './serverless-game-tick';
// All Services (exported from services/index.ts)
export * from './services';
// Services
export {
  CharacterMappingService,
  characterMappingService,
  type TextReplacementResult,
} from './services/character-mapping-service';
export { EarnedPointsService } from './services/earned-points-service';
// Event Generation Helpers
export { generateEvents } from './services/event-generation-helpers';
export {
  type FeeCalculation,
  type FeeDistributionResult,
  FeeService,
  type ReferralEarnings,
} from './services/fee-service';
export { MarketContextService } from './services/market-context-service';
export {
  type AggregatedImpact,
  aggregateTradeImpacts,
  type TradeImpactInput,
} from './services/market-impact-service';
export {
  type KickProbabilityResult,
  type KickThresholds,
  NPCGroupDynamicsService as NPCGroupDynamicsCalculations,
} from './services/npc-group-dynamics-calculations';
// NPC Persona Generator
export {
  NPCPersonaGenerator,
  type PersonaAssignment,
} from './services/npc-persona-generator';
// Parody Headline Generator
export {
  createParodyHeadlineGenerator,
  type GeneratedParody,
  ParodyHeadlineGenerator,
} from './services/parody-headline-generator';
// Post Generation Helpers
export {
  generateNPCPost,
  generateOrgArticle,
  generateOrgPost,
} from './services/post-generation-helpers';
export {
  type BroadcasterFn,
  type PredictionHistoryEventType,
  type PredictionHistorySource,
  PredictionMarketService,
  type PredictionPriceSnapshot,
  type PredictionResolutionEvent,
  type PredictionTradeEvent,
} from './services/prediction-market-service';
// Question Arc Planner
export {
  type PhaseTargets,
  type QuestionArcPlan,
  QuestionArcPlanner,
} from './services/question-arc-planner';
// Reputation Sync Interface (for optional integration with agents package)
export {
  getReputationSyncService,
  type ReputationSyncOptions,
  type ReputationSyncResult,
  type ReputationSyncServiceInterface as ReputationSyncService,
  setReputationSyncService,
  syncReputationIfAvailable,
} from './services/reputation-service';
export {
  type ParsedFeed,
  type RSSFeedItem,
  RSSFeedService,
  rssFeedService,
} from './services/rss-feed-service';
// Tag Services
export {
  getCurrentTrendingTags,
  getPostsByTag,
  getRelatedTags,
  getTagStatistics,
  getTagsForPost,
  storeTagsForPost,
  storeTrendingTags,
} from './services/tag-service';
// Trade Cache Invalidation
export {
  type CacheInvalidationClient,
  invalidateAfterPerpTrade,
  invalidateAfterPredictionTrade,
  invalidatePerpTradesCache,
  invalidatePredictionTradesCache,
  setCacheInvalidationClient,
} from './services/trade-cache-invalidation';
// Trade Execution Service
export { TradeExecutionService } from './services/trade-execution-service';
export {
  calculateTrendingIfNeeded,
  calculateTrendingTags,
  shouldRecalculateTrending,
} from './services/trending-calculation-service';

// Wallet Service
export {
  type BalanceInfo,
  type TransactionHistoryItem,
  WalletService,
} from './services/wallet-service';
// Trending Topics Engine
export {
  type TrendingTopic,
  TrendingTopicsEngine,
} from './TrendingTopicsEngine';
// Common Types
export type {
  ApiResponse,
  ErrorLike,
  FilterParams,
  JsonRpcParams,
  JsonRpcResult,
  JsonValue,
  LLMResponse,
  LogData,
  PaginatedResponse,
  PaginationParams,
  QueryParams,
  SortOrder,
  SortParams,
  StringRecord,
  WebSocketData,
} from './types/common';
// Market Context Types
export type {
  EventContext,
  FeedPostContext,
  GroupChatContext,
  MarketSnapshots,
  NewsArticleContext,
  NPCMarketContext,
  NPCPosition,
  PerpMarketSnapshot,
  PredictionMarketSnapshot,
  RelationshipContext,
} from './types/market-context';
// Market Decision Types
export type {
  ExecutedTrade,
  MarketAction,
  MarketType,
  TradeImpact,
  TradingDecision,
  TradingExecutionResult,
} from './types/market-decisions';
// Shared Game Types
export type {
  Actor,
  ActorConnection,
  ActorData,
  ActorRelationship,
  ActorState,
  ActorsDatabase,
  ActorTier,
  DayTimeline,
  FeedEvent,
  FeedPost,
  GameHistory,
  GameResolution,
  GameSetup,
  GameState,
  GeneratedGame,
  GenesisGame,
  GroupChat,
  GroupChatMessage,
  LuckChange,
  MoodChange,
  Organization,
  OrgType,
  PostType,
  PriceUpdate,
  Question,
  QuestionOutcome,
  RelationshipType,
  Scenario,
  SelectedActor,
  StockPrice,
  WorldContext,
  WorldEvent,
} from './types/shared';
export {
  ACTOR_TIERS,
  DAY_RANGES,
  getEscalationLevel,
  ORG_TYPES,
  POST_TYPES,
  RELATIONSHIP_TYPES,
} from './types/shared';
// Utils - Prompt Logging
export {
  isPromptLoggingEnabled,
  logPrompt,
  type PromptLogEntry,
} from './utils/prompt-logger';
// Utils - Randomization
export {
  pickRandom,
  randomChance,
  randomInt,
  sampleRandom,
  shuffleArray,
} from './utils/randomization';
// World Facts Service
export {
  type WorldFactsContext,
  WorldFactsService,
  worldFactsService,
} from './world-facts-service';
