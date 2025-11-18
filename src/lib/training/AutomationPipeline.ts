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

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { exportGroupedForGRPO } from '../agents/plugins/plugin-trajectory-logger/src/export';
import { modelSelectionService } from './ModelSelectionService';
import { benchmarkService } from './BenchmarkService';
import path from 'node:path';
import fs from 'node:fs/promises';
import type {
  AutomationConfig,
  TrainingReadinessResult,
  TrainingTriggerOptions,
  TrainingTriggerResult,
  TrainingMonitoringStatus,
  AutomationStatus,
  TrajectoryStep,
} from './types';

export type { AutomationConfig };

export class AutomationPipeline {
  private config: AutomationConfig;
  private currentTrainingJob: string | null = null;

  constructor(config: Partial<AutomationConfig> = {}) {
    const envMinTrajectories = parseInt(process.env.TRAINING_MIN_TRAJECTORIES ?? '', 10);
    const envMinGroupSize = parseInt(process.env.TRAINING_MIN_GROUP_SIZE ?? '', 10);

    this.config = {
      minTrajectoriesForTraining: config.minTrajectoriesForTraining
        ?? (Number.isFinite(envMinTrajectories) && envMinTrajectories > 0 ? envMinTrajectories : 1),  // Default to 1 trajectory minimum (for testing - can be overridden via env)
      minGroupSize: config.minGroupSize
        ?? (Number.isFinite(envMinGroupSize) && envMinGroupSize > 0 ? envMinGroupSize : 1),  // Keep at 1 for flexibility
      dataQualityThreshold: config.dataQualityThreshold ?? 0.95,
      autoTriggerTraining: config.autoTriggerTraining !== false,
      trainingInterval: config.trainingInterval || 24, // Daily by default
      baseModel: config.baseModel || 'OpenPipe/Qwen3-14B-Instruct',  // ONLY model available in W&B ART (32K context)
      modelNamePrefix: config.modelNamePrefix || 'babylon-agent',
      modelStoragePath: config.modelStoragePath || path.resolve(process.cwd(), 'storage/models'),
      dataStoragePath: config.dataStoragePath || path.resolve(process.cwd(), 'storage/training-data'),
      wandbProject: config.wandbProject || process.env.WANDB_PROJECT,
      wandbApiKey: config.wandbApiKey || process.env.WANDB_API_KEY
    };
  }

  /**
   * Check if we're ready to train
   */
  async checkTrainingReadiness(): Promise<TrainingReadinessResult> {
    // Count SCORED trajectories ready for training
    const scoredAndReady = await prisma.trajectory.count({
      where: {
        isTrainingData: true,
        usedInTraining: false,
        aiJudgeReward: { not: null },  // Must be SCORED
        NOT: {
          OR: [
            { stepsJson: 'null' },
            { stepsJson: '[]' }
          ]
        }
      }
    });

    // Also count unscored for reporting
    const unscored = await prisma.trajectory.count({
      where: {
        isTrainingData: true,
        usedInTraining: false,
        aiJudgeReward: null
      }
    });

    // Get scenario groups
    const scenarios = await prisma.trajectory.groupBy({
      by: ['scenarioId'],
      where: {
        isTrainingData: true,
        usedInTraining: false,
        scenarioId: { not: null }  // Only include trajectories with scenario IDs
      },
      _count: true
    });

    const validGroups = scenarios.filter((s: { _count: number }) => s._count >= this.config.minGroupSize);

    // Calculate data quality
    const quality = await this.calculateDataQuality();

    const stats = {
      totalTrajectories: scoredAndReady,  // Use scored trajectory count
      unscoredTrajectories: unscored,  // Actual unscored count
      scenarioGroups: validGroups.length,
      dataQuality: quality
    };

    // Check if ready using SCORED trajectories
    if (scoredAndReady < this.config.minTrajectoriesForTraining) {
      return {
        ready: false,
        reason: `Need ${this.config.minTrajectoriesForTraining - scoredAndReady} more trajectories`,
        stats
      };
    }

    // Check minimum scenario groups for diversity
    if (validGroups.length < 10) {
      return {
        ready: false,
        reason: `Need more scenario groups (${validGroups.length}/10 minimum)`,
        stats
      };
    }

    // Check data quality threshold
    if (quality < this.config.dataQualityThreshold) {
      return {
        ready: false,
        reason: `Data quality too low (${(quality * 100).toFixed(1)}% < ${this.config.dataQualityThreshold * 100}%)`,
        stats
      };
    }

    return {
      ready: true,
      reason: 'Ready to train!',
      stats
    };
  }

