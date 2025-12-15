/**
 * Multi-Step Executor for Autonomous Agent Ticks
 *
 * Implements an iterative decision loop where the LLM decides what action to take
 * based on current state and previous actions taken this tick.
 *
 * Inspired by Otaku's multi-step pattern, adapted for Babylon prediction markets.
 */

import { db, eq, perpPositions, positions, users } from '@babylon/db';
import type { IAgentRuntime } from '@elizaos/core';
import { callGroqDirect } from '../llm/direct-groq';
import { getAgentConfig } from '../shared/agent-config';
import { logger } from '../shared/logger';
import { autonomousBatchResponseService } from './AutonomousBatchResponseService';
import { autonomousCommentingService } from './AutonomousCommentingService';
import { autonomousPostingService } from './AutonomousPostingService';
import { autonomousTradingService } from './AutonomousTradingService';
import {
  type ActionTraceResult,
  type AgentTickContext,
  type MarketOpportunity,
  type MultiStepDecision,
  buildMultiStepDecisionPrompt,
} from './templates/multi-step-decision';

// =============================================================================
// Types
// =============================================================================

export interface MultiStepExecutorResult {
  success: boolean;
  actionsExecuted: {
    trades: number;
    posts: number;
    comments: number;
    messages: number;
  };
  iterations: number;
  trace: ActionTraceResult[];
  duration: number;
}

// =============================================================================
// Multi-Step Executor
// =============================================================================

export class MultiStepExecutor {
  private readonly maxIterations: number;

  constructor(maxIterations = 5) {
    this.maxIterations = maxIterations;
  }

  /**
   * Execute a multi-step autonomous tick for an agent
   *
   * The LLM decides what action to take at each step, seeing the results
   * of previous actions to make informed decisions.
   */
  async execute(
    agentUserId: string,
    runtime: IAgentRuntime
  ): Promise<MultiStepExecutorResult> {
    const startTime = Date.now();
    const trace: ActionTraceResult[] = [];

    logger.info(
      `[MultiStep] Starting multi-step execution for agent ${agentUserId}`,
      undefined,
      'MultiStepExecutor'
    );

    // Get agent info
    const [agent] = await db
      .select()
      .from(users)
      .where(eq(users.id, agentUserId))
      .limit(1);

    if (!agent) {
      throw new Error('Agent not found');
    }

    const config = await getAgentConfig(agentUserId);
    const systemPrompt =
      config?.systemPrompt ?? 'You are an autonomous trading agent on Babylon.';

    // Determine enabled features
    const enabledFeatures: string[] = [];
    if (config?.autonomousTrading) enabledFeatures.push('trading');
    if (config?.autonomousPosting) enabledFeatures.push('posting');
    if (config?.autonomousCommenting) enabledFeatures.push('commenting');
    if (config?.autonomousDMs) enabledFeatures.push('DMs');

    // Main iteration loop
    for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
      logger.info(
        `[MultiStep] Iteration ${iteration}/${this.maxIterations}`,
        { agentUserId, actionsCompleted: trace.length },
        'MultiStepExecutor'
      );

      // Gather fresh context (state refreshes after each action)
      const context = await this.gatherContext(agentUserId, enabledFeatures);

      // Build decision prompt
      const prompt = buildMultiStepDecisionPrompt({
        agentName: agent.displayName ?? 'Agent',
        systemPrompt,
        iterationCount: iteration,
        maxIterations: this.maxIterations,
        traceActionResults: trace,
        context,
      });

      // Get LLM decision
      const decision = await this.getDecision(prompt, runtime, iteration);

      if (!decision) {
        logger.warn(
          `[MultiStep] Failed to parse decision at iteration ${iteration}, finishing`,
          undefined,
          'MultiStepExecutor'
        );
        break;
      }

      logger.info(
        `[MultiStep] Decision: ${decision.action || 'FINISH'}`,
        {
          thought: decision.thought.substring(0, 100),
          isFinish: decision.isFinish,
        },
        'MultiStepExecutor'
      );

      // Check if we should finish
      if (decision.isFinish || !decision.action) {
        logger.info(
          `[MultiStep] Agent decided to finish at iteration ${iteration}`,
          { thought: decision.thought },
          'MultiStepExecutor'
        );
        break;
      }

      // Execute the chosen action
      const actionResult = await this.executeAction(
        agentUserId,
        runtime,
        decision.action,
        decision.parameters,
        decision.thought
      );

      trace.push(actionResult);

      // Small delay between iterations
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Aggregate results
    const result = this.aggregateResults(trace, startTime);

    logger.info(
      `[MultiStep] Completed in ${result.duration}ms with ${result.iterations} iterations`,
      {
        trades: result.actionsExecuted.trades,
        posts: result.actionsExecuted.posts,
        comments: result.actionsExecuted.comments,
        messages: result.actionsExecuted.messages,
      },
      'MultiStepExecutor'
    );

    return result;
  }

