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

// Multi-criteria evaluation
export * from './metrics';
export * from './rubrics';
export * from './scoring';

// Utilities
export { logger } from './utils/logger';
export { generateSnowflakeId } from './utils/snowflake';
