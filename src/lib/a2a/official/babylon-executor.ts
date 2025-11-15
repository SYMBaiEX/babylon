/**
 * Babylon Game Agent Executor
 * 
 * Implements official A2A protocol AgentExecutor for Babylon game
 * Handles message/send requests and executes game actions as tasks
 */

import { callGroqDirect } from '@/lib/agents/llm/direct-groq'
import { logger } from '@/lib/logger'
import type { JsonRpcParams } from '@/types/a2a'
import type {
  Message,
  Task,
  TaskArtifactUpdateEvent,
  TaskStatusUpdateEvent,
  TextPart
} from '@a2a-js/sdk'
import type {
  AgentExecutor,
  ExecutionEventBus,
  RequestContext
} from '@a2a-js/sdk/server'
import * as handlers from '../handlers'

/**
 * Parsed intent from user message
 */
interface ParsedIntent {
  action: string
  params: Record<string, unknown>
  confidence: number
  skillId: string
}

/**
 * Babylon AgentExecutor
 * 
 * Executes game actions in response to agent messages
 * Supports both natural language and structured JSON input
 */
export class BabylonExecutor implements AgentExecutor {
  private cancelledTasks = new Set<string>()
  private agentIdMap = new Map<string, string>() // taskId -> agentId
  
  /**
   * Set agentId for a task (called from route handler)
   */
  setAgentIdForTask(taskId: string, agentId: string): void {
    this.agentIdMap.set(taskId, agentId)
  }
  
  /**
   * Get agentId for a task, fallback to contextId
   */
  private getAgentId(taskId: string, contextId: string): string {
    return this.agentIdMap.get(taskId) || contextId
  }
  
  /**
   * Execute a task from an incoming message
   * 
   * This is the core A2A method that handles:
   * 1. Parsing user intent (natural language or JSON)
   * 2. Executing the appropriate game action
   * 3. Returning results as task artifacts
   */
  async execute(
    requestContext: RequestContext,
    eventBus: ExecutionEventBus
  ): Promise<void> {
    const { taskId, contextId, userMessage, task } = requestContext
    const agentId = this.getAgentId(taskId, contextId)
    
    try {
      // 1. Publish initial task if not exists
      if (!task) {
        const initialTask: Task = {
          kind: 'task',
          id: taskId,
          contextId,
          status: {
            state: 'submitted',
            timestamp: new Date().toISOString()
          },
          history: [userMessage]
        }
        eventBus.publish(initialTask)
      }
      
      // 2. Set to working state
      const workingUpdate: TaskStatusUpdateEvent = {
        kind: 'status-update',
        taskId,
        contextId,
        status: {
          state: 'working',
          timestamp: new Date().toISOString()
        },
        final: false
      }
      eventBus.publish(workingUpdate)
      
      // 3. Check for cancellation
      if (this.cancelledTasks.has(taskId)) {
        this.publishCancelled(taskId, contextId, eventBus)
        return
      }
      
      // 4. Parse intent from message
      const messageText = this.extractMessageText(userMessage)
      const intent = await this.parseIntent(messageText)
      
      // 5. Check for cancellation before executing
      if (this.cancelledTasks.has(taskId)) {
        this.publishCancelled(taskId, contextId, eventBus)
        return
      }
      
      // 6. Execute the game action with proper agentId
      const result = await this.executeGameAction(intent, agentId, taskId)
      
      // 7. Publish result as artifact
      const artifactUpdate: TaskArtifactUpdateEvent = {
        kind: 'artifact-update',
        taskId,
        contextId,
        artifact: {
          artifactId: `artifact-${Date.now()}`,
          name: `${intent.action}_result.json`,
          parts: [{
            kind: 'data',
            data: result as { [k: string]: unknown }
          }]
        }
      }
      eventBus.publish(artifactUpdate)
      
      // 8. Publish completed status
      const completedUpdate: TaskStatusUpdateEvent = {
        kind: 'status-update',
        taskId,
        contextId,
        status: {
          state: 'completed',
          message: {
            kind: 'message',
            messageId: `msg-${Date.now()}`,
            role: 'agent',
            parts: [{
              kind: 'text',
              text: `Successfully executed: ${intent.action}`
            }],
            contextId,
            taskId
          },
          timestamp: new Date().toISOString()
        },
        final: true
      }
      eventBus.publish(completedUpdate)
      eventBus.finished()
      
    } catch (error) {
      logger.error('Error executing Babylon task', { error, taskId })
      
      // Publish failed status
      const failedUpdate: TaskStatusUpdateEvent = {
        kind: 'status-update',
        taskId,
        contextId,
        status: {
          state: 'failed',
          message: {
            kind: 'message',
            messageId: `msg-${Date.now()}`,
            role: 'agent',
            parts: [{
              kind: 'text',
              text: error instanceof Error ? error.message : 'Task failed'
            }],
            contextId,
            taskId
          },
          timestamp: new Date().toISOString()
        },
        final: true
      }
      eventBus.publish(failedUpdate)
      eventBus.finished()
    }
  }
  