  /**
   * Gather current context for decision making
   */
  private async gatherContext(
    agentUserId: string,
    enabledFeatures: string[]
  ): Promise<AgentTickContext> {
    // Get agent balance and P&L
    const [agent] = await db
      .select({
        virtualBalance: users.virtualBalance,
        lifetimePnL: users.lifetimePnL,
      })
      .from(users)
      .where(eq(users.id, agentUserId))
      .limit(1);

    // Get open positions count
    const predPositions = await db
      .select()
      .from(positions)
      .where(eq(positions.userId, agentUserId));
    const activePositions = predPositions.filter(
      (p) => p.status === 'active'
    ).length;

    const perpPositionsList = await db
      .select()
      .from(perpPositions)
      .where(
        eq(perpPositions.userId, agentUserId)
      );
    const openPerpPositions = perpPositionsList.filter(
      (p) => p.closedAt === null
    ).length;

    // Get pending interactions
    const pendingInteractions =
      await autonomousBatchResponseService.gatherPendingInteractions(
        agentUserId
      );

    // Get market opportunities (simplified for now)
    const opportunities = await this.detectOpportunities(agentUserId);

    return {
      balance: Number(agent?.virtualBalance ?? 0),
      pnl: Number(agent?.lifetimePnL ?? 0),
      openPositions: activePositions + openPerpPositions,
      pendingInteractions: pendingInteractions.length,
      pendingInteractionDetails: pendingInteractions.slice(0, 5).map((i) => ({
        type: i.type as 'comment_reply' | 'dm' | 'mention',
        author: i.author,
        content: i.content,
        postId: i.postId,
      })),
      enabledFeatures,
      opportunities,
    };
  }

