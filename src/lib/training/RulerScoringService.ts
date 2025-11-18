/**
 * RULER Scoring Service
 * 
 * Implements RULER (Relative Universal LLM-Elicited Rewards) using LLM-as-judge.
 * 
 * Key features:
 * - Groups trajectories by scenarioId for relative comparison
 * - Uses LLM judge to score trajectories relative to each other (0-1)
 * - Injects game context (P&L, episode length, actions) into judge prompt
 * - Deduplicates common message prefixes to save tokens
 * - Works with any LiteLLM-compatible provider (Groq, OpenAI, etc.)
 * 
 * Based on: https://art.openpipe.ai/fundamentals/ruler
 */

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { callGroqDirect } from '@/lib/agents/llm/direct-groq';
import { toARTMessages } from '@/lib/agents/plugins/plugin-trajectory-logger/src/art-format';
import type { TrajectoryStep } from './types';
import type { Trajectory as RichTrajectory } from '@/lib/agents/plugins/plugin-trajectory-logger/src/types';

export interface RulerScore {
  trajectoryId: string;
  overallScore: number; // 0-1 normalized score from LLM judge
  reasoning: string; // Judge's explanation
  scoredAt: Date;
}

interface TrajectoryScore {
  trajectory_id: string;
  explanation: string;
  score: number;
}

interface RulerResponse {
  scores: TrajectoryScore[];
}

/**
 * Default RULER rubric - works well for most RL tasks
 */
const DEFAULT_RUBRIC = `
- A trajectory that achieves its goal should always get a significantly higher score than a trajectory that does not achieve its goal.
- A trajectory that achieves its goal more efficiently (eg. by avoiding unproductive detours) should get a higher score than a trajectory that achieves its goal less efficiently.
- If one trajectory is only slightly better than another, the difference in scores should be small. If it is significantly better, the difference in scores should be large.
- You may give some partial credit for a trajectory that makes progress towards its goal but does not complete it.
`;

export class RulerScoringService {
  private readonly judgeModel: string;
  private readonly minGroupSize: number = 2; // Minimum trajectories per group for comparison
  private readonly maxGroupSize: number = 8; // Optimal group size per RULER docs

  constructor(judgeModel?: string) {
    // Default to fast, cost-effective judge model
    // Can use qwen3-32b for better quality, llama-3.1-8b-instant for speed
    this.judgeModel = judgeModel || process.env.RULER_JUDGE_MODEL || 'llama-3.1-8b-instant';
  }

  /**
   * Score trajectories using RULER (LLM-as-judge with relative comparison)
   * 
   * Groups trajectories by scenarioId and scores them relative to each other.
   * This is the proper RULER implementation - not simple heuristics!
   * 
   * @param trajectoryIds - Optional: specific trajectory IDs to score. If not provided, scores all unscored trajectories.
   * @returns Number of trajectories successfully scored
   */
  async scoreTrajectories(trajectoryIds?: string[]): Promise<number> {
    try {
      // Get trajectories to score
      const trajectories = await this.getTrajectoriesToScore(trajectoryIds);
      
      if (trajectories.length === 0) {
        logger.info('No trajectories to score', {}, 'RulerScoring');
        return 0;
      }

      // Group by scenarioId
      const groups = this.groupByScenario(trajectories);
      
      logger.info('Grouped trajectories for RULER scoring', {
        totalTrajectories: trajectories.length,
        groups: groups.length,
        avgGroupSize: groups.length > 0 ? trajectories.length / groups.length : 0
      }, 'RulerScoring');

      let totalScored = 0;

      // Score each group
      for (const group of groups) {
        if (group.trajectories.length < this.minGroupSize) {
          logger.warn('Skipping group with insufficient trajectories', {
            scenarioId: group.scenarioId,
            count: group.trajectories.length,
            minRequired: this.minGroupSize
          }, 'RulerScoring');
          continue;
        }

        // Split large groups into smaller batches (optimal size: 4-8)
        const batches = this.splitIntoBatches(group.trajectories, this.maxGroupSize);
        
        for (const batch of batches) {
          const scored = await this.scoreGroup(batch, group.scenarioId);
          totalScored += scored;
        }
      }

      logger.info('RULER scoring complete', {
        totalScored,
        totalTrajectories: trajectories.length
      }, 'RulerScoring');

      return totalScored;
    } catch (error) {
      logger.error('RULER scoring failed', { error }, 'RulerScoring');
      throw error;
    }
  }