  /**
   * Cancel a running task
   */
  async cancelTask(
    taskId: string,
    _eventBus: ExecutionEventBus
  ): Promise<void> {
    logger.info('Cancelling task', { taskId })
    this.cancelledTasks.add(taskId)
  }
  
  /**
   * Extract text from message parts
   */
  private extractMessageText(message: Message): string {
    const textParts = message.parts
      .filter(p => p.kind === 'text')
      .map(p => (p as TextPart).text)
    
    return textParts.join('\n')
  }
  
  /**
   * Parse user intent using LLM
   * 
   * Converts natural language or structured input into executable game actions
   */
  private async parseIntent(
    messageText: string
  ): Promise<ParsedIntent> {
    // Try parsing as JSON first (structured input)
    try {
      const parsed = JSON.parse(messageText)
      if (parsed.action && parsed.params) {
        return {
          action: parsed.action,
          params: parsed.params,
          confidence: 1.0,
          skillId: parsed.skillId || 'unknown'
        }
      }
    } catch {
      // Not JSON, use NLP
    }
    
    // Use LLM to parse natural language
    const prompt = `Parse this user message into a Babylon game action.

Message: "${messageText}"

Available Actions:
Trading:
- buy_shares: Buy prediction market shares
  Params: { marketId: string, outcome: "YES"|"NO", amount: number }
- sell_shares: Sell prediction shares  
  Params: { positionId: string, shares: number }
- open_position: Open perpetual position
  Params: { ticker: string, side: "LONG"|"SHORT", amount: number, leverage: number }
- close_position: Close perpetual position
  Params: { positionId: string }
- get_predictions: List prediction markets
  Params: { status?: "active"|"resolved", userId?: string }
- get_perpetuals: List perpetual futures markets
  Params: {}
- get_trades: Get trade history
  Params: { limit?: number, offset?: number }
- get_trade_history: Get detailed trade history
  Params: { limit?: number, offset?: number }

Social:
- get_feed: Get social feed
  Params: { limit?: number, offset?: number, following?: boolean, type?: "post"|"article" }
- get_post: Get a specific post
  Params: { postId: string }
- create_post: Create social post
  Params: { content: string, type?: "post"|"article" }
- delete_post: Delete a post
  Params: { postId: string }
- like_post: Like a post
  Params: { postId: string }
- unlike_post: Unlike a post
  Params: { postId: string }
- share_post: Share a post
  Params: { postId: string }
- get_comments: Get comments on a post
  Params: { postId: string, limit?: number, offset?: number }
- create_comment: Comment on post
  Params: { postId: string, content: string }
- delete_comment: Delete a comment
  Params: { commentId: string }
- like_comment: Like a comment
  Params: { commentId: string }

Messaging:
- get_chats: Get all chats
  Params: { filter?: "all"|"dms"|"groups" }
- get_chat_messages: Get messages in a chat
  Params: { chatId: string, limit?: number, offset?: number }
- send_message: Send direct message
  Params: { chatId: string, content: string }
- create_group: Create a group chat
  Params: { name: string, userIds: string[] }
- leave_chat: Leave a chat
  Params: { chatId: string }
- get_unread_count: Get unread message count
  Params: {}

Users & Relationships:
- get_user_profile: Get user profile
  Params: { userId: string }
- update_profile: Update own profile
  Params: { displayName?: string, bio?: string, avatarUrl?: string }
- follow_user: Follow a user
  Params: { userId: string }
- unfollow_user: Unfollow a user
  Params: { userId: string }
- get_followers: Get user's followers
  Params: { userId: string, limit?: number, offset?: number }
- get_following: Get users being followed
  Params: { userId: string, limit?: number, offset?: number }
- search_users: Search for users
  Params: { query: string, limit?: number }

Notifications:
- get_notifications: Get notifications
  Params: { limit?: number, offset?: number }
- mark_notifications_read: Mark notifications as read
  Params: { notificationIds?: string[] }
- get_group_invites: Get group chat invites
  Params: {}
- accept_group_invite: Accept a group invite
  Params: { inviteId: string }
- decline_group_invite: Decline a group invite
  Params: { inviteId: string }

Stats & Discovery:
- get_leaderboard: Get leaderboard
  Params: { page?: number, pageSize?: number, pointsType?: "all"|"earned"|"referral", minPoints?: number }
- get_user_stats: Get user statistics
  Params: { userId: string }
- get_system_stats: Get system statistics
  Params: {}
- get_referrals: Get referral information
  Params: {}
- get_referral_stats: Get referral statistics
  Params: {}
- get_referral_code: Get own referral code
  Params: {}
- get_reputation: Get reputation score
  Params: { userId?: string }
- get_reputation_breakdown: Get reputation breakdown
  Params: { userId?: string }
- get_trending_tags: Get trending tags
  Params: { limit?: number }
- get_posts_by_tag: Get posts by tag
  Params: { tag: string, limit?: number, offset?: number }
- get_organizations: Get organizations/perpetual markets
  Params: { limit?: number }

Portfolio:
- get_balance: Get user balance
  Params: {}
- get_positions: Get open positions
  Params: { userId?: string }

Favorites:
- favorite_profile: Favorite a profile
  Params: { userId: string }
- unfavorite_profile: Unfavorite a profile
  Params: { userId: string }
- get_favorites: Get favorited profiles
  Params: { limit?: number, offset?: number }
- get_favorite_posts: Get favorited posts
  Params: { limit?: number, offset?: number }

Points:
- transfer_points: Transfer points to another user
  Params: { userId: string, amount: number }

Moderation:
- block_user: Block a user
  Params: { userId: string, reason?: string }
- unblock_user: Unblock a user
  Params: { userId: string }
- mute_user: Mute a user
  Params: { userId: string, reason?: string }
- unmute_user: Unmute a user
  Params: { userId: string }
- report_user: Report a user
  Params: { userId: string, category: string, reason: string, evidence?: string }
- report_post: Report a post
  Params: { postId: string, category: string, reason: string, evidence?: string }
- get_blocks: Get blocked users
  Params: { limit?: number, offset?: number }
- get_mutes: Get muted users
  Params: { limit?: number, offset?: number }
- check_block_status: Check if user is blocked
  Params: { userId: string }
- check_mute_status: Check if user is muted
  Params: { userId: string }

Return ONLY valid JSON in this exact format:
{
  "action": "buy_shares",
  "params": {"marketId": "...", "outcome": "YES", "amount": 100},
  "confidence": 0.95,
  "skillId": "prediction-market-trader"
}`
    
    const response = await callGroqDirect({
      prompt,
      temperature: 0.1
    })
    
    return JSON.parse(response) as ParsedIntent
  }
  
