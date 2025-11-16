/**
 * HuggingFace Integration Service
 * 
 * Orchestrates the complete HuggingFace integration pipeline.
 * Main entry point for all HuggingFace operations.
 */

import { HuggingFaceDatasetUploader } from './HuggingFaceDatasetUploader';
import { HuggingFaceModelUploader } from './HuggingFaceModelUploader';
import { ModelBenchmarkService } from '@/lib/benchmark/ModelBenchmarkService';
import { exportToHuggingFace } from '@/lib/agents/plugins/plugin-trajectory-logger/src/export';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export interface WeeklyUploadResult {
  success: boolean;
  datasets: {
    benchmarks: { success: boolean; url?: string; error?: string };
    trajectories: { success: boolean; url?: string; error?: string };
  };
  models: {
    processed: number;
    benchmarked: number;
    uploaded: number;
  };
  errors: string[];
  duration: number;
}

export interface DatasetUploadOptions {
  datasetName?: string;
  trajectoryDatasetName?: string;
  modelNamePrefix?: string;
  dryRun?: boolean;
}

export class HuggingFaceIntegrationService {
  private datasetUploader: HuggingFaceDatasetUploader;
  private modelUploader: HuggingFaceModelUploader;

  constructor() {
    this.datasetUploader = new HuggingFaceDatasetUploader();
    this.modelUploader = new HuggingFaceModelUploader();
  }

