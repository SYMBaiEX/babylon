/**
 * W&B Model Fetcher
 *
 * Fetches trained RL models from the database for inference.
 */

import { db, desc, inArray, trainedModels } from '@babylon/db';
import { logger } from '../utils/logger';

export interface ModelArtifact {
  version: string;
  modelId: string; // WANDB model identifier (entity/project/model-name format)
  modelPath: string;
  metadata: {
    avgReward?: number;
    benchmarkScore?: number;
    baseModel: string;
    trainedAt: Date;
  };
}

/**
 * Get the latest RL model from database
 */
export async function getLatestRLModel(): Promise<ModelArtifact | null> {
  const modelResult = await db
    .select()
    .from(trainedModels)
    .where(inArray(trainedModels.status, ['ready', 'deployed']))
    .orderBy(desc(trainedModels.createdAt))
    .limit(1);

  const model = modelResult[0];

  if (!model) {
    return null;
  }

  // storagePath contains the WANDB model identifier (entity/project/model-name:step)
  const wandbModelId = model.storagePath || model.modelId;

  // Validate critical fields
  if (!wandbModelId || wandbModelId.trim().length === 0) {
    logger.error(
      'Model has no storagePath or modelId',
      {
        modelId: model.modelId,
        storagePath: model.storagePath,
      },
      'WandbModelFetcher'
    );
    return null;
  }

  if (!model.baseModel || model.baseModel.trim().length === 0) {
    logger.error(
      'Model has no baseModel',
      {
        modelId: model.modelId,
      },
      'WandbModelFetcher'
    );
    return null;
  }

  return {
    version: model.version,
    modelId: wandbModelId,
    modelPath: wandbModelId, // For WANDB inference, modelPath is the model identifier
    metadata: {
      avgReward: model.avgReward ?? undefined,
      benchmarkScore: model.benchmarkScore ?? undefined,
      baseModel: model.baseModel,
      trainedAt: model.createdAt,
    },
  };
}

