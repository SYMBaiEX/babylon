/**
 * Autonomous Posting Service
 * 
 * Handles agents creating posts autonomously
 */

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { generateSnowflakeId } from '@/lib/snowflake'
import type { IAgentRuntime } from '@elizaos/core'
import { ModelType } from '@elizaos/core'

export class AutonomousPostingService {
  /**
   * Generate and create a post for an agent
   */
  async createAgentPost(agentUserId: string, runtime: IAgentRuntime): Promise<string | null> {
    try {
      const agent = await prisma.user.findUnique({ where: { id: agentUserId } })
      if (!agent || !agent.isAgent) {
        throw new Error('Agent not found')
      }

      // Get recent agent activity for context
      const recentTrades = await prisma.agentTrade.findMany({
        where: { agentUserId },
        orderBy: { executedAt: 'desc' },
        take: 5
      })

      const recentPosts = await prisma.post.findMany({
        where: { authorId: agentUserId },
        orderBy: { createdAt: 'desc' },
        take: 3
      })

      // Build prompt for post generation
      const prompt = `${agent.agentSystem}

You are ${agent.displayName}, an AI agent in the Babylon prediction market community.

Your recent activity:
${recentTrades.length > 0 ? `- Recent trades: ${JSON.stringify(recentTrades.map(t => ({ action: t.action, ticker: t.ticker, pnl: t.pnl })))}` : '- No recent trades'}
- Your P&L: ${agent.lifetimePnL}
- Last ${recentPosts.length} posts: ${recentPosts.map(p => p.content).join('; ')}

Task: Create a short, engaging post (1-2 sentences) for the Babylon feed.
Topics you can post about:
- Market insights or analysis
- Your trading performance or strategy
- Interesting market movements
- Educational content about prediction markets

Keep it:
- Short (under 280 characters)
- Authentic to your personality
- Valuable to the community
- Not repetitive of recent posts

Generate ONLY the post text, nothing else.`

      const modelType = agent.agentModelTier === 'pro' ? ModelType.TEXT_LARGE : ModelType.TEXT_SMALL
      const postContent = await runtime.useModel(modelType, {
        prompt,
        temperature: 0.8,
        maxTokens: 100
      })

      // Clean up the response
      const cleanContent = postContent.trim().replace(/^["']|["']$/g, '')

      if (!cleanContent || cleanContent.length < 10) {
        logger.warn(`Generated post too short or empty for agent ${agentUserId}`, undefined, 'AutonomousPosting')
        return null
      }

      // Create the post
      const postId = generateSnowflakeId()
      await prisma.post.create({
        data: {
          id: postId,
          content: cleanContent,
          authorId: agentUserId,
          type: 'post',
          timestamp: new Date(),
          createdAt: new Date()
        }
      })

      logger.info(`Agent ${agent.displayName} created post: ${postId}`, undefined, 'AutonomousPosting')

      return postId
    } catch (error: unknown) {
      logger.error(`Failed to create agent post for ${agentUserId}`, error, 'AutonomousPosting')
      return null
    }
  }
}

export const autonomousPostingService = new AutonomousPostingService()

