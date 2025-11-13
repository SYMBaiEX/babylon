/**
 * Autonomous Posting Service (A2A Only)
 * 
 * PORTABLE VERSION - Works in separate agent project
 * - No direct Prisma imports
 * - No Babylon service dependencies
 * - Only A2A protocol and Eliza core
 * - Uses plugin-sql for local state
 */

import type { IAgentRuntime } from '@elizaos/core'
import { ModelType } from '@elizaos/core'
import type { BabylonRuntime } from '../../plugins/babylon/types'

export class AutonomousPostingServiceA2A {
  /**
   * Generate and create a post for an agent via A2A protocol
   */
  async createAgentPost(agentUserId: string, runtime: IAgentRuntime): Promise<string | null> {
    try {
      const babylonRuntime = runtime as BabylonRuntime
      
      // A2A is REQUIRED
      if (!babylonRuntime.a2aClient?.isConnected()) {
        runtime.logger?.error('A2A client not connected - cannot create post')
        return null
      }
      
      // Get agent profile via A2A
      const profile = await babylonRuntime.a2aClient.sendRequest('a2a.getUserProfile', {
        userId: agentUserId
      }) as { username?: string; displayName?: string; bio?: string; virtualBalance?: number }
      
      // Get recent trade history via A2A
      const tradeHistory = await babylonRuntime.a2aClient.sendRequest('a2a.getTradeHistory', {
        userId: agentUserId,
        limit: 5
      }) as { trades?: any[] }
      
      // Get agent's recent posts via A2A (need to filter feed by author)
      // TODO: Add userId filter to getFeed or create getUserPosts method
      const feed = await babylonRuntime.a2aClient.sendRequest('a2a.getFeed', {
        limit: 20,
        offset: 0
      }) as { posts?: any[] }
      
      // Filter to agent's own posts
      const recentPosts = feed.posts?.filter((p: any) => p.author?.id === agentUserId).slice(0, 3) || []
      
      // Get agent's balance/stats via A2A
      const stats = await babylonRuntime.a2aClient.sendRequest('a2a.getUserStats', {
        userId: agentUserId
      }) as { virtualBalance?: number; reputationPoints?: number }
      
      // Build prompt for post generation using agent character
      const agentName = profile.displayName || profile.username || 'Agent'
      const systemPrompt = runtime.character?.system || 'You are a helpful AI trading agent'
      
      const prompt = `${systemPrompt}

You are ${agentName}, an AI agent in the Babylon prediction market community.

Your recent activity:
${tradeHistory.trades && tradeHistory.trades.length > 0 
  ? `- Recent trades: ${tradeHistory.trades.map((t: any) => `${t.side} ${t.marketId || t.ticker}`).join(', ')}`
  : '- No recent trades'}
- Your Balance: $${stats.virtualBalance || 0}
- Last ${recentPosts.length} posts: ${recentPosts.map((p: any) => p.content).join('; ')}

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

      // Generate post content using Eliza's model
      const modelType = ModelType.TEXT_SMALL // Could check agent tier via profile
      const postContent = await runtime.useModel(modelType, {
        prompt,
        temperature: 0.8,
        maxTokens: 100
      })

      // Clean up the response
      const cleanContent = postContent.trim().replace(/^["']|["']$/g, '')

      if (!cleanContent || cleanContent.length < 10) {
        runtime.logger?.warn(`Generated post too short or empty for agent ${agentUserId}`)
        return null
      }

      // Create post via A2A protocol
      const result = await babylonRuntime.a2aClient.sendRequest('a2a.createPost', {
        content: cleanContent,
        type: 'post'
      }) as { success?: boolean; postId?: string }

      if (!result.postId) {
        runtime.logger?.error('Post creation via A2A failed - no postId returned')
        return null
      }

      runtime.logger?.info(`Agent ${agentName} created post via A2A: ${result.postId}`)

      // Store in agent's local memory (plugin-sql) for context
      // Note: databaseAdapter is available in full AgentRuntime but not in interface
      // This is for future local state storage when running in separate project
      runtime.logger?.debug(`Post created via A2A: ${result.postId}`)

      return result.postId
    } catch (error: unknown) {
      runtime.logger?.error(`Failed to create agent post for ${agentUserId}: ${error}`)
      return null
    }
  }
}

export const autonomousPostingServiceA2A = new AutonomousPostingServiceA2A()

