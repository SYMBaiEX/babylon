/**
 * Babylon Training Package
 *
 * A comprehensive training pipeline for RL agents including:
 * - Benchmarking and evaluation
 * - Training automation
 * - HuggingFace integration
 * - Multi-criteria archetype evaluation
 *
 * @packageDocumentation
 */

// Archetypes
export {
  type ArchetypeActionWeights,
  type ArchetypeConfig,
  ArchetypeConfigService,
  type ArchetypeTraits,
  archetypeConfigService,
} from './archetypes/ArchetypeConfigService';
// Re-export all sub-modules
export * from './benchmark';
export type {
  CreateAgentParams,
  CreateAutonomousCoordinatorFn,
  ExportGroupedForGRPOFn,
  ExportToHuggingFaceFn,
  IAgentRuntimeManager,
  IAgentService,
  IAutonomousCoordinator,
  ILLMCaller,
  ToTrainingMessagesFn,
  TrainingMessage,
  TrajectoryForTraining,
  TrajectoryStepForTraining,
} from './dependencies';
// Dependencies configuration
export {
  areAgentDependenciesConfigured,
  areDependenciesConfigured,
  configureAutonomousCoordinator,
  configureTrainingDependencies,
  createAutonomousCoordinator,
  getAgentRuntimeManager,
  getAgentService,
  getAutonomousCoordinator,
  getExportGroupedForGRPO,
  getExportToHuggingFace,
  getLLMCaller,
  getToTrainingMessages,
} from './dependencies';
// Generation
export {
  createParallelGenerator,
  type ParallelGenerationConfig,
  type ParallelGenerationResult,
  ParallelTrajectoryGenerator,
} from './generation/ParallelTrajectoryGenerator';
export * from './huggingface';
// Training initialization
export {
  initializeTrainingPackage,
  isTrainingInitialized,
  resetTrainingInitialization,
} from './init-training';
export {
  TrajectoryMetricsExtractor,
  trajectoryMetricsExtractor,
} from './metrics/TrajectoryMetricsExtractor';
// Multi-criteria evaluation - export metrics types and extractor explicitly
export type {
  BehavioralMetrics,
  BehaviorMetrics,
  InfluenceMetrics,
  InformationMetrics,
  MetricsSummary,
  SocialMetrics,
  TradingMetrics,
} from './metrics/types';
export { getMetricsSummary } from './metrics/types';
export * from './rubrics';
export * from './scoring';
export * from './training';
// Utilities
export { logger } from './utils/logger';
export { generateSnowflakeId } from './utils/snowflake';
export {
  assertRealTrajectory,
  filterSyntheticTrajectories,
  isSyntheticAgentId,
  isSyntheticScenarioId,
  isSyntheticTrajectory,
} from './utils/synthetic-detector';