  /**
   * Execute complete weekly upload pipeline
   */
  async executeWeeklyUpload(options: DatasetUploadOptions = {}): Promise<WeeklyUploadResult> {
    const startTime = Date.now();
    logger.info('Starting weekly upload pipeline', options, 'HuggingFaceIntegration');

    const result: WeeklyUploadResult = {
      success: false,
      datasets: {
        benchmarks: { success: false },
        trajectories: { success: false },
      },
      models: {
        processed: 0,
        benchmarked: 0,
        uploaded: 0,
      },
      errors: [],
      duration: 0,
    };

    try {
      // Step 1: Upload benchmark dataset
      if (!options.dryRun) {
        logger.info('Step 1: Uploading benchmark dataset', undefined, 'HuggingFaceIntegration');
        const benchmarkResult = await this.datasetUploader.uploadDataset({
          datasetName: options.datasetName || process.env.HF_DATASET_NAME || 'babylonlabs/agent-benchmarks',
          description: 'Weekly benchmark results for Babylon autonomous trading agents',
        });

        result.datasets.benchmarks = {
          success: benchmarkResult.success,
          url: benchmarkResult.datasetUrl,
          error: benchmarkResult.error,
        };

        if (!benchmarkResult.success) {
          result.errors.push(`Benchmark dataset upload: ${benchmarkResult.error}`);
        }
      } else {
        logger.info('DRY RUN: Skipping benchmark dataset upload', undefined, 'HuggingFaceIntegration');
        result.datasets.benchmarks.success = true;
      }

      // Step 2: Upload trajectory dataset
      if (!options.dryRun) {
        logger.info('Step 2: Uploading trajectory dataset', undefined, 'HuggingFaceIntegration');
        const trajectoryResult = await exportToHuggingFace({
          datasetName: options.trajectoryDatasetName || process.env.HF_TRAJECTORY_DATASET_NAME || 'babylonlabs/agent-trajectories',
          huggingFaceToken: process.env.HUGGING_FACE_TOKEN || process.env.HF_TOKEN,
          maxTrajectories: 10000,
          includeJudged: false,
          format: 'jsonl',
        });

        result.datasets.trajectories = {
          success: trajectoryResult.success,
          url: trajectoryResult.datasetUrl,
          error: trajectoryResult.error,
        };

        if (!trajectoryResult.success) {
          result.errors.push(`Trajectory dataset upload: ${trajectoryResult.error}`);
        }
      } else {
        logger.info('DRY RUN: Skipping trajectory dataset upload', undefined, 'HuggingFaceIntegration');
        result.datasets.trajectories.success = true;
      }

      // Step 3: Process models
      const unbenchmarkedModels = await ModelBenchmarkService.getUnbenchmarkedModels();
      result.models.processed = unbenchmarkedModels.length;

      logger.info(`Step 3: Found ${unbenchmarkedModels.length} unbenchmarked models`, undefined, 'HuggingFaceIntegration');

      if (unbenchmarkedModels.length > 0) {
        const standardBenchmarks = await ModelBenchmarkService.getStandardBenchmarkPaths();

        if (standardBenchmarks.length === 0) {
          const error = 'No standard benchmarks available for model evaluation';
          logger.error(error, undefined, 'HuggingFaceIntegration');
          result.errors.push(error);
        } else {
          for (const modelId of unbenchmarkedModels) {
            try {
              // Benchmark model
              logger.info(`Benchmarking model: ${modelId}`, undefined, 'HuggingFaceIntegration');
              await ModelBenchmarkService.benchmarkModel({
                modelId,
                benchmarkPaths: standardBenchmarks,
                saveResults: true,
              });
              result.models.benchmarked++;

              // Compare to baseline
              const comparison = await ModelBenchmarkService.compareToBaseline(modelId);

              // Upload if improved
              if (comparison.recommendation === 'deploy' && !options.dryRun) {
                logger.info(`Model ${modelId} improved, uploading`, undefined, 'HuggingFaceIntegration');

                const model = await prisma.trainedModel.findUnique({
                  where: { modelId },
                });

                if (model) {
                  const modelName = options.modelNamePrefix 
                    ? `${options.modelNamePrefix}-${model.version}`
                    : process.env.HF_MODEL_NAME 
                    ? `${process.env.HF_MODEL_NAME}-${model.version}`
                    : `babylonlabs/babylon-agent-${model.version}`;

                  const uploadResult = await this.modelUploader.uploadModel({
                    modelId,
                    modelName,
                    description: `Babylon autonomous trading agent - v${model.version}`,
                    includeWeights: true,
                  });

                  if (uploadResult.success) {
                    result.models.uploaded++;
                    
                    // Update model with HuggingFace repo
                    await prisma.trainedModel.update({
                      where: { modelId },
                      data: { huggingFaceRepo: modelName },
                    });
                  } else {
                    result.errors.push(`Model upload ${modelId}: ${uploadResult.error}`);
                  }
                }
              } else {
                logger.info(`Model ${modelId} not ready for deployment: ${comparison.recommendation}`, undefined, 'HuggingFaceIntegration');
              }
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              logger.error(`Failed to process model ${modelId}`, { error }, 'HuggingFaceIntegration');
              result.errors.push(`Model ${modelId}: ${errorMsg}`);
            }
          }
        }
      }

      result.success = result.errors.length === 0;
      result.duration = Date.now() - startTime;

      logger.info('Weekly upload pipeline complete', {
        success: result.success,
        benchmarkDataset: result.datasets.benchmarks.success,
        trajectoryDataset: result.datasets.trajectories.success,
        modelsProcessed: result.models.processed,
        modelsBenchmarked: result.models.benchmarked,
        modelsUploaded: result.models.uploaded,
        errors: result.errors.length,
        duration: result.duration,
      }, 'HuggingFaceIntegration');

      return result;
    } catch (error) {
      result.duration = Date.now() - startTime;
      result.errors.push(error instanceof Error ? error.message : String(error));
      logger.error('Weekly upload pipeline failed', { error }, 'HuggingFaceIntegration');
      return result;
    }
  }

  /**
   * Check if new data is available for upload
   */
  async hasNewDataToUpload(): Promise<{
    hasNewBenchmarks: boolean;
    hasNewTrajectories: boolean;
    hasUnbenchmarkedModels: boolean;
    details: {
      newBenchmarksSince?: Date;
      newTrajectoriesCount: number;
      unbenchmarkedModels: number;
    };
  }> {
    // Get last upload time from database (we could track this)
    const lastUpload = await prisma.trainedModel.findFirst({
      where: {
        huggingFaceRepo: { not: null },
      },
      orderBy: { deployedAt: 'desc' },
      select: { deployedAt: true },
    });

    const lastUploadTime = lastUpload?.deployedAt || new Date(0);

    // Check for new benchmarks (from benchmark_results table)
    const newBenchmarksCount = await prisma.benchmarkResult.count({
      where: {
        createdAt: { gte: lastUploadTime },
      },
    });

    // Check for new trajectories
    const newTrajectoriesCount = await prisma.trajectory.count({
      where: {
        createdAt: { gte: lastUploadTime },
        isTrainingData: true,
      },
    });

    // Check for unbenchmarked models
    const unbenchmarkedModels = await ModelBenchmarkService.getUnbenchmarkedModels();

    return {
      hasNewBenchmarks: newBenchmarksCount > 0,
      hasNewTrajectories: newTrajectoriesCount > 0,
      hasUnbenchmarkedModels: unbenchmarkedModels.length > 0,
      details: {
        newBenchmarksSince: lastUploadTime,
        newTrajectoriesCount,
        unbenchmarkedModels: unbenchmarkedModels.length,
      },
    };
  }

