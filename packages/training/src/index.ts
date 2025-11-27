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

// Dependencies configuration
export {
  configureTrainingDependencies,
  configureAutonomousCoordinator,
  getAgentRuntimeManager,
  getLLMCaller,
  getExportGroupedForGRPO,
  getExportToHuggingFace,
  getToARTMessages,
  createAutonomousCoordinator,
  areDependenciesConfigured,
} from './dependencies';

export type {
  IAgentRuntimeManager,
  ILLMCaller,
  IAutonomousCoordinator,
  ExportGroupedForGRPOFn,
  ExportToHuggingFaceFn,
  ToARTMessagesFn,
  CreateAutonomousCoordinatorFn,
  TrajectoryForART,
  TrajectoryStepForART,
  ARTMessage,
} from './dependencies';

// Utilities
export { logger } from './utils/logger';
export { generateSnowflakeId } from './utils/snowflake';

// Re-export all sub-modules
export * from './benchmark';
export * from './huggingface';
export * from './training';


