/**
 * Autonomous A2A Service
 * 
 * Handles autonomous agent actions using the A2A protocol.
 * Provides advanced actions beyond direct database access.
 */

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { generateSnowflakeId } from '@/lib/snowflake'
import type { IAgentRuntime } from '@elizaos/core'
import type { BabylonRuntime } from '../plugins/babylon/types'

export class AutonomousA2AService {
  /**
   * Execute autonomous trading via A2A
   * More sophisticated than direct DB trading
   */
  async executeA2ATrade(
    agentUserId: string,
    runtime: IAgentRuntime
  ): Promise<{ success: boolean; tradeId?: string }> {
    try {
      const babylonRuntime = runtime as BabylonRuntime
      
      if (!babylonRuntime.a2aClient?.isConnected()) {
        logger.debug('A2A not connected, skipping A2A trade', { agentUserId })
        return { success: false }
      }

      const agent = await prisma.user.findUnique({ where: { id: agentUserId } })
      if (!agent || !agent.isAgent || !agent.autonomousTrading) {
        return { success: false }
      }

      // Get market data via A2A
      const predictionsResponse = await babylonRuntime.a2aClient!.sendRequest('a2a.getPredictions', {
        status: 'active'
      }) as { predictions?: Array<{id: string; yesShares: number; noShares: number; liquidity: number; question: string}> }

      if (!predictionsResponse?.predictions || predictionsResponse.predictions.length === 0) {
        return { success: false }
      }

      // Simple strategy: find underpriced markets
      const opportunities = predictionsResponse.predictions.filter((market: {id: string; yesShares: number; noShares: number; liquidity: number; question: string}) => {
        const totalShares = market.yesShares + market.noShares
        const yesPrice = totalShares > 0 ? market.yesShares / totalShares : 0.5
        return yesPrice < 0.35 && market.liquidity > 500 // YES below 35%
      })

      if (opportunities.length === 0) {
        return { success: false }
      }

      // Pick first opportunity
      const market = opportunities[0]
      if (!market) {
        return { success: false }
      }
      
      const tradeAmount = Math.min(50, Number(agent.virtualBalance) * 0.05) // 5% of balance, max $50

      if (tradeAmount < 10) {
        return { success: false } // Too small
      }

      // Execute trade via A2A
      const tradeResult = await babylonRuntime.a2aClient!.sendRequest('a2a.buyShares', {
        marketId: market.id,
        outcome: 'YES',
        amount: tradeAmount
      }) as { shares?: number; avgPrice?: number; positionId?: string }

      logger.info('A2A trade executed', {
        agentUserId,
        marketId: market.id,
        amount: tradeAmount,
        shares: tradeResult.shares || 0
      })

      // Log to database
      await prisma.agentTrade.create({
        data: {
          id: generateSnowflakeId(),
          agentUserId,
          marketType: 'prediction',
          marketId: market.id,
          action: 'open',
          side: 'yes',
          amount: tradeAmount,
          price: tradeResult.avgPrice || 0,
          reasoning: 'A2A autonomous trade: undervalued YES shares'
        }
      })

      return { success: true, tradeId: tradeResult.positionId }
    } catch (error) {
      logger.error('A2A trade failed', error)
      return { success: false }
    }
  }

  /**
   * Post via A2A with enhanced context
   */
  async createA2APost(
    agentUserId: string,
    runtime: IAgentRuntime,
    content: string
  ): Promise<{ success: boolean; postId?: string }> {
    try {
      const babylonRuntime = runtime as BabylonRuntime
      
      if (!babylonRuntime.a2aClient?.isConnected()) {
        logger.debug('A2A not connected, skipping A2A post', { agentUserId })
        return { success: false }
      }

      const agent = await prisma.user.findUnique({ where: { id: agentUserId } })
      if (!agent || !agent.isAgent || !agent.autonomousPosting) {
        return { success: false }
      }

      // Create post via A2A
      const postResult = await babylonRuntime.a2aClient!.sendRequest('a2a.createPost', {
        content,
        type: 'post'
      }) as { postId?: string }

      logger.info('A2A post created', {
        agentUserId,
        postId: postResult.postId,
        contentLength: content.length
      })

      return { success: true, postId: postResult.postId }
    } catch (error) {
      logger.error('A2A post failed', error)
      return { success: false }
    }
  }

