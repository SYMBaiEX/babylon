/**
 * Autonomous Coordinator
 *
 * Central orchestrator for all autonomous agent behaviors.
 * Eliminates duplication and ensures proper coordination between services.
 *
 * Strategy:
 * 1. Prefer A2A when connected (better protocol compliance)
 * 2. Fallback to direct DB when A2A unavailable
 * 3. Batch operations for efficiency
 * 4. Smart response prioritization
 * 5. Optional trajectory recording for RL training
 */

import { and, db, eq, or, userAgentConfigs, users } from '@babylon/db';
import { trajectoryRecorder } from '@babylon/training';
import type { IAgentRuntime } from '@elizaos/core';
import type { BabylonRuntime } from '../plugins/babylon/types';
import { setTrajectoryContext } from '../plugins/plugin-trajectory-logger/src/action-interceptor';
import { agentRuntimeManager } from '../runtime/AgentRuntimeManager';
import { getAgentConfig } from '../shared/agent-config';
import { logger } from '../shared/logger';

// Import services
import { autonomousA2AService } from './AutonomousA2AService';
import { autonomousBatchResponseService } from './AutonomousBatchResponseService';
import { autonomousCommentingService } from './AutonomousCommentingService';
// import { autonomousDMService } from './AutonomousDMService' // Not used yet
import { autonomousGroupChatService } from './AutonomousGroupChatService';
import { autonomousPlanningCoordinator } from './AutonomousPlanningCoordinator';
import { autonomousPostingService } from './AutonomousPostingService';
import { autonomousTradingService } from './AutonomousTradingService';

export interface AutonomousTickResult {
  success: boolean;
  actionsExecuted: {
    trades: number;
    posts: number;
    comments: number;
    messages: number;
    groupMessages: number;
    engagements: number;
  };
  method: 'a2a' | 'database' | 'planning_coordinator';
  duration: number;
  trajectoryId?: string;
}

