/**
 * Autonomous Agent Tick Cron Job API
 * 
 * @route POST /api/cron/agent-tick - Execute agent tick
 * @access Cron (CRON_SECRET required)
 * 
 * @description
 * Scheduled cron job that runs all autonomous agents, executing their configured
 * autonomous actions (trading, posting, commenting, DMs, group chats). Processes
 * agents in sequence, deducting points and logging activities. Auto-pauses agents
 * with insufficient points.
 * 
 * @openapi
 * /api/cron/agent-tick:
 *   post:
 *     tags:
 *       - Cron
 *     summary: Execute agent tick
 *     description: Runs all autonomous agents with coordinated execution (requires CRON_SECRET)
 *     security:
 *       - CronSecret: []
 *     responses:
 *       200:
 *         description: Agent tick executed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 agentsProcessed:
 *                   type: integer
 *                 agentsPaused:
 *                   type: integer
 *                 errors:
 *                   type: array
 *       401:
 *         description: Invalid or missing CRON_SECRET
 * 
 * @example
 * ```typescript
 * await fetch('/api/cron/agent-tick', {
 *   method: 'POST',
 *   headers: { 'Authorization': `Bearer ${CRON_SECRET}` }
 * });
 * ```
 * 
 * @see {@link /lib/services/autonomous-coordinator} Autonomous coordinator
 * @see {@link /lib/agents/services/AgentService} Agent service
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { agentRuntimeManager } from '@/lib/agents/runtime/AgentRuntimeManager'
import { agentService } from '@/lib/agents/services/AgentService'
import { autonomousCoordinator } from '@/lib/agents/autonomous'

// Vercel function configuration
export const maxDuration = 300; // 5 minutes max for agent tick
export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest) {
  const startTime = Date.now()
  logger.info('Agent tick started', undefined, 'AgentTick')

  const agents = await prisma.user.findMany({
    where: {
      isAgent: true,
      agentPointsBalance: { gte: 1 },
      OR: [
        { autonomousTrading: true },
        { autonomousPosting: true },
        { autonomousCommenting: true },
        { autonomousDMs: true },
        { autonomousGroupChats: true }
      ]
    }
  })

  // Validation: Check if agents were found
  if (agents.length === 0) {
    logger.warn('No autonomous agents found to run', {
      criteria: {
        isAgent: true,
        agentPointsBalance: { gte: 1 },
        hasAutonomousFeatures: true
      }
    }, 'AgentTick')
    
    return NextResponse.json({
      success: true,
      processed: 0,
      duration: Date.now() - startTime,
      results: [],
      warning: 'No agents found with autonomous features enabled and sufficient points'
    })
  }

  logger.info(`Found ${agents.length} autonomous agents to run`, undefined, 'AgentTick')

  const results = []
  let totalActionsExecuted = 0
  let errors = 0

  for (const agent of agents) {
    const agentStartTime = Date.now()
    
    try {
      // Always 1pt per tick (no tiers)
      const pointsCost = 1
      
      await agentService.deductPoints(agent.id, pointsCost, 'Autonomous tick')

      const runtime = await agentRuntimeManager.getRuntime(agent.id)

      const enabledFeatures = []
      if (agent.autonomousTrading) enabledFeatures.push('trading')
      if (agent.autonomousPosting) enabledFeatures.push('posting')
      if (agent.autonomousCommenting) enabledFeatures.push('commenting')
      if (agent.autonomousDMs) enabledFeatures.push('DMs')
      if (agent.autonomousGroupChats) enabledFeatures.push('group chats')

      // Enable trajectory recording for RL training data collection
      // Can be toggled via environment variable
      const recordTrajectories = process.env.RECORD_AGENT_TRAJECTORIES === 'true';
      
      const tickResult = await autonomousCoordinator.executeAutonomousTick(agent.id, runtime, recordTrajectories)

      // Validation: Verify tick executed successfully
      if (!tickResult.success) {
        logger.warn(`Agent ${agent.displayName} tick completed but was not successful`, {
          agentId: agent.id,
          method: tickResult.method,
          duration: tickResult.duration
        }, 'AgentTick')
      }

      const actions = {
        trades: tickResult.actionsExecuted.trades,
        posts: tickResult.actionsExecuted.posts,
        comments: tickResult.actionsExecuted.comments,
        dms: tickResult.actionsExecuted.messages,
        groupMessages: tickResult.actionsExecuted.groupMessages
      }

      // Calculate total actions
      const agentActionCount = Object.values(actions).reduce((sum, count) => sum + count, 0)
      totalActionsExecuted += agentActionCount

      // Validation: Warn if agent has features enabled but took no actions
      if (enabledFeatures.length > 0 && agentActionCount === 0) {
        logger.warn(`Agent ${agent.displayName} has features enabled but took no actions`, {
          agentId: agent.id,
          enabledFeatures,
          method: tickResult.method
        }, 'AgentTick')
      }

      const modelUsed = process.env.WANDB_API_KEY
        ? (process.env.WANDB_MODEL || 'OpenPipe/Qwen3-14B-Instruct')
        : 'qwen/qwen3-32b'

      await agentService.createLog(agent.id, {
        type: 'tick',
        level: 'info',
        message: `Tick completed: ${actions.trades} trades, ${actions.posts} posts, ${actions.comments} comments, ${actions.dms} DMs, ${actions.groupMessages} group messages`,
        metadata: {
          pointsCost,
          duration: Date.now() - agentStartTime,
          modelUsed,
          enabledFeatures,
          actions,
          success: tickResult.success,
          method: tickResult.method
        }
      })

      await prisma.user.update({
        where: { id: agent.id },
        data: {
          agentLastTickAt: new Date(),
          agentStatus: 'running'
        }
      })

      results.push({
        agentId: agent.id,
        name: agent.displayName,
        status: tickResult.success ? 'success' : 'completed_without_actions',
        pointsDeducted: pointsCost,
        duration: Date.now() - agentStartTime,
        actions: agentActionCount,
        method: tickResult.method
      })

      logger.info(`Agent ${agent.displayName} tick completed in ${Date.now() - agentStartTime}ms`, {
        agentId: agent.id,
        actions: agentActionCount,
        method: tickResult.method,
        success: tickResult.success
      }, 'AgentTick')
    } catch (error) {
      errors++
      logger.error(`Failed to process agent ${agent.displayName}`, error, 'AgentTick')
      
      results.push({
        agentId: agent.id,
        name: agent.displayName,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - agentStartTime
      })
    }
  }

  const duration = Date.now() - startTime
  
  // Validation: Log summary metrics
  logger.info(`Agent tick completed in ${duration}ms`, {
    agentsProcessed: results.length,
    totalActions: totalActionsExecuted,
    errors,
    averageActionsPerAgent: results.length > 0 ? (totalActionsExecuted / results.length).toFixed(2) : 0
  }, 'AgentTick')

  // Validation: Warn if no actions were executed
  if (totalActionsExecuted === 0 && results.length > 0) {
    logger.warn('Agent tick completed but no actions were executed', {
      agentsProcessed: results.length,
      agentsWithFeatures: agents.filter(a => 
        a.autonomousTrading || a.autonomousPosting || a.autonomousCommenting || 
        a.autonomousDMs || a.autonomousGroupChats
      ).length
    }, 'AgentTick')
  }

  return NextResponse.json({
    success: true,
    processed: results.length,
    duration,
    totalActions: totalActionsExecuted,
    errors,
    results
  })
}