  /**
   * Calculate data quality score
   */
  private async calculateDataQuality(): Promise<number> {
    const sample = await prisma.trajectory.findMany({
      where: {
        isTrainingData: true,
        usedInTraining: false
      },
      take: 50,
      orderBy: { createdAt: 'desc' }
    });

    if (sample.length === 0) return 0;

    let qualityScore = 0;
    let totalChecks = 0;

    for (const traj of sample) {
      // Validate stepsJson exists and is valid before parsing
      if (!traj.stepsJson || traj.stepsJson === 'null' || traj.stepsJson === '[]') {
        continue; // Skip invalid trajectories
      }

      let steps: TrajectoryStep[];
      try {
        steps = JSON.parse(traj.stepsJson) as TrajectoryStep[];
      } catch (error) {
        logger.warn('Failed to parse trajectory stepsJson in quality check', {
          trajectoryId: traj.trajectoryId,
          error: error instanceof Error ? error.message : String(error)
        }, 'AutomationPipeline');
        continue; // Skip corrupted trajectories
      }

      if (!Array.isArray(steps)) {
        continue; // Skip if not an array
      }
      
      // Check 1: Has steps
      totalChecks++;
      if (steps.length > 0) qualityScore++;

      // Check 2: Steps have LLM calls
      totalChecks++;
      const hasLLMCalls = steps.every((s) => s.llmCalls && Array.isArray(s.llmCalls) && s.llmCalls.length > 0);
      if (hasLLMCalls) qualityScore++;

      // Check 3: LLM calls have substantial prompts
      totalChecks++;
      const hasGoodPrompts = steps.every((s) => 
        Array.isArray(s.llmCalls) && s.llmCalls.every((llm) => 
          llm.systemPrompt && llm.systemPrompt.length > 50 &&
          llm.userPrompt && llm.userPrompt.length > 100
        )
      );
      if (hasGoodPrompts) qualityScore++;

      // Check 4: Has provider accesses
      totalChecks++;
      const hasProviders = steps.some((s) => s.providerAccesses && Array.isArray(s.providerAccesses) && s.providerAccesses.length > 0);
      if (hasProviders) qualityScore++;

      // Check 5: Actions have results
      totalChecks++;
      const hasResults = steps.every((s) => s.action && (s.action.result || s.action.error));
      if (hasResults) qualityScore++;
    }

    return qualityScore / totalChecks;
  }

