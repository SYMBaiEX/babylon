/**
 * Training Module
 *
 * Core training pipeline services for RL model development.
 */

export { AutomationPipeline, automationPipeline } from './AutomationPipeline';
export type { AutomationConfig } from './AutomationPipeline';

export { BenchmarkService, benchmarkService } from './BenchmarkService';
export type { BenchmarkResults, ComparisonResults } from './BenchmarkService';

export { ConfigValidator } from './ConfigValidator';

export { MarketOutcomesTracker } from './MarketOutcomesTracker';

export { ModelDeployer, modelDeployer } from './ModelDeployer';
export type { DeploymentOptions, DeploymentResult } from './ModelDeployer';

export { ModelSelectionService, modelSelectionService } from './ModelSelectionService';

export { ModelUsageVerifier } from './ModelUsageVerifier';

export { RewardBackpropagationService, rewardBackpropagationService } from './RewardBackpropagationService';

export { isRLModelAvailable, logRLModelConfig } from './RLModelConfig';

export { RulerScoringService, rulerScoringService } from './RulerScoringService';
export type { RulerScore, MarketOutcomes } from './RulerScoringService';

export { TrainingMonitor, trainingMonitor } from './TrainingMonitor';

export { TrajectoryRecorder, trajectoryRecorder } from './TrajectoryRecorder';

export { getLatestRLModel } from './WandbModelFetcher';

export { initializeTrainingSystem } from './init';

// Window utilities
export {
  getCurrentWindowId,
  getPreviousWindowId,
  parseWindowId,
  isWindowComplete,
  getWindowRange,
  generateWindowIds,
  getWindowIdForTimestamp,
  isTimestampInWindow,
} from './window-utils';

// Types
export * from './types';

// Storage services
export { ModelStorageService, modelStorage } from './storage/ModelStorageService';
export { TrainingDataArchiver, trainingDataArchiver } from './storage/TrainingDataArchiver';