  /**
   * Engage with trending content via A2A
   */
  async engageWithTrending(
    agentUserId: string,
    runtime: IAgentRuntime
  ): Promise<{ success: boolean; engagements: number }> {
    try {
      const babylonRuntime = runtime as BabylonRuntime
      
      if (!babylonRuntime.a2aClient?.isConnected()) {
        return { success: false, engagements: 0 }
      }

      const agent = await prisma.user.findUnique({ where: { id: agentUserId } })
      if (!agent || !agent.isAgent) {
        return { success: false, engagements: 0 }
      }

      // Get trending topics
      const trendingResponse = await babylonRuntime.a2aClient!.sendRequest('a2a.getTrendingTags', {
        limit: 3
      }) as { tags?: Array<{name: string; displayName: string; category: string; postCount: number}> }

      if (!trendingResponse?.tags || trendingResponse.tags.length === 0) {
        return { success: false, engagements: 0 }
      }

      let engagements = 0

      // Engage with top trending topic
      const topTag = trendingResponse.tags[0]!
      const postsResponse = await babylonRuntime.a2aClient!.sendRequest('a2a.getPostsByTag', {
        tag: topTag.name,
        limit: 5,
        offset: 0
      }) as { posts?: Array<{id: string; content: string; authorId: string; timestamp: string}> }

      if (postsResponse?.posts && postsResponse.posts.length > 0) {
        // Like first post
        const post = postsResponse.posts[0]
        if (post && post.id) {
          await babylonRuntime.a2aClient!.sendRequest('a2a.likePost', {
            postId: post.id
          })
          engagements++

          logger.info('A2A engagement completed', {
            agentUserId,
            tag: topTag.name,
            engagements
          })
        }
      }

      return { success: true, engagements }
    } catch (error) {
      logger.error('A2A engagement failed', error)
      return { success: false, engagements: 0 }
    }
  }

  /**
   * Monitor positions via A2A
   */
  async monitorPositions(
    agentUserId: string,
    runtime: IAgentRuntime
  ): Promise<{ success: boolean; actionsTaken: number }> {
    try {
      const babylonRuntime = runtime as BabylonRuntime
      
      if (!babylonRuntime.a2aClient?.isConnected()) {
        return { success: false, actionsTaken: 0 }
      }

      const agent = await prisma.user.findUnique({ where: { id: agentUserId } })
      if (!agent || !agent.isAgent || !agent.autonomousTrading) {
        return { success: false, actionsTaken: 0 }
      }

      // Get positions via A2A
      const positionsResponse = await babylonRuntime.a2aClient!.sendRequest('a2a.getPositions', {
        userId: agentUserId
      }) as { perpPositions?: Array<{id: string; side: string; currentPrice: number; entryPrice: number}> }

      let actions = 0

      // Check perp positions for stop-loss
      if (positionsResponse?.perpPositions && positionsResponse.perpPositions.length > 0) {
        for (const position of positionsResponse.perpPositions) {
          const pnlPercent = ((position.currentPrice - position.entryPrice) / position.entryPrice) * 100

          // Close if losing > 25%
          if (position.side === 'long' && pnlPercent < -25) {
            await babylonRuntime.a2aClient!.sendRequest('a2a.closePosition', {
              positionId: position.id
            })
            actions++
            
            logger.info('A2A stop-loss triggered', {
              agentUserId,
              positionId: position.id,
              pnlPercent
            })
          }

          // Take profits if > 100%
          if (position.side === 'long' && pnlPercent > 100) {
            await babylonRuntime.a2aClient!.sendRequest('a2a.closePosition', {
              positionId: position.id
            })
            actions++
            
            logger.info('A2A take-profit triggered', {
              agentUserId,
              positionId: position.id,
              pnlPercent
            })
          }
        }
      }

      return { success: true, actionsTaken: actions }
    } catch (error) {
      logger.error('A2A position monitoring failed', error)
      return { success: false, actionsTaken: 0 }
    }
  }
}

export const autonomousA2AService = new AutonomousA2AService()

