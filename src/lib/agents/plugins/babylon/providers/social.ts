// @ts-nocheck
/**
 * Social Feed Provider
 * Provides access to social feed and posts via A2A protocol
 */

import type { Provider, IAgentRuntime, Memory, State } from '@elizaos/core'
import { logger } from '@/lib/logger'
import type { BabylonRuntime } from '../types'

/**
 * Provider: Recent Feed
 * Gets recent posts from the Babylon social feed via A2A
 */
export const feedProvider: Provider = {
  name: 'BABYLON_FEED',
  description: 'Get recent posts from the Babylon social feed via A2A protocol',
  
  get: async (runtime: IAgentRuntime, _message: Memory, _state: State) => {
    try {
      const babylonRuntime = runtime as BabylonRuntime
      
      // A2A is required
      if (!babylonRuntime.a2aClient?.isConnected()) {
        logger.error('A2A client not connected - feed provider requires A2A', { agentId: runtime.agentId })
        return 'A2A client not connected. Cannot fetch social feed.'
      }
      
      const feed = await babylonRuntime.a2aClient.sendRequest('a2a.getFeed', {
        limit: 10,
        offset: 0
      })
      
      return `Recent Feed Posts:

${feed.posts?.map((p: any, i: number) => `${i + 1}. ${p.content}
   By: @${p.author.username || p.author.displayName} | ${p.commentsCount} comments | ${p.reactionsCount} reactions
   ${p.timestamp}`).join('\n\n') || 'No posts'}`
    } catch (error) {
      logger.error('Failed to fetch feed', error, 'BabylonPlugin')
      return 'Error fetching feed'
    }
  }
}

/**
 * Provider: Trending Topics
 * Gets trending tags and topics via A2A
 */
export const trendingProvider: Provider = {
  name: 'BABYLON_TRENDING',
  description: 'Get trending topics and tags on Babylon via A2A protocol',
  
  get: async (runtime: IAgentRuntime, _message: Memory, _state: State) => {
    try {
      const babylonRuntime = runtime as BabylonRuntime
      
      // A2A is required
      if (!babylonRuntime.a2aClient?.isConnected()) {
        logger.error('A2A client not connected - trending provider requires A2A', { agentId: runtime.agentId })
        return 'A2A client not connected. Cannot fetch trending topics.'
      }
      
      const trending = await babylonRuntime.a2aClient.sendRequest('a2a.getTrendingTags', {
        limit: 10
      })
      
      return `Trending Topics:

${trending.tags?.map((t: any, i: number) => `${i + 1}. #${t.name} (${t.displayName || t.name})
   Category: ${t.category || 'General'}
   ${t.postCount} posts`).join('\n') || 'No trending topics'}`
    } catch (error) {
      logger.error('Failed to fetch trending topics', error, 'BabylonPlugin')
      return 'Error fetching trending topics'
    }
  }
}

