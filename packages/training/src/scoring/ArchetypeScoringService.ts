/**
 * Archetype-Aware Scoring Service
 *
 * Scores trajectories using LLM-as-judge with archetype-specific rubrics and behavioral metrics.
 * This is the main entry point for multi-criteria evaluation.
 */

import {
  and,
  db,
  eq,
  inArray,
  isNull,
  not,
  trajectories,
  users,
} from '@babylon/db';
import { getLLMCaller } from '../dependencies';
import { logger } from '../utils/logger';
import { trajectoryMetricsExtractor, type TrajectoryMetrics } from '../metrics';
import { judgePromptBuilder, type TrajectoryContext } from './JudgePromptBuilder';
import { getRubric, hasCustomRubric } from '../rubrics';
import type { TrajectoryStep } from '../training/types';

export interface ArchetypeScore {
  trajectoryId: string;
  agentId: string;
  archetype: string;
  score: number;
  reasoning: string;
  strengths: string[];
  weaknesses: string[];
  metrics: TrajectoryMetrics;
  scoredAt: Date;
}

interface TrajectoryScoreResponse {
  score: number;
  reasoning: string;
  strengths?: string[];
  weaknesses?: string[];
}

interface RulerScoreResponse {
  scores: Array<{
    trajectory_id: string;
    explanation: string;
    score: number;
  }>;
}

export interface ScoringOptions {
  /** Override archetype (useful for testing) */
  archetype?: string;
  /** Include detailed action context in prompt */
  includeActionDetails?: boolean;
  /** Save scores to database */
  saveToDatabase?: boolean;
}

const DEFAULT_OPTIONS: ScoringOptions = {
  includeActionDetails: false,
  saveToDatabase: true,
};

export class ArchetypeScoringService {
  private readonly minGroupSize = 2;
  private readonly maxGroupSize = 8;

  /**
   * Score a single trajectory with archetype-aware evaluation
   */
  async scoreTrajectory(
    trajectoryId: string,
    options: ScoringOptions = {}
  ): Promise<ArchetypeScore | null> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Fetch trajectory data
    const trajResult = await db
      .select({
        trajectoryId: trajectories.trajectoryId,
        agentId: trajectories.agentId,
        stepsJson: trajectories.stepsJson,
        scenarioId: trajectories.scenarioId,
        finalPnL: trajectories.finalPnL,
        episodeLength: trajectories.episodeLength,
        totalReward: trajectories.totalReward,
      })
      .from(trajectories)
      .where(eq(trajectories.trajectoryId, trajectoryId))
      .limit(1);

    const traj = trajResult[0];
    if (!traj) {
      logger.warn('Trajectory not found', { trajectoryId }, 'ArchetypeScoring');
      return null;
    }

    // Get agent archetype
    const archetype = opts.archetype || (await this.getAgentArchetype(traj.agentId));

    if (!archetype) {
      logger.warn(
        'Could not determine archetype for agent',
        { agentId: traj.agentId, trajectoryId },
        'ArchetypeScoring'
      );
    }

    // Parse steps and extract metrics
    let steps: TrajectoryStep[];
    try {
      steps = JSON.parse(traj.stepsJson) as TrajectoryStep[];
    } catch (error) {
      logger.error(
        'Failed to parse trajectory steps',
        { trajectoryId, error: error instanceof Error ? error.message : String(error) },
        'ArchetypeScoring'
      );
      return null;
    }

    const metrics = trajectoryMetricsExtractor.extractFromRaw({
      trajectoryId: traj.trajectoryId,
      agentId: traj.agentId,
      stepsJson: traj.stepsJson,
      scenarioId: traj.scenarioId || undefined,
      finalPnL: traj.finalPnL || undefined,
    });

    if (!metrics) {
      logger.error('Failed to extract metrics', { trajectoryId }, 'ArchetypeScoring');
      return null;
    }

    // Build prompt
    const context: TrajectoryContext = {
      trajectoryId: traj.trajectoryId,
      agentId: traj.agentId,
      archetype: archetype || 'default',
      steps,
      metrics,
      finalPnL: traj.finalPnL || undefined,
      episodeLength: traj.episodeLength,
      totalReward: traj.totalReward,
    };

    const { system, user } = judgePromptBuilder.buildSinglePrompt(context, {
      includeActionDetails: opts.includeActionDetails,
    });

    // Call LLM judge
    const response = await this.callSingleJudge(system, user);

    if (!response) {
      logger.error('Judge returned no response', { trajectoryId }, 'ArchetypeScoring');
      return null;
    }

    const score: ArchetypeScore = {
      trajectoryId: traj.trajectoryId,
      agentId: traj.agentId,
      archetype: archetype || 'default',
      score: Math.max(0, Math.min(1, response.score)),
      reasoning: response.reasoning,
      strengths: response.strengths || [],
      weaknesses: response.weaknesses || [],
      metrics,
      scoredAt: new Date(),
    };

