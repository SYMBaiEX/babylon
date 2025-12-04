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

// Re-export all sub-modules
export * from './benchmark';

export type {
  CreateAutonomousCoordinatorFn,
  ExportGroupedForGRPOFn,
  ExportToHuggingFaceFn,
  IAgentRuntimeManager,
  IAutonomousCoordinator,
  ILLMCaller,
  ToTrainingMessagesFn,
  TrainingMessage,
  TrajectoryForTraining,
  TrajectoryStepForTraining,
} from './dependencies';
// Dependencies configuration
export {
  areDependenciesConfigured,
  configureAutonomousCoordinator,
  configureTrainingDependencies,
  createAutonomousCoordinator,
  getAgentRuntimeManager,
  getExportGroupedForGRPO,
  getExportToHuggingFace,
  getLLMCaller,
  getToTrainingMessages,
} from './dependencies';
export * from './huggingface';
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