  /**
   * Trigger training job
   */
  async triggerTraining(options: TrainingTriggerOptions = {}): Promise<TrainingTriggerResult> {
    // Check readiness
    const readiness = await this.checkTrainingReadiness();
    
    // If forcing, allow training even with 0 trajectories (for testing wandb integration)
    if (!readiness.ready && !options.force) {
      return {
        success: false,
        error: readiness.reason
      };
    }

    // If forcing but no trajectories at all, try to score some first
    if (options.force && readiness.stats.totalTrajectories === 0 && readiness.stats.unscoredTrajectories > 0) {
      logger.info('Force mode: Attempting to score unscored trajectories first', {
        unscored: readiness.stats.unscoredTrajectories
      }, 'AutomationPipeline');
      
      try {
        const { rulerScoringService } = await import('./RulerScoringService');
        // Score recent trajectories
        const recentWindows = await prisma.trajectory.findMany({
          where: {
            isTrainingData: true,
            usedInTraining: false,
            aiJudgeReward: null,
            windowId: { not: null }
          },
          select: { windowId: true },
          distinct: ['windowId'],
          take: 5,
          orderBy: { createdAt: 'desc' }
        });

        for (const window of recentWindows) {
          if (window.windowId) {
            await rulerScoringService.scoreWindow(window.windowId);
          }
        }
        
        // Re-check readiness after scoring
        const newReadiness = await this.checkTrainingReadiness();
        logger.info('After scoring', {
          scored: newReadiness.stats.totalTrajectories,
          stillUnscored: newReadiness.stats.unscoredTrajectories
        }, 'AutomationPipeline');
      } catch (error) {
        logger.warn('Failed to score trajectories in force mode', {
          error: error instanceof Error ? error.message : String(error)
        }, 'AutomationPipeline');
        // Continue anyway - Python trainer can work with unscored data using local scoring
      }
    }

    // Use ModelSelectionService for smart model selection
    const modelSelection = await modelSelectionService.selectBaseModel();
    
    logger.info('Model selection for training', {
      strategy: modelSelection.strategy,
      modelPath: modelSelection.modelPath,
      bundleCount: modelSelection.metadata?.bundleCount
    });

    // Get data limit based on bundle count
    const dataLimit = await modelSelectionService.getTrainingDataLimit();
    
    // Prepare data
    logger.info('Preparing training data...', {
      ...readiness.stats,
      selectedModel: modelSelection.modelPath,
      strategy: modelSelection.strategy,
      dataLimit
    });
    
    const batchId = `batch-${Date.now()}`;
    // Use standardized window ID format (YYYY-MM-DDTHH:00)
    const { getCurrentWindowId } = await import('./window-utils');
    const windowId = getCurrentWindowId();

    // Export trajectories with data limit
    const maxTrajectories = dataLimit || options.batchSize || readiness.stats.totalTrajectories;
    
    const exportResult = await exportGroupedForGRPO({
      datasetName: `${this.config.modelNamePrefix}-${batchId}`,
      maxTrajectories,
      includeJudged: false // Will score with RULER
    });

    if (!exportResult.success) {
      return {
        success: false,
        error: 'Export failed: ' + exportResult.error
      };
    }

    // Create training batch record
    const nextVersion = await this.getNextModelVersion();
    
    const batch = await prisma.trainingBatch.create({
      data: {
        id: batchId,
        batchId,
        scenarioId: windowId,
        baseModel: modelSelection.modelPath,  // FIX: Use selected model, not config
        modelVersion: nextVersion,
        trajectoryIds: JSON.stringify(await this.getTrajectoryIds(maxTrajectories)),
        rewardsJson: JSON.stringify([]),
        status: 'pending',
        createdAt: new Date()
      }
    });

    // Update batch status to 'pending' (will be updated to 'training' by Python script)
    await prisma.trainingBatch.update({
      where: { batchId },
      data: { status: 'pending' }
    });

    // Trigger Python training script
    const pythonScript = path.resolve(process.cwd(), 'python/src/training/babylon_trainer.py');
    const spawn = await import('child_process');
    
    // Set environment variables for Python script
    // If WANDB_API_KEY is set, will use remote training; otherwise falls back to local
    const env = {
      ...process.env,
      MODE: 'single',
      BATCH_ID: batchId,
      MODEL_VERSION: nextVersion,
      WINDOW_ID: windowId,
      BASE_MODEL: modelSelection.modelPath,  // Use selected model from ModelSelectionService
      MAX_EXAMPLES: dataLimit ? dataLimit.toString() : '2000',  // CRITICAL: Hard limit to prevent 200GB usage
      WANDB_PROJECT: this.config.wandbProject || 'babylon-training',
      DATABASE_URL: process.env.DATABASE_URL || '',
      // Training logic:
      // - If WANDB_API_KEY is set: Use remote training (preferred)
      // - If WANDB_API_KEY is NOT set: Check TRAIN_RL_LOCAL (with resource checks)
      // - Large models require FORCE_LOCAL_TRAINING=true if training locally
      TRAIN_RL_LOCAL: process.env.TRAIN_RL_LOCAL || 'false',
      WANDB_API_KEY: process.env.WANDB_API_KEY || '',  // Explicitly pass W&B key
      FORCE_LOCAL_TRAINING: process.env.FORCE_LOCAL_TRAINING || 'false',  // Allow forcing local training for large models
      // Allow forcing training with minimal data for testing
      FORCE_TRAINING: options.force ? 'true' : 'false',
      MIN_AGENTS_PER_WINDOW: '1'  // Lower minimum for testing
    };
    
    if (process.env.WANDB_API_KEY) {
      logger.info('WANDB_API_KEY set - training will use W&B remote backend', undefined, 'AutomationPipeline');
    } else {
      const trainLocal = process.env.TRAIN_RL_LOCAL === 'true';
      const forceLocal = process.env.FORCE_LOCAL_TRAINING === 'true';
      if (trainLocal || forceLocal) {
        logger.warn('WANDB_API_KEY not set - training will fall back to local GPU/CPU (with resource checks)', undefined, 'AutomationPipeline');
      } else {
        logger.warn('WANDB_API_KEY not set - training will use W&B remote backend (requires WANDB_API_KEY)', undefined, 'AutomationPipeline');
      }
    }
    
    // Use python3 if available, fallback to python
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    
    const trainingProcess = spawn.spawn(pythonCmd, [pythonScript], {
      detached: false, // Keep attached to see output
      stdio: ['ignore', 'pipe', 'pipe'], // Capture stdout/stderr for debugging
      env
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
      prisma.trainingBatch.update({
        where: { batchId },
        data: { 
          status: 'failed',
          error: `Process spawn failed: ${error.message}`
        }
      }).catch((err) => logger.error('Failed to update batch status', { error: err }));
    });

    trainingProcess.unref();

    this.currentTrainingJob = batch.id;

    logger.info('Training job triggered', {
      batchId: batch.id,
      version: nextVersion,
      trajectories: exportResult.trajectoriesExported
    });

    return {
      success: true,
      jobId: batch.id
    };
  }

