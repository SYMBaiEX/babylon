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
 */

import { prisma } from '@/lib/database-service'
import { logger } from '@/lib/logger'
import type { IAgentRuntime } from '@elizaos/core'
import type { BabylonRuntime } from '../plugins/babylon/types'

// Import services
import { autonomousA2AService } from './AutonomousA2AService'
import { autonomousBatchResponseService } from './AutonomousBatchResponseService'
import { autonomousTradingService } from './AutonomousTradingService'
import { autonomousPostingService } from './AutonomousPostingService'
import { autonomousCommentingService } from './AutonomousCommentingService'
// import { autonomousDMService } from './AutonomousDMService' // Not used yet
import { autonomousGroupChatService } from './AutonomousGroupChatService'

export interface AutonomousTickResult {
  success: boolean
  actionsExecuted: {
    trades: number
    posts: number
    comments: number
    messages: number
    groupMessages: number
    engagements: number
  }
  method: 'a2a' | 'database'
  duration: number
}

export class AutonomousCoordinator {
  /**
   * Execute complete autonomous tick for an agent
   * Coordinates all services and avoids duplication
   */
  async executeAutonomousTick(
    agentUserId: string,
    runtime: IAgentRuntime
  ): Promise<AutonomousTickResult> {
    const startTime = Date.now()
    const result: AutonomousTickResult = {
      success: false,
      actionsExecuted: {
        trades: 0,
        posts: 0,
        comments: 0,
        messages: 0,
        groupMessages: 0,
        engagements: 0
      },
      method: 'database',
      duration: 0
    }

    try {
      logger.info(`Starting autonomous tick for agent ${agentUserId}`, undefined, 'AutonomousCoordinator')

      // Get agent config
      const agent = await prisma.user.findUnique({
        where: { id: agentUserId },
        select: {
          isAgent: true,
          autonomousTrading: true,
          autonomousPosting: true,
          autonomousCommenting: true,
          autonomousDMs: true,
          autonomousGroupChats: true
        }
      })

      if (!agent || !agent.isAgent) {
        throw new Error('Agent not found or not an agent')
      }

      // Check if A2A client is connected
      const babylonRuntime = runtime as BabylonRuntime
      const useA2A = babylonRuntime.a2aClient?.isConnected() || false

      logger.info(`Using ${useA2A ? 'A2A protocol' : 'direct database'} for autonomous actions`, undefined, 'AutonomousCoordinator')
      result.method = useA2A ? 'a2a' : 'database'

      // === PRIORITY 1: RESPONSES (Always do first) ===
      // Use batch response service for intelligent response handling
      const responses = await autonomousBatchResponseService.processBatch(agentUserId, runtime)
      result.actionsExecuted.comments += responses // Comments include replies
      result.actionsExecuted.messages += responses // Messages include DM responses

      // === PRIORITY 2: TRADING ===
      if (agent.autonomousTrading) {
        if (useA2A) {
          // Use A2A for trading (preferred - better protocol compliance)
          const tradeResult = await autonomousA2AService.executeA2ATrade(agentUserId, runtime)
          if (tradeResult.success) {
            result.actionsExecuted.trades++
          }
        } else {
          // Fallback to direct DB trading
          const tradesExecuted = await autonomousTradingService.executeTrades(agentUserId, runtime)
          result.actionsExecuted.trades += tradesExecuted
        }
      }

      // === PRIORITY 3: SOCIAL (Posting) ===
      if (agent.autonomousPosting) {
        if (useA2A) {
          // Use A2A for enhanced social features
          const trendingResult = await autonomousA2AService.engageWithTrending(agentUserId, runtime)
          result.actionsExecuted.engagements += trendingResult.engagements
        }
        
        // Create one original post (use direct DB - faster)
        const postId = await autonomousPostingService.createAgentPost(agentUserId, runtime)
        if (postId) {
          result.actionsExecuted.posts++
        }
      }

      // === PRIORITY 4: ENGAGEMENT (Commenting on others' posts) ===
      if (agent.autonomousCommenting) {
        // Use direct DB for commenting (already has context gathering)
        const commentId = await autonomousCommentingService.createAgentComment(agentUserId, runtime)
        if (commentId) {
          result.actionsExecuted.comments++
        }
      }

      // === PRIORITY 5: POSITION MONITORING ===
      if (agent.autonomousTrading && useA2A) {
        // Use A2A for position monitoring (better data access)
        const monitorResult = await autonomousA2AService.monitorPositions(agentUserId, runtime)
        result.actionsExecuted.trades += monitorResult.actionsTaken
      }

      // === PRIORITY 6: COMMUNITY (DMs handled by batch, groups separate) ===
      if (agent.autonomousGroupChats) {
        // Group chats use direct DB (batch service doesn't handle groups yet)
        const groupMessages = await autonomousGroupChatService.participateInGroupChats(agentUserId, runtime)
        result.actionsExecuted.groupMessages += groupMessages
      }

      // NOTE: DMs are handled by batch response service above
      // No need for separate DM service - avoiding duplication

      result.success = true
      result.duration = Date.now() - startTime

      logger.info(`Autonomous tick completed for agent ${agentUserId}`, {
        duration: result.duration,
        actions: result.actionsExecuted,
        method: result.method
      }, 'AutonomousCoordinator')

      return result

    } catch (error) {
      result.duration = Date.now() - startTime
      logger.error(`Autonomous tick failed for agent ${agentUserId}`, error, 'AutonomousCoordinator')
      return result
    }
  }

  /**
   * Execute autonomous tick for all active agents
   */
  async executeTickForAllAgents(runtime: IAgentRuntime): Promise<{
    agentsProcessed: number
    totalActions: number
    errors: number
  }> {
    try {
      // Get all agents with autonomous features enabled
      const activeAgents = await prisma.user.findMany({
        where: {
          isAgent: true,
          OR: [
            { autonomousTrading: true },
            { autonomousPosting: true },
            { autonomousCommenting: true },
            { autonomousDMs: true },
            { autonomousGroupChats: true }
          ]
        },
        select: { id: true, displayName: true }
      })

      logger.info(`Processing ${activeAgents.length} active agents`, undefined, 'AutonomousCoordinator')

      let totalActions = 0
      let errors = 0

      for (const agent of activeAgents) {
        try {
          const result = await this.executeAutonomousTick(agent.id, runtime)
          
          if (result.success) {
            const actionCount = Object.values(result.actionsExecuted).reduce((sum, count) => sum + count, 0)
            totalActions += actionCount
            
            logger.info(`Agent ${agent.displayName}: ${actionCount} actions in ${result.duration}ms`, undefined, 'AutonomousCoordinator')
          } else {
            errors++
          }

          // Small delay between agents to avoid overwhelming system
          await new Promise(resolve => setTimeout(resolve, 1000))

        } catch (error) {
          logger.error(`Failed to process agent ${agent.id}`, error, 'AutonomousCoordinator')
          errors++
        }
      }

      return {
        agentsProcessed: activeAgents.length,
        totalActions,
        errors
      }

    } catch (error) {
      logger.error('Failed to execute tick for all agents', error, 'AutonomousCoordinator')
      throw error
    }
  }
}

export const autonomousCoordinator = new AutonomousCoordinator()