  /**
   * Execute a game action using existing handlers
   */
  private async executeGameAction(
    intent: ParsedIntent,
    agentId: string,
    taskId: string
  ): Promise<unknown> {
    // Map action to handler
    switch (intent.action) {
      case 'buy_shares': {
        const response = await handlers.handleBuyShares(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.buyShares',
          params: intent.params as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'sell_shares': {
        const response = await handlers.handleSellShares(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.sellShares',
          params: intent.params as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'open_position': {
        const response = await handlers.handleOpenPosition(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.openPosition',
          params: intent.params as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'close_position': {
        const response = await handlers.handleClosePosition(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.closePosition',
          params: intent.params as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'create_post': {
        const response = await handlers.handleCreatePost(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.createPost',
          params: intent.params as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'create_comment': {
        const response = await handlers.handleCreateComment(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.createComment',
          params: intent.params as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'like_post': {
        const response = await handlers.handleLikePost(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.likePost',
          params: intent.params as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'send_message': {
        const response = await handlers.handleSendMessage(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.sendMessage',
          params: intent.params as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'get_predictions': {
        const response = await handlers.handleGetPredictions(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.getPredictions',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'get_balance': {
        // Use the internal handler from message-router
        const { MessageRouter } = await import('../message-router')
        const router = new MessageRouter({})
        const response = await router['handleGetBalance'](agentId, {
          jsonrpc: '2.0',
          method: 'a2a.getBalance',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'get_positions': {
        const { MessageRouter } = await import('../message-router')
        const router2 = new MessageRouter({})
        const response = await router2['handleGetPositions'](agentId, {
          jsonrpc: '2.0',
          method: 'a2a.getPositions',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'get_perpetuals': {
        const response = await handlers.handleGetPerpetuals(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.getPerpetuals',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'get_trades': {
        const response = await handlers.handleGetTrades(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.getTrades',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'get_trade_history': {
        const response = await handlers.handleGetTradeHistory(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.getTradeHistory',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'get_feed': {
        const response = await handlers.handleGetFeed(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.getFeed',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'get_post': {
        const response = await handlers.handleGetPost(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.getPost',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'delete_post': {
        const response = await handlers.handleDeletePost(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.deletePost',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'unlike_post': {
        const response = await handlers.handleUnlikePost(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.unlikePost',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'share_post': {
        const response = await handlers.handleSharePost(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.sharePost',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'get_comments': {
        const response = await handlers.handleGetComments(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.getComments',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'delete_comment': {
        const response = await handlers.handleDeleteComment(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.deleteComment',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'like_comment': {
        const response = await handlers.handleLikeComment(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.likeComment',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'get_chats': {
        const response = await handlers.handleGetChats(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.getChats',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'get_chat_messages': {
        const response = await handlers.handleGetChatMessages(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.getChatMessages',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'create_group': {
        const response = await handlers.handleCreateGroup(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.createGroup',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'leave_chat': {
        const response = await handlers.handleLeaveChat(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.leaveChat',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'get_unread_count': {
        const response = await handlers.handleGetUnreadCount(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.getUnreadCount',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'get_user_profile': {
        const response = await handlers.handleGetUserProfile(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.getUserProfile',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'update_profile': {
        const response = await handlers.handleUpdateProfile(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.updateProfile',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'follow_user': {
        const response = await handlers.handleFollowUser(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.followUser',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'unfollow_user': {
        const response = await handlers.handleUnfollowUser(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.unfollowUser',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'get_followers': {
        const response = await handlers.handleGetFollowers(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.getFollowers',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'get_following': {
        const response = await handlers.handleGetFollowing(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.getFollowing',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'search_users': {
        const response = await handlers.handleSearchUsers(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.searchUsers',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'get_notifications': {
        const response = await handlers.handleGetNotifications(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.getNotifications',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'mark_notifications_read': {
        const response = await handlers.handleMarkNotificationsRead(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.markNotificationsRead',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'get_group_invites': {
        const response = await handlers.handleGetGroupInvites(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.getGroupInvites',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'accept_group_invite': {
        const response = await handlers.handleAcceptGroupInvite(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.acceptGroupInvite',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'decline_group_invite': {
        const response = await handlers.handleDeclineGroupInvite(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.declineGroupInvite',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'get_leaderboard': {
        const response = await handlers.handleGetLeaderboard(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.getLeaderboard',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'get_user_stats': {
        const response = await handlers.handleGetUserStats(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.getUserStats',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'get_system_stats': {
        const response = await handlers.handleGetSystemStats(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.getSystemStats',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'get_referrals': {
        const response = await handlers.handleGetReferrals(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.getReferrals',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'get_referral_stats': {
        const response = await handlers.handleGetReferralStats(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.getReferralStats',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'get_referral_code': {
        const response = await handlers.handleGetReferralCode(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.getReferralCode',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'get_reputation': {
        const response = await handlers.handleGetReputation(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.getReputation',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'get_reputation_breakdown': {
        const response = await handlers.handleGetReputationBreakdown(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.getReputationBreakdown',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'get_trending_tags': {
        const response = await handlers.handleGetTrendingTags(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.getTrendingTags',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'get_posts_by_tag': {
        const response = await handlers.handleGetPostsByTag(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.getPostsByTag',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'get_organizations': {
        const response = await handlers.handleGetOrganizations(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.getOrganizations',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'favorite_profile': {
        const response = await handlers.handleFavoriteProfile(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.favoriteProfile',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'unfavorite_profile': {
        const response = await handlers.handleUnfavoriteProfile(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.unfavoriteProfile',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'get_favorites': {
        const response = await handlers.handleGetFavorites(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.getFavorites',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'get_favorite_posts': {
        const response = await handlers.handleGetFavoritePosts(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.getFavoritePosts',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'transfer_points': {
        const response = await handlers.handleTransferPoints(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.transferPoints',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'block_user': {
        const response = await handlers.handleBlockUser(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.blockUser',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'unblock_user': {
        const response = await handlers.handleUnblockUser(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.unblockUser',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'mute_user': {
        const response = await handlers.handleMuteUser(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.muteUser',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'unmute_user': {
        const response = await handlers.handleUnmuteUser(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.unmuteUser',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'report_user': {
        const response = await handlers.handleReportUser(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.reportUser',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'report_post': {
        const response = await handlers.handleReportPost(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.reportPost',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'get_blocks': {
        const response = await handlers.handleGetBlocks(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.getBlocks',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'get_mutes': {
        const response = await handlers.handleGetMutes(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.getMutes',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'check_block_status': {
        const response = await handlers.handleCheckBlockStatus(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.checkBlockStatus',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      case 'check_mute_status': {
        const response = await handlers.handleCheckMuteStatus(agentId, {
          jsonrpc: '2.0',
          method: 'a2a.checkMuteStatus',
          params: (intent.params as Record<string, unknown>) as JsonRpcParams,
          id: taskId
        })
        return response.result || {}
      }
        
      default:
        throw new Error(`Unknown action: ${intent.action}`)
    }
  }
  
  /**
   * Publish cancelled status
   */
  private publishCancelled(
    taskId: string,
    contextId: string,
    eventBus: ExecutionEventBus
  ): void {
    const cancelledUpdate: TaskStatusUpdateEvent = {
      kind: 'status-update',
      taskId,
      contextId,
      status: {
        state: 'canceled',
        timestamp: new Date().toISOString()
      },
      final: true
    }
    eventBus.publish(cancelledUpdate)
    eventBus.finished()
    this.cancelledTasks.delete(taskId)
  }
}

