/**
 * Training Automation Pipeline
 *
 * Fully automated RL training pipeline:
 * 1. Monitor data collection
 * 2. Trigger training when ready
 * 3. Score with RULER
 * 4. Export data
 * 5. Train model
 * 6. Deploy new version
 * 7. Monitor performance
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import {
  and,
  count,
  db,
  desc,
  eq,
  gte,
  isNotNull,
  isNull,
  not,
  trainedModels,
  trainingBatches,
  trajectories,
  users,
} from '@babylon/db';
import { getExportGroupedForGRPO } from '../dependencies';
import { logger } from '../utils/logger';
import { benchmarkService } from './BenchmarkService';
import { modelSelectionService } from './ModelSelectionService';
import type {
  AutomationConfig,
  AutomationStatus,
  TrainingMonitoringStatus,
  TrainingReadinessResult,
  TrainingTriggerOptions,
  TrainingTriggerResult,
  TrajectoryStep,
} from './types';

export type { AutomationConfig };

export class AutomationPipeline {
  private config: AutomationConfig;
  private currentTrainingJob: string | null = null;

  constructor(config: Partial<AutomationConfig> = {}) {
    const envMinTrajectories = parseInt(
      process.env.TRAINING_MIN_TRAJECTORIES ?? '',
      10
    );
    const envMinGroupSize = parseInt(
      process.env.TRAINING_MIN_GROUP_SIZE ?? '',
      10
    );

    this.config = {
      minTrajectoriesForTraining:
        config.minTrajectoriesForTraining ??
        (Number.isFinite(envMinTrajectories) && envMinTrajectories > 0
          ? envMinTrajectories
          : 1), // Default to 1 trajectory minimum (for testing - can be overridden via env)
      minGroupSize:
        config.minGroupSize ??
        (Number.isFinite(envMinGroupSize) && envMinGroupSize > 0
          ? envMinGroupSize
          : 1), // Keep at 1 for flexibility
      dataQualityThreshold: config.dataQualityThreshold ?? 0.95,
      autoTriggerTraining: config.autoTriggerTraining !== false,
      trainingInterval: config.trainingInterval || 24, // Daily by default
      baseModel: config.baseModel || 'OpenPipe/Qwen3-14B-Instruct', // ONLY model available in W&B ART (32K context)
      modelNamePrefix: config.modelNamePrefix || 'babylon-agent',
      modelStoragePath:
        config.modelStoragePath ||
        path.resolve(process.cwd(), 'storage/models'),
      dataStoragePath:
        config.dataStoragePath ||
        path.resolve(process.cwd(), 'storage/training-data'),
      wandbProject: config.wandbProject || process.env.WANDB_PROJECT,
      wandbApiKey: config.wandbApiKey || process.env.WANDB_API_KEY,
    };
  }

  /**
   * Check if we're ready to train
   */
  async checkTrainingReadiness(): Promise<TrainingReadinessResult> {
    // Count SCORED trajectories ready for training
    const scoredAndReadyResult = await db
      .select({ count: count() })
      .from(trajectories)
      .where(
        and(
          eq(trajectories.isTrainingData, true),
          eq(trajectories.usedInTraining, false),
          isNotNull(trajectories.aiJudgeReward),
          not(eq(trajectories.stepsJson, 'null')),
          not(eq(trajectories.stepsJson, '[]'))
        )
      );
    const scoredAndReady = scoredAndReadyResult[0]?.count || 0;

    // Also count unscored for reporting
    const unscoredResult = await db
      .select({ count: count() })
      .from(trajectories)
      .where(
        and(
          eq(trajectories.isTrainingData, true),
          eq(trajectories.usedInTraining, false),
          isNull(trajectories.aiJudgeReward)
        )
      );
    const unscored = unscoredResult[0]?.count || 0;

    // Get scenario groups
    const scenariosResult = await db
      .select({
        scenarioId: trajectories.scenarioId,
        count: count(),
      })
      .from(trajectories)
      .where(
        and(
          eq(trajectories.isTrainingData, true),
          eq(trajectories.usedInTraining, false),
          isNotNull(trajectories.scenarioId)
        )
      )
      .groupBy(trajectories.scenarioId);

    const validGroups = scenariosResult.filter(
      (s: { scenarioId: string | null; count: number }) =>
        s.count >= this.config.minGroupSize
    );

    // Calculate data quality
    const quality = await this.calculateDataQuality();

    const stats = {
      totalTrajectories: scoredAndReady, // Use scored trajectory count
      unscoredTrajectories: unscored, // Actual unscored count
      scenarioGroups: validGroups.length,
      dataQuality: quality,
    };

    // Check if ready using SCORED trajectories
    if (scoredAndReady < this.config.minTrajectoriesForTraining) {
      return {
        ready: false,
        reason: `Need ${this.config.minTrajectoriesForTraining - scoredAndReady} more trajectories`,
        stats,
      };
    }

    // Check minimum scenario groups for diversity
    if (validGroups.length < 10) {
      return {
        ready: false,
        reason: `Need more scenario groups (${validGroups.length}/10 minimum)`,
        stats,
      };
    }

    // Check data quality threshold
    if (quality < this.config.dataQualityThreshold) {
      return {
        ready: false,
        reason: `Data quality too low (${(quality * 100).toFixed(1)}% < ${this.config.dataQualityThreshold * 100}%)`,
        stats,
      };
    }

    return {
      ready: true,
      reason: 'Ready to train!',
      stats,
    };
  }

  /**
   * Calculate data quality score
   */
  private async calculateDataQuality(): Promise<number> {
    const sample = await db
      .select()
      .from(trajectories)
      .where(
        and(
          eq(trajectories.isTrainingData, true),
          eq(trajectories.usedInTraining, false)
        )
      )
      .orderBy(desc(trajectories.createdAt))
      .limit(50);

    if (sample.length === 0) return 0;

    let qualityScore = 0;
    let totalChecks = 0;

    for (const traj of sample) {
      // Validate stepsJson exists and is valid before parsing
      if (
        !traj.stepsJson ||
        traj.stepsJson === 'null' ||
        traj.stepsJson === '[]'
      ) {
        continue; // Skip invalid trajectories
      }

      const steps: TrajectoryStep[] = JSON.parse(
        traj.stepsJson
      ) as TrajectoryStep[];

      if (!Array.isArray(steps)) {
        continue; // Skip if not an array
      }

      // Check 1: Has steps
      totalChecks++;
      if (steps.length > 0) qualityScore++;

      // Check 2: Steps have LLM calls
      totalChecks++;
      const hasLLMCalls = steps.every(
        (s) => s.llmCalls && Array.isArray(s.llmCalls) && s.llmCalls.length > 0
      );
      if (hasLLMCalls) qualityScore++;

      // Check 3: LLM calls have substantial prompts
      totalChecks++;
      const hasGoodPrompts = steps.every(
        (s) =>
          Array.isArray(s.llmCalls) &&
          s.llmCalls.every(
            (llm) =>
              llm.systemPrompt &&
              llm.systemPrompt.length > 50 &&
              llm.userPrompt &&
              llm.userPrompt.length > 100
          )
      );
      if (hasGoodPrompts) qualityScore++;

      // Check 4: Has provider accesses
      totalChecks++;
      const hasProviders = steps.some(
        (s) =>
          s.providerAccesses &&
          Array.isArray(s.providerAccesses) &&
          s.providerAccesses.length > 0
      );
      if (hasProviders) qualityScore++;

      // Check 5: Actions have results
      totalChecks++;
      const hasResults = steps.every(
        (s) => s.action && (s.action.result || s.action.error)
      );
      if (hasResults) qualityScore++;
    }

    return qualityScore / totalChecks;
  }

  /**
   * Trigger training job
   */
  async triggerTraining(
    options: TrainingTriggerOptions = {}
  ): Promise<TrainingTriggerResult> {
    // Check readiness
    const readiness = await this.checkTrainingReadiness();

    // If forcing, allow training even with 0 trajectories (for testing wandb integration)
    if (!readiness.ready && !options.force) {
      return {
        success: false,
        error: readiness.reason,
      };
    }

    // If forcing but no trajectories at all, try to score some first
    if (
      options.force &&
      readiness.stats.totalTrajectories === 0 &&
      readiness.stats.unscoredTrajectories > 0
    ) {
      logger.info(
        'Force mode: Attempting to score unscored trajectories first',
        {
          unscored: readiness.stats.unscoredTrajectories,
        },
        'AutomationPipeline'
      );

      const { rulerScoringService } = await import('./RulerScoringService');
      // Score recent trajectories
      const recentWindows = await db
        .selectDistinct({ windowId: trajectories.windowId })
        .from(trajectories)
        .where(
          and(
            eq(trajectories.isTrainingData, true),
            eq(trajectories.usedInTraining, false),
            isNull(trajectories.aiJudgeReward),
            isNotNull(trajectories.windowId)
          )
        )
        .orderBy(desc(trajectories.createdAt))
        .limit(5);

      for (const window of recentWindows) {
        if (window.windowId) {
          await rulerScoringService.scoreWindow(window.windowId);
        }
      }

      // Re-check readiness after scoring
      const newReadiness = await this.checkTrainingReadiness();
      logger.info(
        'After scoring',
        {
          scored: newReadiness.stats.totalTrajectories,
          stillUnscored: newReadiness.stats.unscoredTrajectories,
        },
        'AutomationPipeline'
      );
    }

    // Use ModelSelectionService for smart model selection
    const modelSelection = await modelSelectionService.selectBaseModel();

    logger.info('Model selection for training', {
      strategy: modelSelection.strategy,
      modelPath: modelSelection.modelPath,
      bundleCount: modelSelection.metadata?.bundleCount,
    });

    // Get data limit based on bundle count
    const dataLimit = await modelSelectionService.getTrainingDataLimit();

    // Prepare data
    logger.info('Preparing training data...', {
      ...readiness.stats,
      selectedModel: modelSelection.modelPath,
      strategy: modelSelection.strategy,
      dataLimit,
    });

    const batchId = `batch-${Date.now()}`;
    // Use standardized window ID format (YYYY-MM-DDTHH:00)
    const { getCurrentWindowId } = await import('./window-utils');
    const windowId = getCurrentWindowId();

    // Export trajectories with data limit
    const maxTrajectories =
      dataLimit || options.batchSize || readiness.stats.totalTrajectories;

    const exportGroupedForGRPO = getExportGroupedForGRPO();
    const exportResult = await exportGroupedForGRPO({
      outputPath: `${this.config.dataStoragePath}/${batchId}`,
      minTrajectoriesPerGroup: this.config.minGroupSize,
      maxGroupSize: maxTrajectories,
    });

    if (!exportResult.success) {
      return {
        success: false,
        error: 'Export failed: ' + exportResult.error,
      };
    }

    // Create training batch record
    const nextVersion = await this.getNextModelVersion();

    const batchResult = await db
      .insert(trainingBatches)
      .values({
        id: batchId,
        batchId,
        scenarioId: windowId,
        baseModel: modelSelection.modelPath, // FIX: Use selected model, not config
        modelVersion: nextVersion,
        trajectoryIds: JSON.stringify(
          await this.getTrajectoryIds(maxTrajectories)
        ),
        rewardsJson: JSON.stringify([]),
        status: 'pending',
        createdAt: new Date(),
      })
      .returning();

    const batch = batchResult[0]!;

    // Trigger Python training script
    const pythonScript = path.resolve(
      process.cwd(),
      'python/src/training/babylon_trainer.py'
    );
    const spawn = await import('child_process');

    // Set environment variables for Python script
    // If WANDB_API_KEY is set, will use remote training; otherwise falls back to local
    const env = {
      ...process.env,
      MODE: 'single',
      BATCH_ID: batchId,
      MODEL_VERSION: nextVersion,
      WINDOW_ID: windowId,
      BASE_MODEL: modelSelection.modelPath, // Use selected model from ModelSelectionService
      MAX_EXAMPLES: dataLimit ? dataLimit.toString() : '2000', // CRITICAL: Hard limit to prevent 200GB usage
      WANDB_PROJECT: this.config.wandbProject || 'babylon-training',
      WANDB_ENTITY: process.env.WANDB_ENTITY || 'elizaos', // Default to personal account (has write access)
      DATABASE_URL: process.env.DATABASE_URL || '',
      // Training logic:
      // - If WANDB_API_KEY is set: Use remote training (preferred)
      // - If WANDB_API_KEY is NOT set: Check TRAIN_RL_LOCAL (with resource checks)
      // - Large models require FORCE_LOCAL_TRAINING=true if training locally
      TRAIN_RL_LOCAL: process.env.TRAIN_RL_LOCAL || 'false',
      WANDB_API_KEY: process.env.WANDB_API_KEY || '', // Explicitly pass W&B key
      FORCE_LOCAL_TRAINING: process.env.FORCE_LOCAL_TRAINING || 'false', // Allow forcing local training for large models
      // Allow forcing training with minimal data for testing
      FORCE_TRAINING: options.force ? 'true' : 'false',
      MIN_AGENTS_PER_WINDOW: '1', // Lower minimum for testing
    };

    if (process.env.WANDB_API_KEY) {
      logger.info(
        'WANDB_API_KEY set - training will use W&B remote backend',
        undefined,
        'AutomationPipeline'
      );
    } else {
      const trainLocal = process.env.TRAIN_RL_LOCAL === 'true';
      const forceLocal = process.env.FORCE_LOCAL_TRAINING === 'true';
      if (trainLocal || forceLocal) {
        logger.warn(
          'WANDB_API_KEY not set - training will fall back to local GPU/CPU (with resource checks)',
          undefined,
          'AutomationPipeline'
        );
      } else {
        logger.warn(
          'WANDB_API_KEY not set - training will use W&B remote backend (requires WANDB_API_KEY)',
          undefined,
          'AutomationPipeline'
        );
      }
    }

    // Use python3 if available, fallback to python
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

    const trainingProcess = spawn.spawn(pythonCmd, [pythonScript], {
      detached: false, // Keep attached to see output
      stdio: ['ignore', 'pipe', 'pipe'], // Capture stdout/stderr for debugging
      env,
    });

    // Log output for debugging
    trainingProcess.stdout?.on('data', (data: Buffer) => {
      logger.info('Training stdout', { output: data.toString().trim() });
    });

    trainingProcess.stderr?.on('data', (data: Buffer) => {
      logger.warn('Training stderr', { output: data.toString().trim() });
    });

    trainingProcess.on('error', (error: Error) => {
      logger.error('Training process error', { error: error.message });
      // Update batch status to failed
      db.update(trainingBatches)
        .set({
          status: 'failed',
          error: `Process spawn failed: ${error.message}`,
        })
        .where(eq(trainingBatches.batchId, batchId))
        .catch((err: unknown) =>
          logger.error('Failed to update batch status', { error: err })
        );
    });

    trainingProcess.unref();

    this.currentTrainingJob = batch.id;

    logger.info('Training job triggered', {
      batchId: batch.id,
      version: nextVersion,
      trajectories: exportResult.trajectoriesExported,
    });

    return {
      success: true,
      jobId: batch.id,
    };
  }

  /**
   * Get next model version
   */
  private async getNextModelVersion(): Promise<string> {
    const latestModelResult = await db
      .select()
      .from(trainedModels)
      .orderBy(desc(trainedModels.createdAt))
      .limit(1);

    const latestModel = latestModelResult[0];

    if (!latestModel) {
      return 'v1.0.0';
    }

    // Increment patch version
    const [major, minor, patch] = latestModel.version
      .substring(1)
      .split('.')
      .map(Number);
    return `v${major}.${minor}.${patch! + 1}`;
  }

  /**
   * Get trajectory IDs for training
   */
  private async getTrajectoryIds(limit?: number): Promise<string[]> {
    let query = db
      .select({ trajectoryId: trajectories.trajectoryId })
      .from(trajectories)
      .where(
        and(
          eq(trajectories.isTrainingData, true),
          eq(trajectories.usedInTraining, false)
        )
      )
      .orderBy(trajectories.createdAt);

    if (limit) {
      query = query.limit(limit) as typeof query;
    }

    const result = await query;

    return result.map((t: { trajectoryId: string }) => t.trajectoryId);
  }

  /**
   * Monitor training job
   */
  async monitorTraining(batchId: string): Promise<TrainingMonitoringStatus> {
    const batchResult = await db
      .select()
      .from(trainingBatches)
      .where(eq(trainingBatches.batchId, batchId))
      .limit(1);

    const batch = batchResult[0];

    if (!batch) {
      return { status: 'not_found' };
    }

    // Check if Python process is still running
    // In production, this would check actual training status from W&B or logs

    return {
      status: batch.status,
      progress:
        batch.status === 'training'
          ? 0.5
          : batch.status === 'completed'
            ? 1.0
            : 0,
      eta: batch.status === 'training' ? 1800000 : undefined, // 30 min estimate
      error: batch.error || undefined,
    };
  }

  /**
   * Clean up export files to prevent disk space accumulation
   * CRITICAL: Export files can accumulate to 200GB+ if not cleaned up
   */
  private async cleanupExportFiles(batchId: string): Promise<void> {
    const pathModule = await import('node:path');

    // Clean up GRPO export directory
    const exportDir = pathModule.resolve(
      process.cwd(),
      'exports',
      'grpo-groups'
    );
    const files = await fs.readdir(exportDir);
    for (const file of files) {
      const filePath = pathModule.join(exportDir, file);
      await fs.unlink(filePath);
    }
    logger.info(
      'Cleaned up export files',
      { batchId, filesRemoved: files.length },
      'AutomationPipeline'
    );
  }

  /**
   * Automation loop (called by cron)
   */
  async runAutomationCycle(): Promise<void> {
    logger.info('Running automation cycle');

    // Check if training is already running
    if (this.currentTrainingJob) {
      const status = await this.monitorTraining(this.currentTrainingJob);
      if (status.status === 'completed') {
        // Deploy model (Python script already created model record)
        await this.deployModel(this.currentTrainingJob);
        // CRITICAL: Clean up export files to prevent disk space accumulation
        await this.cleanupExportFiles(this.currentTrainingJob);
        this.currentTrainingJob = null;
      } else if (status.status === 'failed') {
        logger.error('Training job failed', {
          batchId: this.currentTrainingJob,
        });
        // Clean up export files even on failure
        await this.cleanupExportFiles(this.currentTrainingJob);
        this.currentTrainingJob = null;
      }
      return;
    }

    // Check for newly completed batches (Python script may have completed)
    // Check last 24 hours to catch long-running training jobs
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const newlyCompletedResult = await db
      .select()
      .from(trainingBatches)
      .where(
        and(
          eq(trainingBatches.status, 'completed'),
          gte(trainingBatches.completedAt, twentyFourHoursAgo)
        )
      )
      .orderBy(desc(trainingBatches.completedAt))
      .limit(1);

    const newlyCompleted = newlyCompletedResult[0];

    // Check if this batch has already been deployed
    if (newlyCompleted) {
      const existingModelResult = await db
        .select()
        .from(trainedModels)
        .where(
          and(
            eq(trainedModels.trainingBatch, newlyCompleted.batchId),
            eq(trainedModels.status, 'deployed')
          )
        )
        .limit(1);

      if (existingModelResult.length > 0) {
        return; // Skip if already deployed
      }

      logger.info('Found newly completed training batch', {
        batchId: newlyCompleted.batchId,
      });
      await this.deployModel(newlyCompleted.batchId);
    }

    // Check if we should trigger training
    const readiness = await this.checkTrainingReadiness();

    if (readiness.ready && this.config.autoTriggerTraining) {
      // Check if enough time has passed since last training
      const lastTrainingResult = await db
        .select()
        .from(trainingBatches)
        .where(eq(trainingBatches.status, 'completed'))
        .orderBy(desc(trainingBatches.completedAt))
        .limit(1);

      const lastTraining = lastTrainingResult[0];

      const hoursSinceLastTraining = lastTraining
        ? (Date.now() - lastTraining.completedAt!.getTime()) / (1000 * 60 * 60)
        : 999;

      if (hoursSinceLastTraining >= this.config.trainingInterval) {
        logger.info('Triggering automatic training', readiness.stats);
        await this.triggerTraining();
      }
    }

    // Track market outcomes for recent windows (prerequisite for reward backpropagation)
    const { MarketOutcomesTracker } = await import('./MarketOutcomesTracker');
    const outcomesTracker = new MarketOutcomesTracker();
    const synced = await outcomesTracker.syncRecentWindows(24); // Sync last 24 hours
    if (synced > 0) {
      logger.info('Synced market outcomes for windows', {
        windowsSynced: synced,
      });
    }

    // Update rewards for windows with known outcomes (reward backpropagation)
    const { rewardBackpropagationService } = await import(
      './RewardBackpropagationService'
    );
    const processed =
      await rewardBackpropagationService.processPendingWindows();
    if (processed > 0) {
      logger.info('Updated rewards for trajectories', {
        windowsProcessed: processed,
      });
    }

    // Score trajectories using RULER framework
    const { rulerScoringService } = await import('./RulerScoringService');
    // Score trajectories from recent windows (last 24 hours)

    // Score current window and previous windows
    for (let hoursAgo = 0; hoursAgo < 24; hoursAgo++) {
      const windowDate = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
      const windowIdStr = windowDate.toISOString().slice(0, 13) + ':00';

      const scored = await rulerScoringService.scoreWindow(windowIdStr);
      if (scored > 0) {
        logger.info('Scored trajectories with RULER', {
          windowId: windowIdStr,
          scored,
        });
      }
    }

    // Health checks
    await this.runHealthChecks();
  }

  /**
   * Deploy trained model
   * Note: Model is already created by Python script, this just marks trajectories as used
   */
  private async deployModel(batchId: string): Promise<void> {
    const batchResult = await db
      .select()
      .from(trainingBatches)
      .where(eq(trainingBatches.batchId, batchId))
      .limit(1);

    const batch = batchResult[0];

    if (!batch) {
      logger.warn('Batch not found for deployment', { batchId });
      return;
    }

    // Check if model was created by Python script
    const modelResult = await db
      .select()
      .from(trainedModels)
      .where(
        and(
          eq(trainedModels.trainingBatch, batch.id),
          eq(trainedModels.status, 'ready')
        )
      )
      .limit(1);

    const model = modelResult[0];

    if (!model) {
      logger.warn('Model not found for batch', { batchId });
      return;
    }

    logger.info('Deploying model', {
      version: batch.modelVersion,
      modelId: model.modelId,
      batchId,
    });

    // Mark trajectories as used
    // Parse trajectory IDs
    let trajectoryIds: string[];
    if (
      !batch.trajectoryIds ||
      batch.trajectoryIds === 'null' ||
      batch.trajectoryIds === '[]'
    ) {
      logger.warn('Training batch has invalid trajectoryIds', {
        batchId: batch.id,
      });
      trajectoryIds = [];
    } else {
      trajectoryIds = JSON.parse(batch.trajectoryIds) as string[];
      if (!Array.isArray(trajectoryIds)) {
        logger.warn('Training batch trajectoryIds is not an array', {
          batchId: batch.id,
        });
        trajectoryIds = [];
      }
    }

    if (trajectoryIds.length > 0) {
      const { inArray } = await import('drizzle-orm');
      await db
        .update(trajectories)
        .set({
          usedInTraining: true,
          trainedInBatch: batch.id,
        })
        .where(inArray(trajectories.trajectoryId, trajectoryIds));
    }

    // Update model status to deployed
    await db
      .update(trainedModels)
      .set({
        status: 'deployed',
        deployedAt: new Date(),
      })
      .where(eq(trainedModels.modelId, model.modelId));

    logger.info('Model deployed', {
      version: batch.modelVersion,
      modelId: model.modelId,
    });
  }

  /**
   * Benchmark and conditionally deploy trained model
   * Only deploys if performance meets threshold
   */
  async benchmarkAndDeploy(
    batchId: string,
    autoDeploy = true
  ): Promise<{
    benchmarked: boolean;
    deployed: boolean;
    reason?: string;
  }> {
    const batchResult = await db
      .select()
      .from(trainingBatches)
      .where(eq(trainingBatches.batchId, batchId))
      .limit(1);

    const batch = batchResult[0];

    if (!batch) {
      return { benchmarked: false, deployed: false, reason: 'Batch not found' };
    }

    // Get model
    const modelResult = await db
      .select()
      .from(trainedModels)
      .where(
        and(
          eq(trainedModels.trainingBatch, batch.id),
          eq(trainedModels.status, 'ready')
        )
      )
      .limit(1);

    const model = modelResult[0];

    if (!model) {
      return { benchmarked: false, deployed: false, reason: 'Model not found' };
    }

    // Benchmark the model
    logger.info(
      'Benchmarking model...',
      { modelId: model.modelId },
      'AutomationPipeline'
    );
    const benchmarkResults = await benchmarkService.benchmarkModel(
      model.modelId
    );

    // Compare with previous models
    const comparison = await benchmarkService.compareModels(model.modelId);

    logger.info(
      'Benchmark complete',
      {
        modelId: model.modelId,
        score: benchmarkResults.benchmarkScore,
        shouldDeploy: comparison.shouldDeploy,
        reason: comparison.reason,
      },
      'AutomationPipeline'
    );

    // Deploy if performance is good enough (and autoDeploy is enabled)
    if (comparison.shouldDeploy && autoDeploy) {
      await this.deployModel(batchId);
      return {
        benchmarked: true,
        deployed: true,
        reason: comparison.reason,
      };
    }

    return {
      benchmarked: true,
      deployed: false,
      reason: comparison.reason || 'Performance below threshold',
    };
  }

  /**
   * Get model selection info for next training
   */
  async getModelSelectionInfo() {
    const selection = await modelSelectionService.selectBaseModel();
    const summary = await modelSelectionService.getSelectionSummary();

    return {
      success: true,
      selection,
      summary,
    };
  }

  /**
   * Run health checks
   */
  private async runHealthChecks(): Promise<void> {
    try {
      // Check database connectivity
      await db.select({ count: count() }).from(users);

      // Check data collection rate
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const last1hResult = await db
        .select({ count: count() })
        .from(trajectories)
        .where(gte(trajectories.startTime, oneHourAgo));

      const last1h = last1hResult[0]?.count || 0;

      if (last1h < 1) {
        logger.warn('Low data collection rate', {
          trajectoriesLastHour: last1h,
        });
      }

      // Check disk space for model storage
      await fs.mkdir(this.config.modelStoragePath, { recursive: true });
      await fs.mkdir(this.config.dataStoragePath, { recursive: true });
    } catch (error) {
      logger.error('Health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get automation status
   */
  async getStatus(): Promise<AutomationStatus> {
    // Data collection stats
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const last24hResult = await db
      .select({ count: count() })
      .from(trajectories)
      .where(gte(trajectories.startTime, twentyFourHoursAgo));
    const last24h = last24hResult[0]?.count || 0;

    const last7dResult = await db
      .select({ count: count() })
      .from(trajectories)
      .where(gte(trajectories.startTime, sevenDaysAgo));
    const last7d = last7dResult[0]?.count || 0;

    // Training stats
    const lastCompletedResult = await db
      .select()
      .from(trainingBatches)
      .where(eq(trainingBatches.status, 'completed'))
      .orderBy(desc(trainingBatches.completedAt))
      .limit(1);
    const lastCompleted = lastCompletedResult[0];

    // Model stats
    const latestModelResult = await db
      .select()
      .from(trainedModels)
      .orderBy(desc(trainedModels.createdAt))
      .limit(1);
    const latestModel = latestModelResult[0];

    const deployedCountResult = await db
      .select({ count: count() })
      .from(trainedModels)
      .where(eq(trainedModels.status, 'deployed'));
    const deployedCount = deployedCountResult[0]?.count || 0;

    const trainingCountResult = await db
      .select({ count: count() })
      .from(trainingBatches)
      .where(eq(trainingBatches.status, 'training'));
    const trainingCount = trainingCountResult[0]?.count || 0;

    // Health checks
    let dbHealthy = false;
    try {
      await db.select({ count: count() }).from(users);
      dbHealthy = true;
    } catch {
      dbHealthy = false;
    }

    let storageHealthy = false;
    try {
      await fs.access(this.config.modelStoragePath);
      storageHealthy = true;
    } catch {
      storageHealthy = false;
    }

    const wandbHealthy = !!this.config.wandbApiKey;

    return {
      dataCollection: {
        last24h,
        last7d,
        ratePerHour: last24h / 24,
      },
      training: {
        currentJob: this.currentTrainingJob,
        lastCompleted: lastCompleted?.completedAt || null,
        nextScheduled: lastCompleted
          ? new Date(
              lastCompleted.completedAt!.getTime() +
                this.config.trainingInterval * 60 * 60 * 1000
            )
          : null,
      },
      models: {
        latest: latestModel?.version || null,
        deployed: deployedCount,
        training: trainingCount,
      },
      health: {
        database: dbHealthy,
        storage: storageHealthy,
        wandb: wandbHealthy,
      },
    };
  }
}

// Singleton
export const automationPipeline = new AutomationPipeline();