    // Save to database if requested
    if (opts.saveToDatabase) {
      await db
        .update(trajectories)
        .set({
          aiJudgeReward: score.score,
          aiJudgeReasoning: score.reasoning,
          judgedAt: score.scoredAt,
          isTrainingData: true,
        })
        .where(eq(trajectories.trajectoryId, trajectoryId));
    }

    logger.info(
      'Scored trajectory',
      {
        trajectoryId,
        archetype: score.archetype,
        score: score.score,
      },
      'ArchetypeScoring'
    );

    return score;
  }

  /**
   * Score multiple trajectories using RULER (relative comparison)
   */
  async scoreTrajectoryGroup(
    trajectoryIds: string[],
    options: ScoringOptions = {}
  ): Promise<ArchetypeScore[]> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    if (trajectoryIds.length < this.minGroupSize) {
      logger.warn(
        'Group too small for RULER scoring',
        { size: trajectoryIds.length, minRequired: this.minGroupSize },
        'ArchetypeScoring'
      );
      return [];
    }

    // Fetch all trajectory data
    const trajResults = await db
      .select({
        trajectoryId: trajectories.trajectoryId,
        agentId: trajectories.agentId,
        stepsJson: trajectories.stepsJson,
        scenarioId: trajectories.scenarioId,
        finalPnL: trajectories.finalPnL,
        episodeLength: trajectories.episodeLength,
        totalReward: trajectories.totalReward,
      })
      .from(trajectories)
      .where(inArray(trajectories.trajectoryId, trajectoryIds));

    if (trajResults.length < this.minGroupSize) {
      logger.warn(
        'Not enough valid trajectories found',
        { requested: trajectoryIds.length, found: trajResults.length },
        'ArchetypeScoring'
      );
      return [];
    }

    // Build contexts with metrics
    const contexts: TrajectoryContext[] = [];

    for (const traj of trajResults) {
      let steps: TrajectoryStep[];
      try {
        steps = JSON.parse(traj.stepsJson) as TrajectoryStep[];
      } catch {
        logger.warn('Skipping trajectory with invalid steps', { trajectoryId: traj.trajectoryId }, 'ArchetypeScoring');
        continue;
      }

      const archetype = opts.archetype || (await this.getAgentArchetype(traj.agentId));

      const metrics = trajectoryMetricsExtractor.extractFromRaw({
        trajectoryId: traj.trajectoryId,
        agentId: traj.agentId,
        stepsJson: traj.stepsJson,
        scenarioId: traj.scenarioId || undefined,
        finalPnL: traj.finalPnL || undefined,
      });

      if (!metrics) {
        logger.warn('Skipping trajectory with failed metrics extraction', { trajectoryId: traj.trajectoryId }, 'ArchetypeScoring');
        continue;
      }

      contexts.push({
        trajectoryId: traj.trajectoryId,
        agentId: traj.agentId,
        archetype: archetype || 'default',
        steps,
        metrics,
        finalPnL: traj.finalPnL || undefined,
        episodeLength: traj.episodeLength,
        totalReward: traj.totalReward,
      });
    }

    if (contexts.length < this.minGroupSize) {
      logger.warn('Not enough valid contexts for scoring', { count: contexts.length }, 'ArchetypeScoring');
      return [];
    }

    // Split into batches and score
    const batches = this.splitIntoBatches(contexts, this.maxGroupSize);
    const scores: ArchetypeScore[] = [];

    for (const batch of batches) {
      const scenarioId = batch[0]?.archetype || 'unknown';
      const { system, user } = judgePromptBuilder.buildComparisonPrompt(batch, scenarioId);

      const response = await this.callComparisonJudge(system, user);

      if (!response) {
        logger.error('Judge returned no response for batch', {}, 'ArchetypeScoring');
        continue;
      }

      // Map responses to contexts
      for (let i = 0; i < batch.length; i++) {
        const ctx = batch[i];
        if (!ctx) continue;
        
        const expectedId = `trajectory-${i + 1}`;
        const scoreData = response.scores.find((s) => s.trajectory_id === expectedId);

        if (!scoreData) {
          logger.warn('Missing score for trajectory', { expectedId }, 'ArchetypeScoring');
          continue;
        }

        const score: ArchetypeScore = {
          trajectoryId: ctx.trajectoryId,
          agentId: ctx.agentId,
          archetype: ctx.archetype || 'default',
          score: Math.max(0, Math.min(1, scoreData.score)),
          reasoning: scoreData.explanation,
          strengths: [],
          weaknesses: [],
          metrics: ctx.metrics,
          scoredAt: new Date(),
        };

        scores.push(score);

        // Save to database if requested
        if (opts.saveToDatabase) {
          await db
            .update(trajectories)
            .set({
              aiJudgeReward: score.score,
              aiJudgeReasoning: score.reasoning,
              judgedAt: score.scoredAt,
              isTrainingData: true,
            })
            .where(eq(trajectories.trajectoryId, ctx.trajectoryId));
        }
      }
    }

    logger.info(
      'Scored trajectory group',
      { requested: trajectoryIds.length, scored: scores.length },
      'ArchetypeScoring'
    );

    return scores;
  }

  /**
   * Score all unscored trajectories for a specific archetype
   */
  async scoreByArchetype(
    archetype: string,
    limit: number = 100
  ): Promise<{ scored: number; errors: number }> {
    if (!hasCustomRubric(archetype)) {
      logger.warn(
        'No custom rubric for archetype, using default',
        { archetype },
        'ArchetypeScoring'
      );
    }

    // Find unscored trajectories for agents with this archetype
    const unscoredResult = await db
      .select({
        trajectoryId: trajectories.trajectoryId,
      })
      .from(trajectories)
      .innerJoin(users, eq(trajectories.agentId, users.id))
      .where(
        and(
          eq(users.archetype, archetype),
          isNull(trajectories.aiJudgeReward),
          eq(trajectories.isTrainingData, true),
          not(eq(trajectories.stepsJson, 'null')),
          not(eq(trajectories.stepsJson, '[]'))
        )
      )
      .limit(limit);

    if (unscoredResult.length === 0) {
      logger.info('No unscored trajectories for archetype', { archetype }, 'ArchetypeScoring');
      return { scored: 0, errors: 0 };
    }

    const trajectoryIds = unscoredResult.map((r) => r.trajectoryId);

    // Score in groups
    const scores = await this.scoreTrajectoryGroup(trajectoryIds, { archetype });

    return {
      scored: scores.length,
      errors: trajectoryIds.length - scores.length,
    };
  }

  /**
   * Get agent's archetype from database
   */
  private async getAgentArchetype(agentId: string): Promise<string | null> {
    const result = await db
      .select({ archetype: users.archetype })
      .from(users)
      .where(eq(users.id, agentId))
      .limit(1);

    return result[0]?.archetype || null;
  }

  /**
   * Call LLM judge for single trajectory
   */
  private async callSingleJudge(
    system: string,
    user: string
  ): Promise<TrajectoryScoreResponse | null> {
    const llmCaller = getLLMCaller();

    const prompt = `${user}

Return ONLY valid JSON, no other text.`;

    const response = await llmCaller.callGroqDirect({
      prompt,
      system,
      modelSize: 'large',
      temperature: 0.3,
      maxTokens: 1000,
      actionType: 'archetype_score_trajectory',
    });

    return this.parseSingleResponse(response);
  }

  /**
   * Call LLM judge for trajectory comparison
   */
  private async callComparisonJudge(
    system: string,
    user: string
  ): Promise<RulerScoreResponse | null> {
    const llmCaller = getLLMCaller();

    const prompt = `${user}

Return ONLY valid JSON, no other text.`;

    const response = await llmCaller.callGroqDirect({
      prompt,
      system,
      modelSize: 'large',
      temperature: 0.3,
      maxTokens: 2000,
      actionType: 'archetype_ruler_score',
    });

    return this.parseComparisonResponse(response);
  }

  /**
   * Parse single trajectory score response
   */
  private parseSingleResponse(response: string): TrajectoryScoreResponse | null {
    try {
      let jsonText = response.trim();
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.error('No JSON found in response', { response: response.substring(0, 200) }, 'ArchetypeScoring');
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]) as TrajectoryScoreResponse;

      if (typeof parsed.score !== 'number') {
        logger.error('Invalid score type', { parsed }, 'ArchetypeScoring');
        return null;
      }

      return parsed;
    } catch (error) {
      logger.error(
        'Failed to parse judge response',
        { error: error instanceof Error ? error.message : String(error) },
        'ArchetypeScoring'
      );
      return null;
    }
  }

  /**
   * Parse comparison (RULER) response
   */
  private parseComparisonResponse(response: string): RulerScoreResponse | null {
    try {
      let jsonText = response.trim();
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.error('No JSON found in response', { response: response.substring(0, 200) }, 'ArchetypeScoring');
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]) as RulerScoreResponse;

      if (!parsed.scores || !Array.isArray(parsed.scores)) {
        logger.error('Invalid scores array', { parsed }, 'ArchetypeScoring');
        return null;
      }

      // Normalize scores to 0-1 range
      for (const score of parsed.scores) {
        score.score = Math.max(0, Math.min(1, score.score));
      }

      return parsed;
    } catch (error) {
      logger.error(
        'Failed to parse comparison response',
        { error: error instanceof Error ? error.message : String(error) },
        'ArchetypeScoring'
      );
      return null;
    }
  }

  /**
   * Split items into batches
   */
  private splitIntoBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }
}

/**
 * Singleton instance
 */
export const archetypeScoringService = new ArchetypeScoringService();