export class AutonomousCoordinator {
  /**
   * Execute complete autonomous tick for an agent
   * Now uses goal-oriented multi-action planning when goals are configured
   *
   * @param agentUserId - Agent user ID
   * @param runtime - Agent runtime
   * @param recordTrajectories - Enable trajectory recording for RL training (default: false)
   */
  async executeAutonomousTick(
    agentUserId: string,
    runtime: IAgentRuntime,
    recordTrajectories = false
  ): Promise<AutonomousTickResult> {
    const startTime = Date.now();

    // Initialize trajectory recording if enabled
    let trajId: string | undefined;
    if (recordTrajectories) {
      trajId = await trajectoryRecorder.startTrajectory({
        agentId: agentUserId,
        metadata: {
          tickType: 'autonomous',
          startTime,
        },
      });

      // Set trajectory context on runtime for action/provider logging
      const trajectoryLogger =
        agentRuntimeManager.getTrajectoryLogger(agentUserId);
      if (trajectoryLogger && trajId) {
        setTrajectoryContext(runtime, trajId, trajectoryLogger);
        // Also set current trajectory ID on runtime for LLM call logging
        (runtime as { currentTrajectoryId?: string }).currentTrajectoryId =
          trajId;
      }
    }

    const result: AutonomousTickResult = {
      success: false,
      actionsExecuted: {
        trades: 0,
        posts: 0,
        comments: 0,
        messages: 0,
        groupMessages: 0,
        engagements: 0,
      },
      method: 'database',
      duration: 0,
      trajectoryId: trajId,
    };

    logger.info(
      `Starting autonomous tick for agent ${agentUserId}`,
      undefined,
      'AutonomousCoordinator'
    );

    // Get agent user
    const agentResult = await db
      .select({ id: users.id, isAgent: users.isAgent })
      .from(users)
      .where(eq(users.id, agentUserId))
      .limit(1);

    const agent = agentResult[0];
    if (!agent || !agent.isAgent) {
      throw new Error('Agent not found or not an agent');
    }

    // Get agent config
    const config = await getAgentConfig(agentUserId);

    // Check if agent has goals configured
    const hasGoals =
      (await db.agentGoal.count({
        where: {
          agentUserId,
          status: 'active',
        },
      })) > 0;

    // Use planning coordinator if agent has goals and multi-action planning enabled
    if (hasGoals && config?.planningHorizon === 'multi') {
      logger.info(
        'Using goal-oriented planning coordinator',
        undefined,
        'AutonomousCoordinator'
      );

      // Generate comprehensive action plan
      const plan = await autonomousPlanningCoordinator.generateActionPlan(
        agentUserId,
        runtime
      );

      // Execute the plan
      const executionResult = await autonomousPlanningCoordinator.executePlan(
        agentUserId,
        runtime,
        plan
      );

      // Map results to standard format
      for (const actionResult of executionResult.results) {
        if (actionResult.success) {
          switch (actionResult.action.type) {
            case 'trade':
              result.actionsExecuted.trades++;
              break;
            case 'post':
              result.actionsExecuted.posts++;
              break;
            case 'comment':
            case 'respond':
              result.actionsExecuted.comments++;
              break;
            case 'message':
              result.actionsExecuted.messages++;
              break;
          }
        }
      }

      result.success = executionResult.successful > 0;
      result.method = 'planning_coordinator';
      result.duration = Date.now() - startTime;

      logger.info(
        'Completed autonomous tick via planning coordinator',
        {
          agentId: agentUserId,
          planned: executionResult.planned,
          executed: executionResult.executed,
          successful: executionResult.successful,
          duration: result.duration,
        },
        'AutonomousCoordinator'
      );

      return result;
    }

    // Check if A2A should be used (both connected AND enabled in config)
    const useA2A =
      !!(runtime as BabylonRuntime).a2aClient?.isConnected() &&
      config?.a2aEnabled === true;

    logger.info(
      `Using ${useA2A ? 'A2A protocol' : 'direct database'} for autonomous actions`,
      undefined,
      'AutonomousCoordinator'
    );
    result.method = useA2A ? 'a2a' : 'database';

    // === PRIORITY 1: RESPONSES (Always do first) ===
    // Use batch response service for intelligent response handling
    const responses = await autonomousBatchResponseService.processBatch(
      agentUserId,
      runtime
    );
    result.actionsExecuted.comments += responses; // Comments include replies
    result.actionsExecuted.messages += responses; // Messages include DM responses

    // === PRIORITY 2: TRADING ===
    if (config?.autonomousTrading) {
      // Capture initial state if recording trajectories
      let initialState:
        | {
            agentBalance: number;
            agentPnL: number;
            openPositions: number;
            activeMarkets: number;
            timestamp: number;
          }
        | undefined;
      if (recordTrajectories && trajId) {
        initialState = await this.captureEnvironmentState(agentUserId);
        trajectoryRecorder.startStep(trajId, initialState);
      }

      let tradeInfo: {
        marketId?: string;
        ticker?: string;
        side?: string;
        marketType?: 'prediction' | 'perp';
      } = {};

      if (useA2A) {
        const tradeResult = await autonomousA2AService.executeA2ATrade(
          agentUserId,
          runtime
        );
        if (tradeResult.success) {
          result.actionsExecuted.trades++;
          tradeInfo = {
            marketId: tradeResult.marketId,
            ticker: tradeResult.ticker,
            side: tradeResult.side,
            marketType: tradeResult.marketType,
          };
        }
      } else {
        try {
          const tradeResult = await autonomousTradingService.executeTrades(
            agentUserId,
            runtime
          );
          result.actionsExecuted.trades += tradeResult.tradesExecuted;
          tradeInfo = {
            marketId: tradeResult.marketId,
            ticker: tradeResult.ticker,
            side: tradeResult.side,
            marketType: tradeResult.marketType,
          };
        } catch (tradingError) {
          logger.error(
            'Error during autonomous trade execution',
            tradingError instanceof Error
              ? tradingError
              : { error: String(tradingError) },
            'AutonomousCoordinator'
          );
          // Don't fail the entire tick if trading fails - continue with other actions
        }
      }

      // Complete trajectory step if recording
      if (recordTrajectories && trajId && initialState) {
        const afterState = await this.captureEnvironmentState(agentUserId);
        const pnlChange = afterState.agentPnL - initialState.agentPnL;

        // Calculate reward
        let reward = 0;
        if (result.actionsExecuted.trades > 0) {
          reward = 0.1; // Small positive reward for taking action

          // If we can detect immediate P&L change, use it
          if (pnlChange !== 0) {
            reward = Math.max(-1, Math.min(1, pnlChange / 1000));
          }
        }

        trajectoryRecorder.completeStep(
          trajId,
          {
            actionType: 'TRADING_DECISION',
            parameters: {
              method: useA2A ? 'a2a' : 'database',
              pnlChange,
              initialPnL: initialState.agentPnL,
              finalPnL: afterState.agentPnL,
              marketId: tradeInfo.marketId ?? null,
              ticker: tradeInfo.ticker ?? null,
              side: tradeInfo.side ?? null,
              marketType: tradeInfo.marketType ?? null,
            },
            success: result.actionsExecuted.trades > 0,
          },
          reward
        );
      }
    }

    // === PRIORITY 3: SOCIAL (Posting) ===
    if (config?.autonomousPosting) {
      if (useA2A) {
        const trendingResult = await autonomousA2AService.engageWithTrending(
          agentUserId,
          runtime
        );
        result.actionsExecuted.engagements += trendingResult.engagements;
      }

      // Capture initial state if recording trajectories
      if (recordTrajectories && trajId) {
        const initialState = await this.captureEnvironmentState(agentUserId);
        trajectoryRecorder.startStep(trajId, initialState);
      }

      const postId = await autonomousPostingService.createAgentPost(
        agentUserId,
        runtime
      );
      if (postId) {
        result.actionsExecuted.posts++;
      }

      // Complete trajectory step if recording
      if (recordTrajectories && trajId) {
        const reward = postId ? 0.1 : 0; // Small positive reward for creating content
        trajectoryRecorder.completeStep(
          trajId,
          {
            actionType: 'CREATE_POST',
            parameters: { postId },
            success: !!postId,
            result: postId ? { postId } : undefined,
          },
          reward
        );
      }
    }

    // === PRIORITY 4: ENGAGEMENT (Commenting) ===
    if (config?.autonomousCommenting) {
      // Capture initial state if recording trajectories
      if (recordTrajectories && trajId) {
        const initialState = await this.captureEnvironmentState(agentUserId);
        trajectoryRecorder.startStep(trajId, initialState);
      }

      const commentId = await autonomousCommentingService.createAgentComment(
        agentUserId,
        runtime
      );
      if (commentId) {
        result.actionsExecuted.comments++;
      }

      // Complete trajectory step if recording
      if (recordTrajectories && trajId) {
        const reward = commentId ? 0.05 : 0; // Small positive reward for engagement
        trajectoryRecorder.completeStep(
          trajId,
          {
            actionType: 'CREATE_COMMENT',
            parameters: { commentId },
            success: !!commentId,
            result: commentId ? { commentId } : undefined,
          },
          reward
        );
      }
    }

    // === PRIORITY 5: POSITION MONITORING ===
    if (config?.autonomousTrading && useA2A) {
      // Use A2A for position monitoring (better data access)
      const monitorResult = await autonomousA2AService.monitorPositions(
        agentUserId,
        runtime
      );
      result.actionsExecuted.trades += monitorResult.actionsTaken;
    }

    // === PRIORITY 6: COMMUNITY (DMs handled by batch, groups separate) ===
    if (config?.autonomousGroupChats) {
      // Group chats use direct DB (batch service doesn't handle groups yet)
      const groupMessages =
        await autonomousGroupChatService.participateInGroupChats(
          agentUserId,
          runtime
        );
      result.actionsExecuted.groupMessages += groupMessages;
    }

    /**
     * DMs are handled by batch response service above.
     * No need for separate DM service - avoiding duplication.
     */

    result.success = true;
    result.duration = Date.now() - startTime;

    // End trajectory recording if enabled
    if (recordTrajectories && trajId) {
      const finalState = await this.captureEnvironmentState(agentUserId);
      await trajectoryRecorder.endTrajectory(trajId, {
        finalBalance: finalState.agentBalance,
        finalPnL: finalState.agentPnL,
        gameKnowledge: {
          trueProbabilities: {},
          actualOutcomes: {},
        },
      });
    }

    logger.info(
      `Autonomous tick completed for agent ${agentUserId}`,
      {
        duration: result.duration,
        actions: result.actionsExecuted,
        method: result.method,
        trajectoryId: trajId,
      },
      'AutonomousCoordinator'
    );

    return result;
  }

