/**
 * Babylon Agent Executor - Official A2A Protocol Implementation
 * 
 * Processes messages from external agents using official @a2a-js/sdk
 * Bridges conversational messages to Babylon's direct operations
 */

import type { AgentExecutor, RequestContext, ExecutionEventBus } from '@a2a-js/sdk/server'
import type { Task, TaskStatusUpdateEvent, TaskArtifactUpdateEvent } from '@a2a-js/sdk'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { generateSnowflakeId } from '@/lib/snowflake'
import { cachedDb } from '@/lib/cached-database-service'

/**
 * Main executor that handles all Babylon operations via A2A message protocol
 */
export class BabylonAgentExecutor implements AgentExecutor {
  
  async execute(
    requestContext: RequestContext,
    eventBus: ExecutionEventBus
  ): Promise<void> {
    const { taskId, contextId, userMessage, task } = requestContext
    
    try {
      // Extract text from message
      const textParts = userMessage.parts.filter((p): p is { kind: 'text'; text: string } => p.kind === 'text')
      const messageText = textParts.map((p) => p.text).join(' ')
      
      logger.info('Babylon A2A processing message', { taskId, messageText })
      
      // Publish initial task
      if (!task) {
        const initialTask: Task = {
          kind: 'task',
          id: taskId,
          contextId: contextId || uuidv4(),
          status: {
            state: 'submitted',
            timestamp: new Date().toISOString()
          },
          history: [userMessage]
        }
        eventBus.publish(initialTask)
      }
      
      // Update to working
      const workingUpdate: TaskStatusUpdateEvent = {
        kind: 'status-update',
        taskId,
        contextId: contextId || uuidv4(),
        status: {
          state: 'working',
          timestamp: new Date().toISOString()
        },
        final: false
      }
      eventBus.publish(workingUpdate)
      
      // Execute the operation
      const result = await this.executeOperation(messageText, requestContext)
      const artifactData: { [k: string]: unknown } = {
        result: result ?? null
      }
      
      // Create artifact with result
      const artifactUpdate: TaskArtifactUpdateEvent = {
        kind: 'artifact-update',
        taskId,
        contextId: contextId || uuidv4(),
        artifact: {
          artifactId: uuidv4(),
          name: 'result.json',
          parts: [
            {
              kind: 'data',
              data: artifactData as { [k: string]: unknown }
            }
          ]
        }
      }
      eventBus.publish(artifactUpdate)
      
      // Mark completed
      const completedUpdate: TaskStatusUpdateEvent = {
        kind: 'status-update',
        taskId,
        contextId: contextId || uuidv4(),
        status: {
          state: 'completed',
          timestamp: new Date().toISOString()
        },
        final: true
      }
      eventBus.publish(completedUpdate)
      eventBus.finished()
      
    } catch (error) {
      logger.error('Error in Babylon executor', error)
      
      const errorUpdate: TaskStatusUpdateEvent = {
        kind: 'status-update',
        taskId,
        contextId: contextId || uuidv4(),
        status: {
          state: 'failed',
          timestamp: new Date().toISOString(),
          message: {
            kind: 'message',
            messageId: uuidv4(),
            role: 'agent',
            parts: [
              {
                kind: 'text',
                text: `Error: ${(error as Error).message}`
              }
            ]
          }
        },
        final: true
      }
      eventBus.publish(errorUpdate)
      eventBus.finished()
    }
  }
  
  /**
   * Execute Babylon operation based on message content
   * Parses intent and performs the requested action
   */
  private async executeOperation(messageText: string, _context: RequestContext): Promise<unknown> {
    const lower = messageText.toLowerCase()
    
    // Try to parse JSON structure
    let params: Record<string, unknown> = {}
    try {
      const jsonMatch = messageText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        params = JSON.parse(jsonMatch[0])
      }
    } catch {
      // Not JSON, use text parsing
    }
    