  /**
   * Score a single trajectory (for backward compatibility)
   * 
   * Note: RULER works best with groups, so this finds other trajectories
   * in the same scenario and scores them together.
   */
  async scoreTrajectory(trajectoryId: string): Promise<RulerScore | null> {
    const trajectory = await prisma.trajectory.findUnique({
      where: { trajectoryId },
      include: {
        agent: {
          select: {
            id: true,
            displayName: true
          }
        }
      }
    });

    if (!trajectory) {
      logger.warn('Trajectory not found for scoring', { trajectoryId }, 'RulerScoring');
      return null;
    }

    // Skip if already scored
    if (trajectory.aiJudgeReward !== null) {
      return null;
    }

    // Find other trajectories in the same scenario
    const scenarioId = trajectory.scenarioId || 'default';
    const groupTrajectories = await prisma.trajectory.findMany({
      where: {
        scenarioId,
        aiJudgeReward: null, // Only unscored
        trajectoryId: { not: trajectoryId } // Exclude self
      },
      take: this.maxGroupSize - 1 // -1 because we'll add the target trajectory
    });

    // Create group with target trajectory + others
    const group = [trajectory, ...groupTrajectories];
    
    if (group.length < this.minGroupSize) {
      logger.warn('Insufficient trajectories in scenario for RULER', {
        scenarioId,
        count: group.length
      }, 'RulerScoring');
      return null;
    }

    // Score the group
    const scored = await this.scoreGroup(group, scenarioId);
    
    if (scored === 0) {
      return null;
    }

    // Return score for the requested trajectory
    const updated = await prisma.trajectory.findUnique({
      where: { trajectoryId },
      select: {
        trajectoryId: true,
        aiJudgeReward: true,
        aiJudgeReasoning: true,
        judgedAt: true
      }
    });

    if (!updated || updated.aiJudgeReward === null) {
      return null;
    }

    return {
      trajectoryId: updated.trajectoryId,
      overallScore: updated.aiJudgeReward,
      reasoning: updated.aiJudgeReasoning || '',
      scoredAt: updated.judgedAt || new Date()
    };
  }