  /**
   * Get next model version
   */
  private async getNextModelVersion(): Promise<string> {
    const latestModel = await prisma.trainedModel.findFirst({
      orderBy: { createdAt: 'desc' }
    });

    if (!latestModel) {
      return 'v1.0.0';
    }

    // Increment patch version
    const [major, minor, patch] = latestModel.version.substring(1).split('.').map(Number);
    return `v${major}.${minor}.${patch! + 1}`;
  }

  /**
   * Get trajectory IDs for training
   */
  private async getTrajectoryIds(limit?: number): Promise<string[]> {
    const trajectories = await prisma.trajectory.findMany({
      where: {
        isTrainingData: true,
        usedInTraining: false
      },
      select: { trajectoryId: true },
      take: limit,
      orderBy: { createdAt: 'asc' }
    });

    return trajectories.map((t: { trajectoryId: string }) => t.trajectoryId);
  }

  /**
   * Monitor training job
   */
  async monitorTraining(batchId: string): Promise<TrainingMonitoringStatus> {
    const batch = await prisma.trainingBatch.findUnique({
      where: { batchId }
    });

    if (!batch) {
      return { status: 'not_found' };
    }

    // Check if Python process is still running
    // In production, this would check actual training status from W&B or logs
    
    return {
      status: batch.status,
      progress: batch.status === 'training' ? 0.5 : batch.status === 'completed' ? 1.0 : 0,
      eta: batch.status === 'training' ? 1800000 : undefined, // 30 min estimate
      error: batch.error || undefined
    };
  }