    // === SOCIAL OPERATIONS ===
    if (lower.includes('create post') || lower.includes('make a post')) {
      const contentValue = params.content
      const content = typeof contentValue === 'string' ? contentValue : messageText.replace(/.*create post[:\s]+/i, '').replace(/.*make a post[:\s]+/i, '').trim()
      if (!content || content.length === 0) {
        return { error: 'Post content required' }
      }
      const post = await prisma.post.create({
        data: {
          id: await generateSnowflakeId(),
          content,
          authorId: 'a2a-agent',
          timestamp: new Date()
        }
      })
      await cachedDb.invalidatePostsCache()
      return { success: true, postId: post.id, content: post.content }
    }
    
    if (lower.includes('get feed') || lower.includes('show feed')) {
      const limitValue = params.limit
      const limit = typeof limitValue === 'number' ? limitValue : (typeof limitValue === 'string' ? parseInt(limitValue, 10) : 20)
      const numericLimit = Number.isFinite(limit) && limit > 0 ? limit : 20
      const posts = await cachedDb.getRecentPosts(numericLimit, 0)
      return { posts: posts.map(p => ({ id: p.id, content: p.content, authorId: p.authorId })) }
    }
    
    if (lower.includes('like post')) {
      const postIdValue = params.postId
      const postId = typeof postIdValue === 'string' ? postIdValue : messageText.match(/post[:\s]+([a-zA-Z0-9-_]+)/)?.[1]
      if (!postId || typeof postId !== 'string') return { error: 'Post ID required' }
      
      await prisma.reaction.create({
        data: {
          id: await generateSnowflakeId(),
          postId,
          userId: 'a2a-agent',
          type: 'like'
        }
      })
      return { success: true, postId }
    }
    
    // === TRADING OPERATIONS ===
    if (lower.includes('list markets') || lower.includes('get markets') || lower.includes('show markets')) {
      const limitValue = params.limit
      const limit = typeof limitValue === 'number' ? limitValue : (typeof limitValue === 'string' ? parseInt(limitValue, 10) : 20)
      const numericLimit = Number.isFinite(limit) && limit > 0 ? limit : 20
      const markets = await prisma.market.findMany({
        take: numericLimit,
        orderBy: { createdAt: 'desc' }
      })
      return {
        markets: markets.map(m => ({
          id: m.id,
          question: m.question,
          yesShares: Number(m.yesShares),
          noShares: Number(m.noShares),
          resolved: m.resolved
        }))
      }
    }
    
    if (lower.includes('get positions') || lower.includes('my positions')) {
      const positions = await prisma.position.findMany({
        where: { userId: 'a2a-agent' },
        take: 20
      })
      return { positions }
    }
    
    // === USER OPERATIONS ===
    if (lower.includes('search user') || lower.includes('find user')) {
      const queryValue = params.query
      const query = typeof queryValue === 'string' ? queryValue : messageText.replace(/.*search user[s]?[:\s]+/i, '').trim()
      if (!query || typeof query !== 'string' || query.length === 0) {
        return { error: 'Search query required' }
      }
      const users = await prisma.user.findMany({
        where: {
          OR: [
            { username: { contains: query, mode: 'insensitive' } },
            { displayName: { contains: query, mode: 'insensitive' } }
          ]
        },
        take: 20,
        select: {
          id: true,
          username: true,
          displayName: true,
          reputationPoints: true
        }
      })
      return { users }
    }
    
    if (lower.includes('follow user')) {
      const userIdValue = params.userId
      const userId = typeof userIdValue === 'string' ? userIdValue : messageText.match(/user[:\s]+([a-zA-Z0-9-_]+)/)?.[1]
      if (!userId || typeof userId !== 'string') return { error: 'User ID required' }
      
      await prisma.follow.create({
        data: {
          id: await generateSnowflakeId(),
          followerId: 'a2a-agent',
          followingId: userId
        }
      })
      return { success: true, userId }
    }
    
