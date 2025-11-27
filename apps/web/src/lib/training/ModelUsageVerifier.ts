/**
 * Model Usage Verifier
 *
 * Verifies that agents are using trained W&B models instead of base models.
 * Provides assertions and logging for model usage verification.
 */

import type { IAgentRuntime } from '@elizaos/core';
import {
  count,
  db,
  eq,
  gte,
  inArray,
  llmCallLogs,
  trajectories,
  users,
} from '@/db';
import { logger } from '@/lib/logger';
import { getLatestRLModel } from './WandbModelFetcher';

export interface ModelUsageStats {
  agentId: string;
  modelUsed: string;
  modelSource: 'wandb' | 'groq' | 'unknown';
  modelVersion?: string;
  isTrainedModel: boolean;
  inferenceCount: number;
}

export interface VerificationResult {
  success: boolean;
  agentsChecked: number;
  agentsUsingTrainedModel: number;
  agentsUsingBaseModel: number;
  details: ModelUsageStats[];
  errors: string[];
}

export class ModelUsageVerifier {
  /**
   * Verify that an agent runtime is using trained model
   *
   * Checks the agent's runtime configuration to determine which model
   * is being used and whether it's a trained W&B model or base model.
   *
   * @param agentUserId - Unique identifier for the agent
   * @param runtime - Agent runtime to verify
   * @returns ModelUsageStats with model information and inference count
   *
   * @remarks
   * - Checks WANDB_ENABLED and WANDB_MODEL settings
   * - Falls back to Groq model if W&B not enabled
   * - Counts inferences from last 24 hours
   */
  static async verifyAgentModelUsage(
    agentUserId: string,
    runtime: IAgentRuntime
  ): Promise<ModelUsageStats> {
    const wandbEnabled = runtime.character?.settings?.WANDB_ENABLED === 'true';
    const wandbModel = String(runtime.character?.settings?.WANDB_MODEL || '');
    const groqModel = String(
      runtime.character?.settings?.LARGE_GROQ_MODEL ||
        runtime.character?.settings?.SMALL_GROQ_MODEL ||
        ''
    );

    let modelUsed: string;
    let modelSource: 'wandb' | 'groq' | 'unknown';
    let modelVersion: string | undefined;
    let isTrainedModel = false;

    if (wandbEnabled && wandbModel) {
      modelUsed = wandbModel;
      modelSource = 'wandb';

      // Check if this is a trained model (not base)
      const latestModel = await getLatestRLModel();
      if (latestModel && latestModel.modelPath === wandbModel) {
        isTrainedModel = true;
        modelVersion = latestModel.version;
      } else {
        // Using W&B but not the trained model (could be base W&B model)
        isTrainedModel = false;
      }
    } else if (groqModel) {
      modelUsed = groqModel;
      modelSource = 'groq';
      isTrainedModel = false; // Groq models are base models
    } else {
      modelUsed = 'unknown';
      modelSource = 'unknown';
      isTrainedModel = false;
    }

    // Count inferences from logs (using trajectoryId or other fields)
    // Note: LLMCallLog may not have agentId field directly
    const agentTrajectories = await db
      .select({ trajectoryId: trajectories.trajectoryId })
      .from(trajectories)
      .where(eq(trajectories.agentId, agentUserId));

    const trajectoryIds = agentTrajectories.map((t) => t.trajectoryId);

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    let inferenceCount = 0;
    if (trajectoryIds.length > 0) {
      const inferenceCountResult = await db
        .select({ count: count() })
        .from(llmCallLogs)
        .where(
          and(
            gte(llmCallLogs.createdAt, twentyFourHoursAgo),
            inArray(llmCallLogs.trajectoryId, trajectoryIds)
          )
        );
      inferenceCount = inferenceCountResult[0]?.count || 0;
    }

    return {
      agentId: agentUserId,
      modelUsed,
      modelSource,
      modelVersion,
      isTrainedModel,
      inferenceCount,
    };
  }

  /**
   * Verify multiple agents
   */
  static async verifyMultipleAgents(
    agentUserIds: string[],
    runtimes: Map<string, IAgentRuntime>
  ): Promise<VerificationResult> {
    const details: ModelUsageStats[] = [];
    const errors: string[] = [];

    for (const agentId of agentUserIds) {
      const runtime = runtimes.get(agentId);
      if (!runtime) {
        errors.push(`Runtime not found for agent ${agentId}`);
        continue;
      }

      const stats = await this.verifyAgentModelUsage(agentId, runtime);
      details.push(stats);
    }

    const agentsUsingTrainedModel = details.filter(
      (d) => d.isTrainedModel
    ).length;
    const agentsUsingBaseModel = details.filter(
      (d) => !d.isTrainedModel
    ).length;

    return {
      success: agentsUsingTrainedModel > 0,
      agentsChecked: details.length,
      agentsUsingTrainedModel,
      agentsUsingBaseModel,
      details,
      errors,
    };
  }

  /**
   * Assert that agents are using trained model
   */
  static async assertTrainedModelUsage(
    agentUserId: string,
    runtime: IAgentRuntime
  ): Promise<void> {
    const stats = await this.verifyAgentModelUsage(agentUserId, runtime);

    if (!stats.isTrainedModel) {
      throw new Error(
        `Agent ${agentUserId} is not using trained model. ` +
          `Using: ${stats.modelUsed} (source: ${stats.modelSource})`
      );
    }

    logger.info(
      'Model usage assertion passed',
      {
        agentId: agentUserId,
        model: stats.modelUsed,
        version: stats.modelVersion,
      },
      'ModelUsageVerifier'
    );
  }

  /**
   * Get model usage summary
   */
  static async getModelUsageSummary(): Promise<{
    totalAgents: number;
    usingTrainedModel: number;
    usingBaseModel: number;
    latestModelVersion?: string;
  }> {
    const agents = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.isAgent, true));

    const latestModel = await getLatestRLModel();

    // Count agents using trained model (simplified check)
    // In production, you'd check each agent's runtime settings
    // For now, return summary
    return {
      totalAgents: agents.length,
      usingTrainedModel: 0, // Would need to check each agent's runtime
      usingBaseModel: agents.length,
      latestModelVersion: latestModel?.version,
    };
  }
}

// Need to import and for the query
import { and } from 'drizzle-orm';