  /**
   * Clean up export files to prevent disk space accumulation
   * CRITICAL: Export files can accumulate to 200GB+ if not cleaned up
   */
  private async cleanupExportFiles(batchId: string): Promise<void> {
    try {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      
      // Clean up GRPO export directory
      const exportDir = path.resolve(process.cwd(), 'exports', 'grpo-groups');
      try {
        const files = await fs.readdir(exportDir);
        for (const file of files) {
          const filePath = path.join(exportDir, file);
          await fs.unlink(filePath);
        }
        logger.info('Cleaned up export files', { batchId, filesRemoved: files.length }, 'AutomationPipeline');
      } catch (error) {
        // Directory might not exist, that's okay
        if ((error as { code?: string })?.code !== 'ENOENT') {
          logger.warn('Failed to clean up export files', { error: error instanceof Error ? error.message : String(error) }, 'AutomationPipeline');
        }
      }
    } catch (error) {
      logger.warn('Export cleanup failed', { error: error instanceof Error ? error.message : String(error) }, 'AutomationPipeline');
      // Don't throw - cleanup failures shouldn't break the pipeline
    }
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
        logger.error('Training job failed', { batchId: this.currentTrainingJob });
        // Clean up export files even on failure
        await this.cleanupExportFiles(this.currentTrainingJob).catch(() => {
          // Ignore cleanup errors
        });
        this.currentTrainingJob = null;
      }
      return;
    }

    // Check for newly completed batches (Python script may have completed)
    // Check last 24 hours to catch long-running training jobs
    const newlyCompleted = await prisma.trainingBatch.findFirst({
      where: {
        status: 'completed',
        completedAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      },
      orderBy: { completedAt: 'desc' }
    });

    // Check if this batch has already been deployed
    if (newlyCompleted) {
      const existingModel = await prisma.trainedModel.findFirst({
        where: {
          trainingBatch: newlyCompleted.batchId,
          status: 'deployed'
        }
      });

      if (existingModel) {
        return; // Skip if already deployed
      }
      
      logger.info('Found newly completed training batch', { batchId: newlyCompleted.batchId });
      await this.deployModel(newlyCompleted.batchId);
    }

    // Check if we should trigger training
    const readiness = await this.checkTrainingReadiness();
    
    if (readiness.ready && this.config.autoTriggerTraining) {
      // Check if enough time has passed since last training
      const lastTraining = await prisma.trainingBatch.findFirst({
        where: { status: 'completed' },
        orderBy: { completedAt: 'desc' }
      });

      const hoursSinceLastTraining = lastTraining
        ? (Date.now() - lastTraining.completedAt!.getTime()) / (1000 * 60 * 60)
        : 999;

      if (hoursSinceLastTraining >= this.config.trainingInterval) {
        logger.info('Triggering automatic training', readiness.stats);
        await this.triggerTraining();
      }
    }

    // Track market outcomes for recent windows (prerequisite for reward backpropagation)
    try {
      const { MarketOutcomesTracker } = await import('./MarketOutcomesTracker');
      const outcomesTracker = new MarketOutcomesTracker();
      const synced = await outcomesTracker.syncRecentWindows(24); // Sync last 24 hours
      if (synced > 0) {
        logger.info('Synced market outcomes for windows', { windowsSynced: synced });
      }
    } catch (error) {
      logger.warn('Market outcomes tracking failed', { error: error instanceof Error ? error.message : String(error) });
    }

    // Update rewards for windows with known outcomes (reward backpropagation)
    try {
      const { rewardBackpropagationService } = await import('./RewardBackpropagationService');
      const processed = await rewardBackpropagationService.processPendingWindows();
      if (processed > 0) {
        logger.info('Updated rewards for trajectories', { windowsProcessed: processed });
      }
    } catch (error) {
      logger.warn('Reward backpropagation failed', { error: error instanceof Error ? error.message : String(error) });
    }

    // Score trajectories using RULER framework
    try {
      const { rulerScoringService } = await import('./RulerScoringService');
      // Score trajectories from recent windows (last 24 hours)
      
      // Score current window and previous windows
      for (let hoursAgo = 0; hoursAgo < 24; hoursAgo++) {
        const windowDate = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
        const windowId = windowDate.toISOString().slice(0, 13) + ':00';
        
        try {
          const scored = await rulerScoringService.scoreWindow(windowId);
          if (scored > 0) {
            logger.info('Scored trajectories with RULER', { windowId, scored });
          }
        } catch (error) {
          logger.warn('RULER scoring failed for window', { 
            windowId, 
            error: error instanceof Error ? error.message : String(error) 
          });
        }
      }
    } catch (error) {
      logger.warn('RULER scoring failed', { error: error instanceof Error ? error.message : String(error) });
    }

    // Health checks
    await this.runHealthChecks();
  }

  /**
   * Deploy trained model
   * Note: Model is already created by Python script, this just marks trajectories as used
   */
  private async deployModel(batchId: string): Promise<void> {
    const batch = await prisma.trainingBatch.findUnique({
      where: { batchId }
    });

    if (!batch) {
      logger.warn('Batch not found for deployment', { batchId });
      return;
    }

    // Check if model was created by Python script
    const model = await prisma.trainedModel.findFirst({
      where: {
        trainingBatch: batch.id,
        status: 'ready'
      }
    });

    if (!model) {
      logger.warn('Model not found for batch', { batchId });
      return;
    }

    logger.info('Deploying model', {
      version: batch.modelVersion,
      modelId: model.modelId,
      batchId
    });

    // Mark trajectories as used
    // Parse trajectory IDs with error handling
    let trajectoryIds: string[];
    try {
      if (!batch.trajectoryIds || batch.trajectoryIds === 'null' || batch.trajectoryIds === '[]') {
        logger.warn('Training batch has invalid trajectoryIds', { batchId: batch.id });
        trajectoryIds = [];
      } else {
        trajectoryIds = JSON.parse(batch.trajectoryIds) as string[];
        if (!Array.isArray(trajectoryIds)) {
          logger.warn('Training batch trajectoryIds is not an array', { batchId: batch.id });
          trajectoryIds = [];
        }
      }
    } catch (error) {
      logger.error('Failed to parse training batch trajectoryIds', {
        batchId: batch.id,
        error: error instanceof Error ? error.message : String(error)
      }, 'AutomationPipeline');
      trajectoryIds = [];
    }
    await prisma.trajectory.updateMany({
      where: {
        trajectoryId: { in: trajectoryIds }
      },
      data: {
        usedInTraining: true,
        trainedInBatch: batch.id
      }
    });

    // Update model status to deployed
    await prisma.trainedModel.update({
      where: { modelId: model.modelId },
      data: {
        status: 'deployed',
        deployedAt: new Date()
      }
    });

    logger.info('Model deployed', { 
      version: batch.modelVersion,
      modelId: model.modelId
    });
  }

  /**
   * Benchmark and conditionally deploy trained model
   * Only deploys if performance meets threshold
   */
  async benchmarkAndDeploy(batchId: string, autoDeploy = true): Promise<{
    benchmarked: boolean;
    deployed: boolean;
    reason?: string;
  }> {
    const batch = await prisma.trainingBatch.findUnique({
      where: { batchId }
    });

    if (!batch) {
      return { benchmarked: false, deployed: false, reason: 'Batch not found' };
    }

    // Get model
    const model = await prisma.trainedModel.findFirst({
      where: {
        trainingBatch: batch.id,
        status: 'ready'
      }
    });

    if (!model) {
      return { benchmarked: false, deployed: false, reason: 'Model not found' };
    }

    try {
      // Benchmark the model
      logger.info('Benchmarking model...', { modelId: model.modelId }, 'AutomationPipeline');
      const benchmarkResults = await benchmarkService.benchmarkModel(model.modelId);
      
      // Compare with previous models
      const comparison = await benchmarkService.compareModels(model.modelId);
      
      logger.info('Benchmark complete', {
        modelId: model.modelId,
        score: benchmarkResults.benchmarkScore,
        shouldDeploy: comparison.shouldDeploy,
        reason: comparison.reason
      }, 'AutomationPipeline');

      // Deploy if performance is good enough (and autoDeploy is enabled)
      if (comparison.shouldDeploy && autoDeploy) {
        await this.deployModel(batchId);
        return { 
          benchmarked: true, 
          deployed: true, 
          reason: comparison.reason 
        };
      }

      return {
        benchmarked: true,
        deployed: false,
        reason: comparison.reason || 'Performance below threshold'
      };

    } catch (error) {
      logger.error('Benchmarking failed - model NOT deployed', { error, modelId: model.modelId }, 'AutomationPipeline');
      
      // SAFETY: Do NOT deploy on benchmark failure
      // Better to skip deployment than deploy a potentially bad model
      // Admins can manually deploy via dashboard if needed
      return {
        benchmarked: false,
        deployed: false,
        reason: `Benchmark failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Get model selection info for next training
   */
  async getModelSelectionInfo() {
    try {
      const selection = await modelSelectionService.selectBaseModel();
      const summary = await modelSelectionService.getSelectionSummary();
      
      return {
        success: true,
        selection,
        summary
      };
    } catch (error) {
      logger.error('Model selection failed', error, 'AutomationPipeline');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Selection failed'
      };
    }
  }

  /**
   * Run health checks
   */
  private async runHealthChecks(): Promise<void> {
    // Check database connectivity
    await prisma.user.count().catch((error: Error) => {
      logger.error('Database health check failed', error);
    });

    // Check data collection rate
    const last1h = await prisma.trajectory.count({
      where: {
        startTime: {
          gte: new Date(Date.now() - 60 * 60 * 1000)
        }
      }
    });

    if (last1h < 1) {
      logger.warn('Low data collection rate', { trajectoriesLastHour: last1h });
    }

    // Check disk space for model storage
    await fs.mkdir(this.config.modelStoragePath, { recursive: true }).catch((error: Error) => {
      logger.error('Storage health check failed', error);
    });
    await fs.mkdir(this.config.dataStoragePath, { recursive: true }).catch((error: Error) => {
      logger.error('Storage health check failed', error);
    });
  }

  /**
   * Get automation status
   */
  async getStatus(): Promise<AutomationStatus> {
    // Data collection stats
    const last24h = await prisma.trajectory.count({
      where: {
        startTime: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }
    });

    const last7d = await prisma.trajectory.count({
      where: {
        startTime: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      }
    });

    // Training stats
    const lastCompleted = await prisma.trainingBatch.findFirst({
      where: { status: 'completed' },
      orderBy: { completedAt: 'desc' }
    });

    // Model stats
    const latestModel = await prisma.trainedModel.findFirst({
      orderBy: { createdAt: 'desc' }
    });

    const deployedCount = await prisma.trainedModel.count({
      where: { status: 'deployed' }
    });

    const trainingCount = await prisma.trainingBatch.count({
      where: { status: 'training' }
    });

    // Health checks
    const dbHealthy = await prisma.user.count().then(() => true).catch(() => false);
    const storageHealthy = await fs.access(this.config.modelStoragePath).then(() => true).catch(() => false);
    const wandbHealthy = !!this.config.wandbApiKey;

    return {
      dataCollection: {
        last24h,
        last7d,
        ratePerHour: last24h / 24
      },
      training: {
        currentJob: this.currentTrainingJob,
        lastCompleted: lastCompleted?.completedAt || null,
        nextScheduled: lastCompleted
          ? new Date(lastCompleted.completedAt!.getTime() + this.config.trainingInterval * 60 * 60 * 1000)
          : null
      },
      models: {
        latest: latestModel?.version || null,
        deployed: deployedCount,
        training: trainingCount
      },
      health: {
        database: dbHealthy,
        storage: storageHealthy,
        wandb: wandbHealthy
      }
    };
  }
}

// Singleton
export const automationPipeline = new AutomationPipeline();

