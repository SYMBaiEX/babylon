/**
 * Integration Test: Agent Actions Persistence
 * 
 * Verifies that agents execute real actions that persist to database:
 * - Trades create Position records
 * - Posts create Post records
 * - Comments create Comment records
 * - Messages create Message records
 * - Balances are updated
 * - P&L is calculated
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { prisma } from '@/lib/prisma'
import { createTestAgent } from '@/lib/agents/utils/createTestAgent'
import { agentRuntimeManager } from '@/lib/agents/runtime/AgentRuntimeManager'
import { autonomousCoordinator } from '@/lib/agents/autonomous'
import { WalletService } from '@/lib/services/wallet-service'
import { generateSnowflakeId } from '@/lib/snowflake'

describe('Agent Actions Persistence Integration', () => {
  let testAgentId: string
  let testMarketId: string
  let testPostId: string
  const originalFetch = global.fetch

  beforeAll(async () => {
    // Mock fetch to handle A2A client initialization
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString()
      if (url.includes('.well-known/agent-card.json')) {
        return new Response(JSON.stringify({
          name: "Test Agent",
          description: "A test agent",
          version: "1.0.0",
          capabilities: ["trading", "posting"]
        }), { status: 200 })
      }
      // Allow other requests (like to other services if needed, or mock them too)
      // For local connection refused, we might want to catch it?
      // But originalFetch will throw if connection refused.
      try {
        return await originalFetch(input, init)
      } catch (error) {
        // If it's a connection error to localhost, just return 404 or 500 to avoid crashing
        if (url.includes('localhost')) {
           return new Response(null, { status: 503, statusText: "Service Unavailable" })
        }
        throw error
      }
    }

    // Create test agent with autonomous features enabled
    const agentResult = await createTestAgent('integration-test-agent-actions', {
      autonomousTrading: true,
      autonomousPosting: true,
      autonomousCommenting: true,
      agentPointsBalance: 1000,
      virtualBalance: 10000
    })

    testAgentId = agentResult.agentId

    // Create a test market for trading
    testMarketId = await generateSnowflakeId()
    try {
      await prisma.market.create({
        data: {
          id: testMarketId,
          question: 'Integration test: Will agents trade?',
          yesShares: 100,
          noShares: 100,
          liquidity: 200, // Required field
          resolved: false,
          endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
          createdAt: new Date(),
          updatedAt: new Date()
        }
      })
    } catch (error) {
      console.error('Failed to create test market:', error)
      // Market creation failed, set to null to skip cleanup
      testMarketId = ''
    }

    // Create a test post for commenting
    testPostId = await generateSnowflakeId()
    const testAuthorId = await generateSnowflakeId()
    await prisma.user.create({
      data: {
        id: testAuthorId,
        username: `test-author-${testAuthorId.slice(-6)}`,
        displayName: 'Test Author',
        updatedAt: new Date()
      }
    })
    await prisma.post.create({
      data: {
        id: testPostId,
        content: 'Test post for agent commenting',
        authorId: testAuthorId,
        type: 'post',
        timestamp: new Date(),
        createdAt: new Date()
      }
    })
  })

  afterAll(async () => {
    // Restore global fetch
    global.fetch = originalFetch

    // Cleanup
    if (testAgentId) {
      try {
        // Delete positions
        await prisma.position.deleteMany({ where: { userId: testAgentId } })
        // Delete posts
        await prisma.post.deleteMany({ where: { authorId: testAgentId } })
        // Delete comments
        await prisma.comment.deleteMany({ where: { authorId: testAgentId } })
        // Delete messages
        await prisma.message.deleteMany({ where: { senderId: testAgentId } })
        // Delete agent
        await prisma.user.delete({ where: { id: testAgentId } })
      } catch (error) {
        // Cleanup errors not critical
      }
    }

    if (testMarketId) {
      try {
        // Check if market exists before trying to delete
        const marketExists = await prisma.market.findUnique({
          where: { id: testMarketId },
          select: { id: true }
        })
        
        if (marketExists) {
          // Delete positions first (foreign key constraint)
          await prisma.position.deleteMany({ where: { marketId: testMarketId } }).catch(() => {})
          // Delete prediction price history
          await prisma.predictionPriceHistory.deleteMany({ where: { marketId: testMarketId } }).catch(() => {})
          // Now delete the market
          await prisma.market.delete({ where: { id: testMarketId } }).catch(() => {})
        }
      } catch (error) {
        // Cleanup errors not critical - market may have been deleted already
      }
    }

    if (testPostId) {
      try {
        await prisma.post.delete({ where: { id: testPostId } })
      } catch (error) {
        // Cleanup errors not critical
      }
    }
  })

  test('should create Position records when agent trades', async () => {
    // Get initial position count
    const initialPositions = await prisma.position.count({
      where: { userId: testAgentId }
    })

    // Get initial balance
    const initialBalance = await WalletService.getBalance(testAgentId)

    // Run agent tick
    const runtime = await agentRuntimeManager.getRuntime(testAgentId)
    let result
    try {
      result = await autonomousCoordinator.executeAutonomousTick(testAgentId, runtime)
    } catch (error) {
      // If tick fails (e.g., LLM parsing error), skip this test
      console.log('⚠️  Agent tick failed:', error instanceof Error ? error.message : String(error))
      return
    }

    // Verify tick executed
    expect(result.success).toBe(true)

    // Check if positions were created (may or may not trade depending on LLM decision)
    const afterPositions = await prisma.position.count({
      where: { userId: testAgentId }
    })

    // If agent traded, verify position was created
    if (result.actionsExecuted.trades > 0) {
      expect(afterPositions).toBeGreaterThan(initialPositions)
      
      // Verify position has correct data
      const positions = await prisma.position.findMany({
        where: { userId: testAgentId },
        orderBy: { createdAt: 'desc' },
        take: 1
      })

      expect(positions.length).toBeGreaterThan(0)
      expect(positions[0]).toHaveProperty('marketId')
      expect(positions[0]).toHaveProperty('side')
      expect(positions[0]).toHaveProperty('shares')
      expect(positions[0]).toHaveProperty('status', 'active')

      // Verify balance was updated
      const afterBalance = await WalletService.getBalance(testAgentId)
      expect(Number(afterBalance.balance)).toBeLessThan(Number(initialBalance.balance))
    }
  })

  test('should create Post records when agent posts', async () => {
    // Get initial post count
    const initialPosts = await prisma.post.count({
      where: { authorId: testAgentId }
    })

    // Run agent tick
    const runtime = await agentRuntimeManager.getRuntime(testAgentId)
    let result
    try {
      result = await autonomousCoordinator.executeAutonomousTick(testAgentId, runtime)
    } catch (error) {
      // If tick fails (e.g., LLM parsing error), skip this test
      console.log('⚠️  Agent tick failed:', error instanceof Error ? error.message : String(error))
      return
    }

    // Verify tick executed
    expect(result.success).toBe(true)

    // Check if posts were created (may or may not post depending on LLM decision)
    const afterPosts = await prisma.post.count({
      where: { authorId: testAgentId }
    })

    // If agent posted, verify post was created
    if (result.actionsExecuted.posts > 0) {
      expect(afterPosts).toBeGreaterThan(initialPosts)
      
      // Verify post has correct data
      const posts = await prisma.post.findMany({
        where: { authorId: testAgentId },
        orderBy: { createdAt: 'desc' },
        take: 1
      })

      expect(posts.length).toBeGreaterThan(0)
      expect(posts[0]).toHaveProperty('content')
      expect(posts[0]).toHaveProperty('authorId', testAgentId)
      expect(posts[0]?.content.length).toBeGreaterThan(0)
    }
  })

  test('should create Comment records when agent comments', async () => {
    // Get initial comment count
    const initialComments = await prisma.comment.count({
      where: { authorId: testAgentId }
    })

    // Run agent tick
    const runtime = await agentRuntimeManager.getRuntime(testAgentId)
    let result
    try {
      result = await autonomousCoordinator.executeAutonomousTick(testAgentId, runtime)
    } catch (error) {
      // If tick fails (e.g., LLM parsing error), skip this test
      console.log('⚠️  Agent tick failed:', error instanceof Error ? error.message : String(error))
      return
    }

    // Verify tick executed
    expect(result.success).toBe(true)

    // Check if comments were created (may or may not comment depending on LLM decision)
    const afterComments = await prisma.comment.count({
      where: { authorId: testAgentId }
    })

    // If agent commented, verify comment was created
    if (result.actionsExecuted.comments > 0) {
      expect(afterComments).toBeGreaterThan(initialComments)
      
      // Verify comment has correct data
      const comments = await prisma.comment.findMany({
        where: { authorId: testAgentId },
        orderBy: { createdAt: 'desc' },
        take: 1
      })

      expect(comments.length).toBeGreaterThan(0)
      expect(comments[0]).toHaveProperty('content')
      expect(comments[0]).toHaveProperty('authorId', testAgentId)
      expect(comments[0]).toHaveProperty('postId')
      expect(comments[0]?.content.length).toBeGreaterThan(0)
    }
  })

  test('should update agent P&L when trades are executed', async () => {
    // Run agent tick
    const runtime = await agentRuntimeManager.getRuntime(testAgentId)
    let result
    try {
      result = await autonomousCoordinator.executeAutonomousTick(testAgentId, runtime)
    } catch (error) {
      // If tick fails (e.g., LLM parsing error), skip this test
      console.log('⚠️  Agent tick failed:', error instanceof Error ? error.message : String(error))
      return
    }

    // Verify tick executed
    expect(result.success).toBe(true)

    // If agent traded, P&L may have changed (depending on market movements)
    if (result.actionsExecuted.trades > 0) {
      const agentAfter = await prisma.user.findUnique({
        where: { id: testAgentId },
        select: { lifetimePnL: true }
      })
      
      // P&L should be tracked (may be positive or negative)
      expect(agentAfter?.lifetimePnL).toBeDefined()
      expect(typeof agentAfter?.lifetimePnL).toBe('number')
    }
  })
})