  /**
   * Detect market opportunities for the agent
   */
  private async detectOpportunities(
    _agentUserId: string
  ): Promise<MarketOpportunity[]> {
    const opportunities: MarketOpportunity[] = [];

    // Get active prediction markets
    const activeMarkets = await db.market.findMany({
      where: {
        resolved: false,
        endDate: { gte: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    for (const market of activeMarkets) {
      const yesShares = Number(market.yesShares || 0);
      const noShares = Number(market.noShares || 0);
      const totalShares = yesShares + noShares;

      if (totalShares > 0) {
        const yesPrice = yesShares / totalShares;

        // Flag mispriced markets
        if (yesPrice < 0.25 || yesPrice > 0.75) {
          opportunities.push({
            type: 'prediction',
            id: market.id,
            name: market.question.substring(0, 50),
            description: `YES at ${(yesPrice * 100).toFixed(0)}% - ${yesPrice < 0.5 ? 'potential undervalued' : 'potential overvalued'}`,
            confidence: Math.abs(yesPrice - 0.5) * 2,
          });
        }
      }
    }

    return opportunities.slice(0, 5);
  }

  /**
   * Get LLM decision with retry logic
   */
  private async getDecision(
    prompt: string,
    runtime: IAgentRuntime,
    _iteration: number
  ): Promise<MultiStepDecision | null> {
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const response = await callGroqDirect({
        prompt,
        system:
          'You are a decision-making agent. Output valid JSON only. No markdown, no explanations.',
        runtime,
        temperature: attempt > 1 ? 0.5 : 0.7, // Lower temperature on retry
        maxTokens: 1000,
        actionType: 'multi_step_decision',
        purpose: 'action',
      });

      // Parse JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn(
          `[MultiStep] No JSON found in response (attempt ${attempt})`,
          { responsePreview: response.substring(0, 200) },
          'MultiStepExecutor'
        );
        continue;
      }

      try {
        const parsed = JSON.parse(jsonMatch[0]) as MultiStepDecision;

        // Validate required fields
        if (typeof parsed.isFinish !== 'boolean') {
          parsed.isFinish = false;
        }
        if (!parsed.action) {
          parsed.action = '';
        }
        if (!parsed.parameters) {
          parsed.parameters = {};
        }
        if (!parsed.thought) {
          parsed.thought = '';
        }

        return parsed;
      } catch {
        logger.warn(
          `[MultiStep] Failed to parse JSON (attempt ${attempt})`,
          { json: jsonMatch[0].substring(0, 200) },
          'MultiStepExecutor'
        );
      }
    }

    return null;
  }

  /**
   * Execute a single action based on LLM decision
   */
  private async executeAction(
    agentUserId: string,
    runtime: IAgentRuntime,
    action: string,
    parameters: Record<string, unknown>,
    _thought: string
  ): Promise<ActionTraceResult> {
    const normalizedAction = action.toUpperCase();

    logger.info(
      `[MultiStep] Executing action: ${normalizedAction}`,
      { parameters },
      'MultiStepExecutor'
    );

    try {
      switch (normalizedAction) {
        case 'TRADE': {
          const tradeResult = await autonomousTradingService.executeTrades(
            agentUserId,
            runtime
          );
          return {
            actionType: 'TRADE',
            success: tradeResult.tradesExecuted > 0,
            summary: tradeResult.tradesExecuted > 0
              ? `Executed ${tradeResult.tradesExecuted} trade(s) on ${tradeResult.marketType || 'market'}`
              : 'Decided to hold - no trade executed',
            result: {
              tradesExecuted: tradeResult.tradesExecuted,
              marketId: tradeResult.marketId,
              ticker: tradeResult.ticker,
              side: tradeResult.side,
            },
            parameters,
            timestamp: Date.now(),
          };
        }

        case 'POST': {
          const postId = await autonomousPostingService.createAgentPost(
            agentUserId,
            runtime
          );
          return {
            actionType: 'POST',
            success: !!postId,
            summary: postId ? `Created post ${postId}` : 'Failed to create post',
            result: postId ? { postId } : undefined,
            parameters,
            timestamp: Date.now(),
          };
        }

        case 'COMMENT': {
          const commentId =
            await autonomousCommentingService.createAgentComment(
              agentUserId,
              runtime
            );
          return {
            actionType: 'COMMENT',
            success: !!commentId,
            summary: commentId
              ? `Created comment ${commentId}`
              : 'Failed to create comment',
            result: commentId ? { commentId } : undefined,
            parameters,
            timestamp: Date.now(),
          };
        }

        case 'RESPOND': {
          const responses =
            await autonomousBatchResponseService.processBatch(
              agentUserId,
              runtime
            );
          return {
            actionType: 'RESPOND',
            success: responses > 0,
            summary: `Responded to ${responses} interaction(s)`,
            result: { responsesCreated: responses },
            parameters,
            timestamp: Date.now(),
          };
        }

        case 'WAIT':
        case '': {
          return {
            actionType: 'WAIT',
            success: true,
            summary: 'Agent decided to wait',
            parameters,
            timestamp: Date.now(),
          };
        }

        default: {
          logger.warn(
            `[MultiStep] Unknown action: ${normalizedAction}`,
            undefined,
            'MultiStepExecutor'
          );
          return {
            actionType: normalizedAction,
            success: false,
            summary: `Unknown action: ${normalizedAction}`,
            error: `Action "${normalizedAction}" is not recognized`,
            parameters,
            timestamp: Date.now(),
          };
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(
        `[MultiStep] Error executing ${normalizedAction}: ${errorMessage}`,
        undefined,
        'MultiStepExecutor'
      );
      return {
        actionType: normalizedAction,
        success: false,
        summary: `Error: ${errorMessage}`,
        error: errorMessage,
        parameters,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Aggregate trace results into final output
   */
  private aggregateResults(
    trace: ActionTraceResult[],
    startTime: number
  ): MultiStepExecutorResult {
    const counts = {
      trades: 0,
      posts: 0,
      comments: 0,
      messages: 0,
    };

    for (const result of trace) {
      if (!result.success) continue;

      switch (result.actionType) {
        case 'TRADE':
          counts.trades += (result.result?.tradesExecuted as number) || 1;
          break;
        case 'POST':
          counts.posts++;
          break;
        case 'COMMENT':
        case 'RESPOND':
          counts.comments += (result.result?.responsesCreated as number) || 1;
          break;
        case 'DM':
          counts.messages++;
          break;
      }
    }

    const hasSuccessfulActions = trace.some((r) => r.success && r.actionType !== 'WAIT');

    return {
      success: hasSuccessfulActions,
      actionsExecuted: counts,
      iterations: trace.length,
      trace,
      duration: Date.now() - startTime,
    };
  }
}

// Export singleton instance
export const multiStepExecutor = new MultiStepExecutor();
