/**
 * Training Module Exports
 *
 * RL model configuration utilities.
 */

export {
  getRLModelConfig,
  isRLModelAvailable,
  logRLModelConfig,
  type RLModelConfig,
} from './RLModelConfig';

// WandbModelFetcher exports moved to @babylon/training package
// Import from there if needed:
// import { getLatestRLModel, ... } from '@babylon/training';
