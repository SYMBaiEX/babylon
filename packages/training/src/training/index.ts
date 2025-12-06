/**
 * Training Module
 *
 * Core training pipeline services for RL model development.
 */

export type { AutomationConfig } from './AutomationPipeline';
export { AutomationPipeline, automationPipeline } from './AutomationPipeline';
export type { BenchmarkResults, ComparisonResults } from './BenchmarkService';
export { BenchmarkService, benchmarkService } from './BenchmarkService';

export { ConfigValidator } from './ConfigValidator';
export { initializeTrainingSystem } from './init';
export { MarketOutcomesTracker } from './MarketOutcomesTracker';
export type { DeploymentOptions, DeploymentResult } from './ModelDeployer';
export { ModelDeployer, modelDeployer } from './ModelDeployer';
export type { ModelArtifact } from './ModelFetcher';
// Model fetching
export { getLatestRLModel } from './ModelFetcher';
export {
  ModelSelectionService,
  modelSelectionService,
} from './ModelSelectionService';
export { ModelUsageVerifier } from './ModelUsageVerifier';
export {
  RewardBackpropagationService,
  rewardBackpropagationService,
} from './RewardBackpropagationService';
export type {
  ArchetypeModelConfig,
  ModelTier,
  ModelTierConfig,
  RLModelConfig,
} from './RLModelConfig';
export {
  clearArchetypeModels,
  getAllArchetypeModels,
  getAvailableModelTiers,
  getModelForArchetype,
  getModelForTier,
  getModelTierForVram,
  getRLModelConfig,
  hasArchetypeModel,
  isRLModelAvailable,
  isTierAvailable,
  logRLModelConfig,
  MODEL_TIERS,
  // Archetype model management
  registerArchetypeModel,
} from './RLModelConfig';
export type { MarketOutcomes, RulerScore } from './RulerScoringService';
export {
  RulerScoringService,
  rulerScoringService,
} from './RulerScoringService';
// Storage services
export {
  ModelStorageService,
  modelStorage,
} from './storage/ModelStorageService';
export {
  TrainingDataArchiver,
  trainingDataArchiver,
} from './storage/TrainingDataArchiver';
export { TrainingMonitor, trainingMonitor } from './TrainingMonitor';
export { TrajectoryRecorder, trajectoryRecorder } from './TrajectoryRecorder';

// Types
export * from './types';

// Window utilities
export {
  generateWindowIds,
  getCurrentWindowId,
  getPreviousWindowId,
  getWindowIdForTimestamp,
  getWindowRange,
  isTimestampInWindow,
  isWindowComplete,
  parseWindowId,
} from './window-utils';