  /**
   * Execute autonomous tick for all active agents
   */
  async executeTickForAllAgents(runtime: IAgentRuntime): Promise<{
    agentsProcessed: number;
    totalActions: number;
    errors: number;
  }> {
    // Get all agents with autonomous features enabled
    // Join users with userAgentConfigs to filter by autonomous settings
    const activeAgentResults = await db
      .select({
        id: users.id,
        displayName: users.displayName,
      })
      .from(users)
      .innerJoin(userAgentConfigs, eq(users.id, userAgentConfigs.userId))
      .where(
        and(
          eq(users.isAgent, true),
          or(
            eq(userAgentConfigs.autonomousTrading, true),
            eq(userAgentConfigs.autonomousPosting, true),
            eq(userAgentConfigs.autonomousCommenting, true),
            eq(userAgentConfigs.autonomousDMs, true),
            eq(userAgentConfigs.autonomousGroupChats, true)
          )
        )
      );

    logger.info(
      `Processing ${activeAgentResults.length} active agents`,
      undefined,
      'AutonomousCoordinator'
    );

    let totalActions = 0;
    let errors = 0;

    for (const agent of activeAgentResults) {
      const tickResult = await this.executeAutonomousTick(agent.id, runtime);

      if (tickResult.success) {
        const actionCount = Object.values(tickResult.actionsExecuted).reduce(
          (sum, count) => sum + count,
          0
        );
        totalActions += actionCount;

        logger.info(
          `Agent ${agent.displayName}: ${actionCount} actions in ${tickResult.duration}ms`,
          undefined,
          'AutonomousCoordinator'
        );
      } else {
        errors++;
      }

      // Small delay between agents to avoid overwhelming system
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return {
      agentsProcessed: activeAgentResults.length,
      totalActions,
      errors,
    };
  }

  /**
   * Capture current environment state for trajectory recording
   */
  private async captureEnvironmentState(agentUserId: string) {
    const agentResult = await db
      .select({
        virtualBalance: users.virtualBalance,
        lifetimePnL: users.lifetimePnL,
      })
      .from(users)
      .where(eq(users.id, agentUserId))
      .limit(1);

    const agent = agentResult[0];

    // Get open positions count
    const positionsCount = await db.perpPosition.count({
      where: {
        userId: agentUserId,
        closedAt: null,
      },
    });

    // Get active markets count
    const marketsCount = await db.market.count({
      where: {
        resolved: false,
      },
    });

    return {
      agentBalance: agent ? Number(agent.virtualBalance) : 0,
      agentPnL: agent ? Number(agent.lifetimePnL) : 0,
      openPositions: positionsCount,
      activeMarkets: marketsCount,
      timestamp: Date.now(),
    };
  }
}

export const autonomousCoordinator = new AutonomousCoordinator();