  /**
   * Score a group of trajectories using RULER
   * 
   * This is the core RULER implementation:
   * 1. Convert trajectories to message format
   * 2. Extract common prefix (deduplication)
   * 3. Build judge prompt with context (P&L, episode length, etc.)
   * 4. Call LLM judge to score trajectories relative to each other
   * 5. Save scores to database
   */
  private async scoreGroup(
    trajectories: Array<{ trajectoryId: string; stepsJson: string | null; scenarioId: string | null; finalPnL: number | null; episodeLength: number | null }>,
    scenarioId: string
  ): Promise<number> {
    try {
      // Convert to rich trajectory format and extract messages
      const richTrajectories: Array<{ traj: RichTrajectory; messages: Array<{ role: string; content: string }> }> = [];
      
      for (const dbTraj of trajectories) {
        if (!dbTraj.stepsJson || dbTraj.stepsJson === 'null' || dbTraj.stepsJson === '[]') {
          logger.warn('Skipping trajectory with invalid stepsJson', {
            trajectoryId: dbTraj.trajectoryId
          }, 'RulerScoring');
          continue;
        }

        const steps: TrajectoryStep[] = JSON.parse(dbTraj.stepsJson) as TrajectoryStep[];
        
        // Convert to rich trajectory format
        const richTraj: RichTrajectory = {
          trajectoryId: dbTraj.trajectoryId,
          agentId: '', // Not needed for scoring
          startTime: 0,
          endTime: 0,
          durationMs: 0,
          scenarioId: dbTraj.scenarioId || undefined,
          steps: steps.map((s, idx) => ({
            stepNumber: idx,
            timestamp: Date.now(),
            environmentState: s.environmentState,
            providerAccesses: s.providerAccesses || [],
            llmCalls: s.llmCalls || [],
            action: s.action,
            reward: s.reward,
            metadata: {}
          })),
          totalReward: steps.reduce((sum, s) => sum + s.reward, 0),
          rewardComponents: {},
          metrics: {
            episodeLength: dbTraj.episodeLength || steps.length,
            finalStatus: 'completed',
            finalPnL: dbTraj.finalPnL || undefined
          },
          metadata: {
            isTrainingData: true
          }
        };

        // Convert to ART message format
        const messages = toARTMessages(richTraj);
        richTrajectories.push({ traj: richTraj, messages });
      }

      if (richTrajectories.length < this.minGroupSize) {
        logger.warn('Insufficient valid trajectories in group', {
          scenarioId,
          validCount: richTrajectories.length
        }, 'RulerScoring');
        return 0;
      }

      // Extract common prefix (deduplication)
      const commonPrefix = this.extractCommonPrefix(
        richTrajectories.map(rt => rt.messages)
      );

      // Build judge prompt with context
      const judgePrompt = this.buildJudgePrompt(
        richTrajectories,
        commonPrefix,
        scenarioId
      );

      // Call LLM judge
      const judgeResponse = await this.callJudge(judgePrompt);

      if (!judgeResponse || judgeResponse.scores.length !== richTrajectories.length) {
        logger.error('Invalid judge response', {
          expectedScores: richTrajectories.length,
          receivedScores: judgeResponse?.scores.length || 0
        }, 'RulerScoring');
        return 0;
      }

      // Save scores to database
      let scored = 0;
      for (let i = 0; i < richTrajectories.length; i++) {
        const scoreData = judgeResponse.scores[i];
        if (!scoreData) continue;

        const trajectoryId = richTrajectories[i]!.traj.trajectoryId;
        
        await prisma.trajectory.update({
          where: { trajectoryId },
          data: {
            aiJudgeReward: Math.max(0, Math.min(1, scoreData.score)), // Clamp to 0-1
            aiJudgeReasoning: scoreData.explanation,
            judgedAt: new Date(),
            isTrainingData: true
          }
        });

        scored++;
      }

      logger.info('Scored trajectory group', {
        scenarioId,
        scored,
        groupSize: richTrajectories.length
      }, 'RulerScoring');

      return scored;
    } catch (error) {
      logger.error('Failed to score trajectory group', {
        scenarioId,
        error: error instanceof Error ? error.message : String(error)
      }, 'RulerScoring');
      return 0;
    }
  }

