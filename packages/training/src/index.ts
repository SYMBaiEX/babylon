/**
 * Babylon Training Package
 *
 * A comprehensive training pipeline for RL agents including:
 * - Benchmarking and evaluation
 * - Training automation
 * - HuggingFace integration
 *
 * @packageDocumentation
 */

// Re-export all sub-modules
export * from './benchmark';

export type {
  ARTMessage,
  CreateAutonomousCoordinatorFn,
  ExportGroupedForGRPOFn,
  ExportToHuggingFaceFn,
  IAgentRuntimeManager,
  IAutonomousCoordinator,
  ILLMCaller,
  ToARTMessagesFn,
  TrajectoryForART,
  TrajectoryStepForART,
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
  getToARTMessages,
} from './dependencies';
export * from './huggingface';
export * from './training';
// Utilities
export { logger } from './utils/logger';
export { generateSnowflakeId } from './utils/snowflake';
