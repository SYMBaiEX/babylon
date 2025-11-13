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
import { ModelType } from '@elizaos/core'

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

        // Build evaluation prompt based on enabled features
        const enabledFeatures = []
        if (agent.autonomousTrading) enabledFeatures.push('trading')
        if (agent.autonomousPosting) enabledFeatures.push('posting')
        if (agent.autonomousCommenting) enabledFeatures.push('commenting')
        if (agent.autonomousDMs) enabledFeatures.push('DMs')
        if (agent.autonomousGroupChats) enabledFeatures.push('group chats')

        const prompt = `${agent.agentSystem}

You are ${agent.displayName}, running autonomously.
Enabled features: ${enabledFeatures.join(', ')}
Trading strategy: ${agent.agentTradingStrategy || 'General analysis'}
Current P&L: ${agent.lifetimePnL}

Task: Evaluate what actions you should take this tick.
Consider the current state and decide if you should:
${agent.autonomousTrading ? '- Make any trades' : ''}
${agent.autonomousPosting ? '- Create any posts' : ''}
${agent.autonomousCommenting ? '- Comment on anything' : ''}
${agent.autonomousDMs ? '- Respond to any DMs' : ''}
${agent.autonomousGroupChats ? '- Participate in group chats' : ''}

Respond with your analysis and intended actions.`

        // Run strategy evaluation
        const modelType = agent.agentModelTier === 'pro' ? ModelType.TEXT_LARGE : ModelType.TEXT_SMALL
        const thinking = await runtime.useModel(modelType, {
          prompt,
          temperature: 0.7,
          maxTokens: 500
        })

        // Log the tick
        await agentService.createLog(agent.id, {
          type: 'tick',
          level: 'info',
          message: 'Autonomous tick completed',
          prompt,
          thinking,
          metadata: {
            pointsCost,
            duration: Date.now() - agentStartTime,
            modelUsed: agent.agentModelTier === 'pro' ? 'groq-70b' : 'groq-8b',
            enabledFeatures
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