  /**
   * Validate system is ready for HuggingFace operations
   */
  async validateSystemReadiness(): Promise<{
    ready: boolean;
    issues: string[];
    warnings: string[];
  }> {
    const issues: string[] = [];
    const warnings: string[] = [];

    // Check HuggingFace token
    if (!process.env.HUGGING_FACE_TOKEN && !process.env.HF_TOKEN) {
      issues.push('HUGGING_FACE_TOKEN or HF_TOKEN environment variable not set');
    }

    // Check database connection
    try {
      await prisma.$connect();
    } catch {
      issues.push('Cannot connect to database');
    }

    // Check BenchmarkResult table exists
    try {
      await prisma.benchmarkResult.count();
    } catch {
      issues.push('BenchmarkResult table does not exist. Run: npx prisma migrate dev');
    }

    // Check for standard benchmarks
    const standardBenchmarks = await ModelBenchmarkService.getStandardBenchmarkPaths();
    if (standardBenchmarks.length === 0) {
      warnings.push('No standard benchmarks found. Run: npx ts-node scripts/generate-standard-benchmarks.ts');
    }

    // Check for benchmark data
    const benchmarkCount = await prisma.benchmarkResult.count();
    if (benchmarkCount === 0) {
      warnings.push('No benchmark results in database. Run some benchmarks first.');
    }

    // Check for trajectory data
    const trajectoryCount = await prisma.trajectory.count({
      where: { isTrainingData: true },
    });
    if (trajectoryCount === 0) {
      warnings.push('No training trajectories in database. Generate with agents or test data.');
    }

    // Check for trained models
    const modelCount = await prisma.trainedModel.count();
    if (modelCount === 0) {
      warnings.push('No trained models in database.');
    }

    return {
      ready: issues.length === 0,
      issues,
      warnings,
    };
  }

  /**
   * Get integration statistics
   */
  async getStatistics(): Promise<{
    benchmarks: { total: number; lastUpload?: Date };
    trajectories: { total: number; training: number };
    models: { total: number; benchmarked: number; deployed: number };
    huggingface: { datasetsPublished: number; modelsPublished: number };
  }> {
    const benchmarkCount = await prisma.benchmarkResult.count();
    const lastBenchmark = await prisma.benchmarkResult.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    const trajectoryTotal = await prisma.trajectory.count();
    const trajectoryTraining = await prisma.trajectory.count({
      where: { isTrainingData: true },
    });

    const modelTotal = await prisma.trainedModel.count();
    const modelBenchmarked = await prisma.trainedModel.count({
      where: { benchmarkScore: { not: null } },
    });
    const modelDeployed = await prisma.trainedModel.count({
      where: { huggingFaceRepo: { not: null } },
    });

    // Count unique HuggingFace repos
    const hfRepos = await prisma.trainedModel.findMany({
      where: { huggingFaceRepo: { not: null } },
      select: { huggingFaceRepo: true },
      distinct: ['huggingFaceRepo'],
    });

    return {
      benchmarks: {
        total: benchmarkCount,
        lastUpload: lastBenchmark?.createdAt,
      },
      trajectories: {
        total: trajectoryTotal,
        training: trajectoryTraining,
      },
      models: {
        total: modelTotal,
        benchmarked: modelBenchmarked,
        deployed: modelDeployed,
      },
      huggingface: {
        datasetsPublished: 2, // benchmarks + trajectories (hardcoded for now)
        modelsPublished: hfRepos.length,
      },
    };
  }
}

export const huggingFaceIntegration = new HuggingFaceIntegrationService();

