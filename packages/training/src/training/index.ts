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
export {
  ModelSelectionService,
  modelSelectionService,
} from './ModelSelectionService';
export { ModelUsageVerifier } from './ModelUsageVerifier';
export {
  RewardBackpropagationService,
  rewardBackpropagationService,
} from './RewardBackpropagationService';
export {
  isRLModelAvailable,
  logRLModelConfig,
  getRLModelConfig,
  getModelTierForVram,
  getModelForTier,
  getAvailableModelTiers,
  isTierAvailable,
  // Archetype model management
  registerArchetypeModel,
  getModelForArchetype,
  getAllArchetypeModels,
  hasArchetypeModel,
  clearArchetypeModels,
  MODEL_TIERS,
} from './RLModelConfig';
export type {
  ModelTier,
  ModelTierConfig,
  RLModelConfig,
  ArchetypeModelConfig,
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

// Model fetching
export { getLatestRLModel } from './ModelFetcher';
export type { ModelArtifact } from './ModelFetcher';

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