  /**
   * Build judge prompt with trajectory context
   * 
   * Injects game knowledge (P&L, episode length, actions) into the prompt
   * so the judge can make informed relative comparisons.
   */
  private buildJudgePrompt(
    richTrajectories: Array<{ traj: RichTrajectory; messages: Array<{ role: string; content: string }> }>,
    commonPrefix: Array<{ role: string; content: string }>,
    scenarioId: string
  ): string {
    // Build context section with game knowledge (injected into prompt)
    const contextParts: string[] = [];
    contextParts.push(`Scenario: ${scenarioId}`);
    contextParts.push(`\nTrajectory Performance Context (use this to inform your scoring):`);

    for (let i = 0; i < richTrajectories.length; i++) {
      const rt = richTrajectories[i]!;
      const trajId = `trajectory-${i + 1}`;
      
      contextParts.push(`\n${trajId}:`);
      contextParts.push(`  - Final P&L: $${rt.traj.metrics.finalPnL?.toFixed(2) || '0.00'}`);
      contextParts.push(`  - Episode Length: ${rt.traj.metrics.episodeLength || 0} steps`);
      contextParts.push(`  - Total Reward: ${rt.traj.totalReward.toFixed(2)}`);
      
      const actionTypes = rt.traj.steps.map(s => s.action.actionType);
      const uniqueActions = [...new Set(actionTypes)];
      contextParts.push(`  - Actions Taken: ${uniqueActions.join(', ')} (${actionTypes.length} total)`);
      
      // Add success/error info
      const errors = rt.traj.steps.filter(s => !s.action.success).length;
      const successRate = rt.traj.steps.length > 0 
        ? ((rt.traj.steps.length - errors) / rt.traj.steps.length * 100).toFixed(1)
        : '0';
      contextParts.push(`  - Success Rate: ${successRate}%`);
      
      if (errors > 0) {
        contextParts.push(`  - Errors: ${errors}`);
      }
    }

    // Build trajectory messages (with deduplicated prefix)
    const trajectorySections: string[] = [];
    
    for (let i = 0; i < richTrajectories.length; i++) {
      const rt = richTrajectories[i]!;
      const trajId = `trajectory-${i + 1}`;
      
      // Remove common prefix from messages
      const uniqueMessages = rt.messages.slice(commonPrefix.length);
      
      // Truncate very long messages to save tokens (keep last 20 messages max)
      const truncatedMessages = uniqueMessages.slice(-20);
      
      trajectorySections.push(`<trajectory id="${trajId}">`);
      trajectorySections.push(JSON.stringify(truncatedMessages, null, 2));
      trajectorySections.push(`</trajectory>`);
    }

    // Build full prompt
    const userContent = commonPrefix.length > 0
      ? `<context>\n${JSON.stringify(commonPrefix, null, 2)}\n</context>\n\n`
      : '';

    const prompt = `${userContent}${contextParts.join('\n')}\n\nTrajectories:\n\n${trajectorySections.join('\n\n')}`;

    const systemPrompt = `You are an expert evaluator of AI agent performance. All trajectories below were given the same goal/scenario. Your job is to compare them and assign scores from 0 to 1 based on how well each trajectory achieved its goal.

Grading standards:
${DEFAULT_RUBRIC}

Important: Use the performance context provided (P&L, episode length, success rate) to inform your scoring, but also consider the quality of decision-making, efficiency, and goal achievement shown in the trajectory messages.`;

    return JSON.stringify({
      system: systemPrompt,
      user: prompt
    });
  }

  /**
   * Call LLM judge to score trajectories
   * 
   * Uses structured output format to ensure valid JSON response.
   */
  private async callJudge(promptJson: string): Promise<RulerResponse | null> {
    try {
      const promptData = JSON.parse(promptJson);
      
      // Build structured prompt that forces JSON output
      const structuredPrompt = `${promptData.user}

Please respond with ONLY a valid JSON object in this exact format:
{
  "scores": [
    {
      "trajectory_id": "trajectory-1",
      "explanation": "Brief explanation of score",
      "score": 0.85
    },
    {
      "trajectory_id": "trajectory-2",
      "explanation": "Brief explanation of score",
      "score": 0.65
    }
  ]
}

Return ONLY the JSON, no other text.`;

      // Use Groq for judging (fast and cost-effective)
      // Use larger model for better judgment quality
      const response = await callGroqDirect({
        prompt: structuredPrompt,
        system: promptData.system,
        modelSize: 'large', // qwen3-32b for better quality
        temperature: 0.3, // Lower temperature for more consistent scoring
        maxTokens: 2000 // Enough for scores + explanations
      });

      // Extract JSON from response (handle markdown code blocks)
      let jsonText = response.trim();
      
      // Remove markdown code blocks if present
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      
      // Try to find JSON object
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.error('Judge response does not contain JSON', {
          response: response.substring(0, 500)
        }, 'RulerScoring');
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]) as RulerResponse;
      