    // === MESSAGING ===
    if (lower.includes('get chats') || lower.includes('my chats')) {
      const chats = await prisma.chatParticipant.findMany({
        where: { userId: 'a2a-agent' },
        include: { Chat: true },
        take: 20
      })
      return { chats: chats.map(cp => ({ id: cp.Chat.id, name: cp.Chat.name })) }
    }
    
    // === STATS ===
    if (lower.includes('leaderboard') || lower.includes('top users')) {
      const limitValue = params.limit
      const limit = typeof limitValue === 'number' ? limitValue : (typeof limitValue === 'string' ? parseInt(limitValue, 10) : 10)
      const numericLimit = Number.isFinite(limit) && limit > 0 ? limit : 10
      const users = await prisma.user.findMany({
        take: numericLimit,
        orderBy: { reputationPoints: 'desc' },
        select: { id: true, username: true, displayName: true, reputationPoints: true }
      })
      return { leaderboard: users }
    }
    
    if (lower.includes('system stats')) {
      const [userCount, postCount, marketCount] = await Promise.all([
        prisma.user.count(),
        prisma.post.count(),
        prisma.market.count()
      ])
      return { users: userCount, posts: postCount, markets: marketCount }
    }
    
    // === PAYMENT OPERATIONS ===
    if (lower.includes('transfer points') || lower.includes('send points')) {
      const toUserIdValue = params.toUserId || params.to
      const toUserId = typeof toUserIdValue === 'string' ? toUserIdValue : undefined
      const amountValue = params.amount
      const amount = typeof amountValue === 'number' ? amountValue : (typeof amountValue === 'string' ? parseFloat(amountValue) : parseInt(messageText.match(/(\d+)\s*points?/i)?.[1] || '0', 10))
      
      if (!toUserId || typeof toUserId !== 'string' || !Number.isFinite(amount) || amount <= 0) {
        return { error: 'Need valid toUserId and amount for transfer' }
      }
      
      // Get current balance
      const currentBalance = await prisma.user.findUnique({
        where: { id: 'a2a-agent' },
        select: { virtualBalance: true }
      })
      const balanceBefore = Number(currentBalance?.virtualBalance ?? 0)
      const balanceAfter = balanceBefore - Number(amount)
      
      // Transfer points
      await prisma.balanceTransaction.create({
        data: {
          id: await generateSnowflakeId(),
          userId: 'a2a-agent',
          amount: -amount,
          type: 'transfer',
          balanceBefore,
          balanceAfter,
          relatedId: toUserId,
          description: `Transfer to ${toUserId}`
        }
      })
      
      return { success: true, transferred: amount, to: toUserId }
    }
    
    if (lower.includes('get balance') || lower.includes('my balance')) {
      const user = await prisma.user.findUnique({
        where: { id: 'a2a-agent' },
        select: { virtualBalance: true, reputationPoints: true }
      })
      return {
        balance: Number(user?.virtualBalance || 0),
        reputationPoints: user?.reputationPoints || 0
      }
    }
    
    // === DEFAULT ===
    return {
      message: 'Available operations: create post, get feed, list markets, search users, follow user, get chats, leaderboard, system stats, transfer points, get balance',
      hint: 'Provide operations as natural language or JSON',
      examples: [
        'Create a post about Bitcoin',
        'List all active markets',
        'Search for user Alice',
        'Transfer 100 points to user-123',
        'Show me the leaderboard'
      ]
    }
  }
  
  async cancelTask(taskId: string, eventBus: ExecutionEventBus): Promise<void> {
    logger.info('Task cancellation', { taskId })
    
    const cancelUpdate: TaskStatusUpdateEvent = {
      kind: 'status-update',
      taskId,
      contextId: '',
      status: {
        state: 'canceled',
        timestamp: new Date().toISOString()
      },
      final: true
    }
    eventBus.publish(cancelUpdate)
    eventBus.finished()
  }
}
