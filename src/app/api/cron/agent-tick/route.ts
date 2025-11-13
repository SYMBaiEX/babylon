/**
 * Agent Autonomous Tick Handler v2
 * 
 * POST /api/cron/agent-tick - Run all autonomous agents
 * 
 * IMPORTANT: Agents are Users (isAgent=true). They can:
 * - Trade (autonomousTrading)
 * - Post (autonomousPosting)
 * - Comment (autonomousCommenting)  
 * - Send DMs (autonomousDMs)
 * - Participate in group chats (autonomousGroupChats)
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { agentRuntimeManager } from '@/lib/agents/runtime/AgentRuntimeManager'
import { agentService } from '@/lib/agents/services/AgentService'
import { autonomousPostingService } from '@/lib/agents/autonomous/AutonomousPostingService'
import { autonomousCommentingService } from '@/lib/agents/autonomous/AutonomousCommentingService'
import { autonomousTradingService } from '@/lib/agents/autonomous/AutonomousTradingService'
import { autonomousDMService } from '@/lib/agents/autonomous/AutonomousDMService'
import { autonomousGroupChatService } from '@/lib/agents/autonomous/AutonomousGroupChatService'

function verifyCronRequest(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET || 'dev-secret'
  return authHeader === `Bearer ${cronSecret}`
}

export async function POST(req: NextRequest) {
  if (!verifyCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startTime = Date.now()
  logger.info('Agent tick started', undefined, 'AgentTick')

  try {
    // Get all agent users that should run (at least one autonomous feature enabled)
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

    logger.info(`Found ${agents.length} autonomous agents to run`, undefined, 'AgentTick')

    const results = []

    for (const agent of agents) {
      const agentStartTime = Date.now()
      
      try {
        const pointsCost = agent.agentModelTier === 'pro' ? 2 : 1
        
        if (agent.agentPointsBalance < pointsCost) {
          // Auto-pause all autonomous features
          await prisma.user.update({
            where: { id: agent.id },
            data: {
              autonomousTrading: false,
              autonomousPosting: false,
              autonomousCommenting: false,
              autonomousDMs: false,
              autonomousGroupChats: false,
              agentStatus: 'paused',
              agentErrorMessage: 'Insufficient points - auto-paused'
            }
          })

          await agentService.createLog(agent.id, {
            type: 'system',
            level: 'warn',
            message: `Auto-paused all autonomous features (need ${pointsCost}, have ${agent.agentPointsBalance})`
          })

          results.push({
            agentId: agent.id,
            name: agent.displayName,
            status: 'paused',
            reason: 'insufficient_points'
          })
          continue
        }

        // Deduct points for this tick
        await agentService.deductPoints(agent.id, pointsCost, 'Autonomous tick')

        // Get agent runtime
        const runtime = await agentRuntimeManager.getRuntime(agent.id)

        const enabledFeatures = []
        if (agent.autonomousTrading) enabledFeatures.push('trading')
        if (agent.autonomousPosting) enabledFeatures.push('posting')
        if (agent.autonomousCommenting) enabledFeatures.push('commenting')
        if (agent.autonomousDMs) enabledFeatures.push('DMs')
        if (agent.autonomousGroupChats) enabledFeatures.push('group chats')

        const actions = {
          trades: 0,
          posts: 0,
          comments: 0,
          dms: 0,
          groupMessages: 0
        }

        // Execute enabled autonomous actions
        if (agent.autonomousTrading) {
          const tradesExecuted = await autonomousTradingService.executeTrades(agent.id, runtime)
          actions.trades = tradesExecuted
        }

        if (agent.autonomousPosting) {
          const postId = await autonomousPostingService.createAgentPost(agent.id, runtime)
          if (postId) actions.posts = 1
        }

        if (agent.autonomousCommenting) {
          const commentId = await autonomousCommentingService.createAgentComment(agent.id, runtime)
          if (commentId) actions.comments = 1
        }

        if (agent.autonomousDMs) {
          const dmsResponded = await autonomousDMService.respondToDMs(agent.id, runtime)
          actions.dms = dmsResponded
        }

        if (agent.autonomousGroupChats) {
          const groupMessages = await autonomousGroupChatService.participateInGroupChats(agent.id, runtime)
          actions.groupMessages = groupMessages
        }

        // Log the tick with actual actions taken
        await agentService.createLog(agent.id, {
          type: 'tick',
          level: 'info',
          message: `Tick completed: ${actions.trades} trades, ${actions.posts} posts, ${actions.comments} comments, ${actions.dms} DMs, ${actions.groupMessages} group messages`,
          metadata: {
            pointsCost,
            duration: Date.now() - agentStartTime,
            modelUsed: agent.agentModelTier === 'pro' ? 'groq-70b' : 'groq-8b',
            enabledFeatures,
            actions
          }
        })

        // Update last tick time
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
          status: 'success',
          pointsDeducted: pointsCost,
          duration: Date.now() - agentStartTime
        })

        logger.info(`Agent ${agent.displayName} tick completed in ${Date.now() - agentStartTime}ms`, undefined, 'AgentTick')
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        const errorStack = error instanceof Error ? error.stack : undefined
        logger.error(`Error running agent ${agent.displayName}`, error, 'AgentTick')

        await agentService.createLog(agent.id, {
          type: 'error',
          level: 'error',
          message: `Tick error: ${errorMessage}`,
          metadata: { error: errorMessage, stack: errorStack }
        })

        await prisma.user.update({
          where: { id: agent.id },
          data: {
            agentStatus: 'error',
            agentErrorMessage: errorMessage
          }
        })

        results.push({
          agentId: agent.id,
          name: agent.displayName,
          status: 'error',
          error: errorMessage
        })
      }
    }

    const duration = Date.now() - startTime
    logger.info(`Agent tick completed in ${duration}ms`, undefined, 'AgentTick')

    return NextResponse.json({
      success: true,
      processed: results.length,
      duration,
      results
    })
  } catch (error: unknown) {
    logger.error('Agent tick error', error, 'AgentTick')
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Agent tick failed' },
      { status: 500 }
    )
  }
}