      // Validate response structure
      if (!parsed.scores || !Array.isArray(parsed.scores)) {
        logger.error('Invalid judge response structure', {
          parsed
        }, 'RulerScoring');
        return null;
      }

      // Validate all scores are in valid range
      for (const score of parsed.scores) {
        if (score.score < 0 || score.score > 1) {
          logger.warn('Judge returned score outside 0-1 range, clamping', {
            trajectoryId: score.trajectory_id,
            score: score.score
          }, 'RulerScoring');
          score.score = Math.max(0, Math.min(1, score.score));
        }
      }

      return parsed;
    } catch (error) {
      logger.error('Judge API call failed', {
        error: error instanceof Error ? error.message : String(error)
      }, 'RulerScoring');
      return null;
    }
  }

  /**
   * Extract common message prefix from trajectories
   * 
   * RULER deduplicates common prefixes to save tokens.
   */
  private extractCommonPrefix(
    messageLists: Array<Array<{ role: string; content: string }>>
  ): Array<{ role: string; content: string }> {
    if (messageLists.length === 0) return [];
    
    const first = messageLists[0]!;
    const prefix: Array<{ role: string; content: string }> = [];
    
    for (let i = 0; i < first.length; i++) {
      const msg = first[i]!;
      const allMatch = messageLists.every(msgs => 
        msgs[i] && 
        msgs[i]!.role === msg.role &&
        msgs[i]!.content === msg.content
      );
      
      if (allMatch) {
        prefix.push(msg);
      } else {
        break;
      }
    }
    
    return prefix;
  }

  /**
   * Group trajectories by scenarioId
   */
  private groupByScenario(
    trajectories: Array<{ trajectoryId: string; scenarioId: string | null }>
  ): Array<{ scenarioId: string; trajectories: typeof trajectories }> {
    const groups = new Map<string, typeof trajectories>();
    
    for (const traj of trajectories) {
      const scenarioId = traj.scenarioId || 'default';
      if (!groups.has(scenarioId)) {
        groups.set(scenarioId, []);
      }
      groups.get(scenarioId)!.push(traj);
    }
    
    return Array.from(groups.entries()).map(([scenarioId, trajs]) => ({
      scenarioId,
      trajectories: trajs
    }));
  }

  /**
   * Split large groups into optimal-sized batches
   */
  private splitIntoBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Get trajectories to score
   */
  private async getTrajectoriesToScore(trajectoryIds?: string[]) {
    if (trajectoryIds && trajectoryIds.length > 0) {
      return await prisma.trajectory.findMany({
        where: {
          trajectoryId: { in: trajectoryIds },
          aiJudgeReward: null // Only unscored
        },
        select: {
          trajectoryId: true,
          stepsJson: true,
          scenarioId: true,
          finalPnL: true,
          episodeLength: true
        }
      });
    }

    // Get all unscored trajectories
    return await prisma.trajectory.findMany({
      where: {
        aiJudgeReward: null,
        isTrainingData: true,
        stepsJson: { not: null }
      },
      select: {
        trajectoryId: true,
        stepsJson: true,
        scenarioId: true,
        finalPnL: true,
        episodeLength: true
      },
      orderBy: {
        startTime: 'asc'
      }
    });
  }

  /**
   * Score all unscored trajectories in a time window
   */
  async scoreWindow(windowId: string): Promise<number> {
    const trajectories = await prisma.trajectory.findMany({
      where: {
        windowId,
        isTrainingData: true,
        aiJudgeReward: null
      },
      select: {
        trajectoryId: true
      }
    });

    if (trajectories.length === 0) {
      return 0;
    }

    return await this.scoreTrajectories(
      trajectories.map(t => t.trajectoryId)
    );
  }
}

/**
 * Singleton instance of RulerScoringService
 */
export const rulerScoringService = new RulerScoringService();
