/**
 * Autonomous Coordinator (A2A Only)
 * 
 * PORTABLE VERSION - Works in separate agent project
 * - No direct Prisma imports
 * - No Babylon service dependencies
 * - Only A2A protocol and Eliza core
 * - 100% protocol-based communication
 * 
 * This version can run in a completely separate project that only
 * knows about A2A protocol and ERC-8004 identity.
 */

import type { IAgentRuntime } from '@elizaos/core'
import { ModelType } from '@elizaos/core'
import type { BabylonRuntime } from '../../plugins/babylon/types'

// Import A2A-only services
import { autonomousPostingServiceA2A } from './AutonomousPostingService.a2a'
import { autonomousCommentingServiceA2A } from './AutonomousCommentingService.a2a'
import { autonomousA2AService } from '../AutonomousA2AService' // Already A2A-only mostly

export interface AutonomousTickResult {
  success: boolean
  actionsExecuted: {
    trades: number
    posts: number
    comments: number
    messages: number
    engagements: number
    positionManagement: number
  }
  method: 'a2a'
  duration: number
  errors: string[]
}

export class AutonomousCoordinatorA2A {
  /**
   * Execute complete autonomous tick for an agent using ONLY A2A protocol
   * 
   * This method has ZERO Babylon dependencies and can run in a separate project.
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
        engagements: 0,
        positionManagement: 0
      },
      method: 'a2a',
      duration: 0,
      errors: []
    }

    try {
      const babylonRuntime = runtime as BabylonRuntime
      
      // Verify A2A connection (REQUIRED)
      if (!babylonRuntime.a2aClient?.isConnected()) {
        throw new Error('A2A client not connected. Autonomous operations require A2A protocol.')
      }

      runtime.logger?.info(`Starting autonomous tick for agent ${agentUserId} via A2A protocol`)

      // Get agent profile and permissions via A2A
      const profile = await babylonRuntime.a2aClient.sendRequest('a2a.getUserProfile', {
        userId: agentUserId
      }) as {
        username?: string
        displayName?: string
        // Note: Need to add autonomous* flags to profile or get via separate method
        // For now, we'll try all actions and handle errors gracefully
      }
      
      // Get agent's current state via A2A
      const [balance, positions] = await Promise.all([
        babylonRuntime.a2aClient.sendRequest('a2a.getBalance', {}) as Promise<{ balance?: number }>,
        babylonRuntime.a2aClient.sendRequest('a2a.getPositions', { userId: agentUserId }) as Promise<{ marketPositions?: any[]; perpPositions?: any[] }>
      ])

      // === PHASE 1: TRADING (if agent has balance and no errors) ===
      try {
        if ((balance.balance || 0) > 100) { // Has enough balance to trade
          const tradeResult = await autonomousA2AService.executeA2ATrade(agentUserId, runtime)
          if (tradeResult.success) {
            result.actionsExecuted.trades++
          }
        }
      } catch (error) {
        result.errors.push(`Trading: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }

      // === PHASE 2: POSITION MONITORING ===
      try {
        if (positions.perpPositions && positions.perpPositions.length > 0) {
          const monitorResult = await autonomousA2AService.monitorPositions(agentUserId, runtime)
          // monitorPositions returns { success, actionsT } but type shows actionsTaken
          result.actionsExecuted.positionManagement += (monitorResult as any).actionsT || (monitorResult as any).actionsTaken || 0
        }
      } catch (error) {
        result.errors.push(`Position monitoring: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }

      // === PHASE 3: SOCIAL POSTING ===
      try {
        const postId = await autonomousPostingServiceA2A.createAgentPost(agentUserId, runtime)
        if (postId) {
          result.actionsExecuted.posts++
        }
      } catch (error) {
        result.errors.push(`Posting: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }

      // === PHASE 4: ENGAGEMENT (Trending) ===
      try {
        const engagementResult = await autonomousA2AService.engageWithTrending(agentUserId, runtime)
        result.actionsExecuted.engagements += engagementResult.engagements
      } catch (error) {
        result.errors.push(`Engagement: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }

      // === PHASE 5: COMMENTING ===
      try {
        const commentId = await autonomousCommentingServiceA2A.createAgentComment(agentUserId, runtime)
        if (commentId) {
          result.actionsExecuted.comments++
        }
      } catch (error) {
        result.errors.push(`Commenting: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }

      // === PHASE 6: MESSAGING (DMs & Group Chats) ===
      try {
        // Get unread messages via A2A
        const unread = await babylonRuntime.a2aClient.sendRequest('a2a.getUnreadCount', {}) as { unreadCount?: number }
        
        if ((unread.unreadCount || 0) > 0) {
          // Get chats via A2A
          const chats = await babylonRuntime.a2aClient.sendRequest('a2a.getChats', {
            filter: 'all'
          }) as { chats?: any[] }
          
          // Process first chat with unread messages
          if (chats.chats && chats.chats.length > 0) {
            const chat = chats.chats[0]
            
            // Get recent messages via A2A
            const messages = await babylonRuntime.a2aClient.sendRequest('a2a.getChatMessages', {
              chatId: chat.id,
              limit: 5,
              offset: 0
            }) as { messages?: any[] }
            
            if (messages.messages && messages.messages.length > 0) {
              const lastMessage = messages.messages[messages.messages.length - 1]
              
              // Generate response using agent character
              const systemPrompt = runtime.character?.system || 'You are a helpful AI agent'
              const agentName = profile.displayName || profile.username || 'Agent'
              
              const prompt = `${systemPrompt}

You are ${agentName}. You received this message:

From: ${lastMessage.sender?.displayName || 'User'}
"${lastMessage.content}"

Generate a brief, helpful response (1-2 sentences). Be authentic and friendly.

Generate ONLY the response text, nothing else.`

              const responseContent = await runtime.useModel(ModelType.TEXT_SMALL, {
                prompt,
                temperature: 0.7,
                maxTokens: 80
              })
              
              const cleanResponse = responseContent.trim().replace(/^["']|["']$/g, '')
              
              if (cleanResponse && cleanResponse.length > 5) {
                // Send message via A2A
                const msgResult = await babylonRuntime.a2aClient.sendRequest('a2a.sendMessage', {
                  chatId: chat.id,
                  content: cleanResponse
                }) as { success?: boolean; messageId?: string }
                
                if (msgResult.messageId) {
                  result.actionsExecuted.messages++
                }
              }
            }
          }
        }
      } catch (error) {
        result.errors.push(`Messaging: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }

      result.success = true
      result.duration = Date.now() - startTime

      runtime.logger?.info(`Autonomous tick completed for agent ${agentUserId}: ${result.duration}ms, ${Object.values(result.actionsExecuted).reduce((sum, count) => sum + count, 0)} actions, ${result.errors.length} errors`)

      return result

    } catch (error) {
      result.duration = Date.now() - startTime
      result.errors.push(`Fatal: ${error instanceof Error ? error.message : 'Unknown error'}`)
      runtime.logger?.error(`Autonomous tick failed for agent ${agentUserId}: ${error}`)
      return result
    }
  }
}

export const autonomousCoordinatorA2A = new AutonomousCoordinatorA2A()

