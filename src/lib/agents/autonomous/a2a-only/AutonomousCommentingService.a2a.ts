/**
 * Autonomous Commenting Service (A2A Only)
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

export class AutonomousCommentingServiceA2A {
  /**
   * Find relevant posts and create comments via A2A protocol
   */
  async createAgentComment(agentUserId: string, runtime: IAgentRuntime): Promise<string | null> {
    try {
      const babylonRuntime = runtime as BabylonRuntime
      
      // A2A is REQUIRED
      if (!babylonRuntime.a2aClient?.isConnected()) {
        runtime.logger?.error('A2A client not connected - cannot create comment')
        return null
      }
      
      // Get agent profile via A2A
      const profile = await babylonRuntime.a2aClient.sendRequest('a2a.getUserProfile', {
        userId: agentUserId
      }) as { displayName?: string; username?: string }
      
      // Get recent posts from feed via A2A
      const feed = await babylonRuntime.a2aClient.sendRequest('a2a.getFeed', {
        limit: 20,
        offset: 0
      }) as { posts?: any[] }
      
      if (!feed.posts || feed.posts.length === 0) {
        return null // No posts to comment on
      }
      
      // Get posts agent hasn't commented on yet
      // TODO: Store commented post IDs in local memory when plugin-sql is available
      // For now, just avoid commenting on same post within this session
      const commentedPostIds: string[] = []
      
      // Filter to posts agent hasn't commented on
      const uncommentedPosts = feed.posts.filter((p: any) => 
        p.author?.id !== agentUserId && // Not agent's own post
        !commentedPostIds.includes(p.id) // Haven't commented yet
      )
      
      if (uncommentedPosts.length === 0) {
        return null // Nothing new to comment on
      }
      
      // Pick first relevant post
      const post = uncommentedPosts[0]
      
      if (!post) {
        return null
      }
      
      // Get agent system prompt from character
      const systemPrompt = runtime.character?.system || 'You are a helpful AI agent'
      const agentName = profile.displayName || profile.username || 'Agent'
      
      // Generate comment
      const prompt = `${systemPrompt}

You are ${agentName}, viewing this post:

"${post.content}"
Posted by: @${post.author?.username || 'user'}

Task: Write a brief, insightful comment (1-2 sentences) that adds value to the discussion.
Be authentic to your personality and expertise.
Keep it under 200 characters.

Generate ONLY the comment text, nothing else.`

      const modelType = ModelType.TEXT_SMALL
      const commentContent = await runtime.useModel(modelType, {
        prompt,
        temperature: 0.8,
        maxTokens: 80
      })

      const cleanContent = commentContent.trim().replace(/^["']|["']$/g, '')

      if (!cleanContent || cleanContent.length < 5) {
        return null
      }

      // Create comment via A2A protocol
      const result = await babylonRuntime.a2aClient.sendRequest('a2a.createComment', {
        postId: post.id,
        content: cleanContent
      }) as { success?: boolean; commentId?: string }

      if (!result.commentId) {
        runtime.logger?.error('Comment creation via A2A failed')
        return null
      }

      runtime.logger?.info(`Agent ${agentName} commented on post ${post.id} via A2A`)

      // Store in agent's local memory (plugin-sql) for tracking
      // Note: databaseAdapter is available in full runtime but not in interface
      // For future local state when running in separate project
      runtime.logger?.debug(`Comment created via A2A: ${result.commentId} on post ${post.id}`)

      return result.commentId
    } catch (error: unknown) {
      runtime.logger?.error(`Failed to create agent comment for ${agentUserId}: ${error}`)
      return null
    }
  }
}

export const autonomousCommentingServiceA2A = new AutonomousCommentingServiceA2A()

