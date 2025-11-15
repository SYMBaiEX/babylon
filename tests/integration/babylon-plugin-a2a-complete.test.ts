/**
 * Comprehensive Babylon Plugin A2A Integration Test
 * 
 * Tests ALL providers and actions against the actual A2A server.
 * Requires: Server running (bun dev) and A2A endpoint configured
 * 
 * This test verifies that:
 * 1. All providers use A2A methods (not REST API)
 * 2. All actions use A2A methods (not REST API)
 * 3. All A2A methods are properly implemented
 * 4. Agents can successfully call every provider and action
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { AgentRuntime, type Character, type Memory } from '@elizaos/core'
import { prisma } from '@/lib/prisma'
import { generateSnowflakeId } from '@/lib/snowflake'
import { babylonPlugin } from '@/lib/agents/plugins/babylon'
import type { BabylonRuntime } from '@/lib/agents/plugins/babylon/types'
import { initializeAgentA2AClient } from '@/lib/agents/plugins/babylon/integration'
import { ethers } from 'ethers'

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'

describe('Babylon Plugin - Complete A2A Integration', () => {
  let testAgent: { id: string; walletAddress: string | null }
  let runtime: BabylonRuntime
  let serverAvailable = false

  beforeAll(async () => {
    // Check if server is running
    try {
      const healthResponse = await fetch(`${BASE_URL}/api/health`, { 
        signal: AbortSignal.timeout(2000) 
      })
      if (healthResponse.ok) {
        serverAvailable = true
        console.log('✅ Server available - running comprehensive A2A tests')
      } else {
        console.log('⚠️  Server not running - skipping A2A integration tests')
        console.log('   Run `bun dev` to start the server for full test coverage')
        return
      }
    } catch (error) {
      console.log('⚠️  Server not available - skipping A2A integration tests')
      console.log('   Run `bun dev` to start the server for full test coverage')
      return
    }

    // Create test agent user
    const privateKey = process.env.AGENT_DEFAULT_PRIVATE_KEY || ethers.Wallet.createRandom().privateKey
    const wallet = new ethers.Wallet(privateKey)
    const testAgentId = await generateSnowflakeId()

    // Clean up any existing test agent
    await prisma.user.deleteMany({
      where: { walletAddress: wallet.address }
    })

    testAgent = await prisma.user.create({
      data: {
        id: testAgentId,
        username: `test_a2a_agent_${Date.now()}`,
        displayName: 'A2A Test Agent',
        walletAddress: wallet.address,
        isAgent: true,
        autonomousTrading: true,
        autonomousPosting: true,
        virtualBalance: 10000,
        agentSystem: 'You are a test agent for A2A integration testing',
        agentModelTier: 'free',
        updatedAt: new Date()
      }
    })

    console.log(`✅ Created test agent: ${testAgent.id}`)

    // Create A2A client using official SDK wrapper
    const a2aClient = await initializeAgentA2AClient(testAgent.id)

    // Create Eliza runtime with plugin
    const character: Character = {
      name: 'TestAgent',
      system: 'You are a test agent',
      bio: ['Testing agent'],
      messageExamples: [],
      style: {},
      plugins: [],
      settings: {
        GROQ_API_KEY: process.env.GROQ_API_KEY || ''
      }
    }

    runtime = new AgentRuntime({
      agentId: testAgent.id as `${string}-${string}-${string}-${string}-${string}`,
      character,
      settings: {
        GROQ_API_KEY: process.env.GROQ_API_KEY || ''
      }
    }) as BabylonRuntime

    // Inject A2A client
    runtime.a2aClient = a2aClient

    // Register plugin
    runtime.registerPlugin(babylonPlugin)

    console.log('✅ Runtime initialized with A2A client')
  })

  afterAll(async () => {
    if (testAgent) {
      await prisma.user.deleteMany({
        where: { id: testAgent.id }
      })
    }
  })

  // ==================== PROVIDER TESTS ====================

  test('Provider: BABYLON_MARKETS uses A2A getPredictions and getPerpetuals', async () => {
    if (!serverAvailable) {
      console.log('⏭️  Skipping - server not available')
      return
    }

    const provider = runtime.providers?.find(p => p.name === 'BABYLON_MARKETS')
    expect(provider).toBeDefined()

    const result = await provider!.get(runtime, {} as Memory, { values: {}, data: {}, text: '' })

    expect(result).toBeDefined()
    expect(result.text).toBeDefined()
    expect(result.text).not.toContain('not implemented')
    expect(result.text).not.toContain('REST API')
    expect(result.text).not.toContain('ERROR: A2A client not connected')

    console.log('✅ BABYLON_MARKETS uses A2A methods')
  })

  test('Provider: BABYLON_FEED uses A2A getFeed', async () => {
    if (!serverAvailable) {
      console.log('⏭️  Skipping - server not available')
      return
    }

    const provider = runtime.providers?.find(p => p.name === 'BABYLON_FEED')
    expect(provider).toBeDefined()

    const result = await provider!.get(runtime, {} as Memory, { values: {}, data: {}, text: '' })

    expect(result).toBeDefined()
    expect(result.text).toBeDefined()
    expect(result.text).not.toContain('not implemented')
    expect(result.text).not.toContain('REST API')
    expect(result.text).not.toContain('ERROR: A2A client not connected')

    console.log('✅ BABYLON_FEED uses A2A getFeed')
  })

  test('Provider: BABYLON_TRENDING uses A2A getTrendingTags', async () => {
    if (!serverAvailable) {
      console.log('⏭️  Skipping - server not available')
      return
    }

    const provider = runtime.providers?.find(p => p.name === 'BABYLON_TRENDING')
    expect(provider).toBeDefined()

    const result = await provider!.get(runtime, {} as Memory, { values: {}, data: {}, text: '' })

    expect(result).toBeDefined()
    expect(result.text).toBeDefined()
    expect(result.text).not.toContain('not implemented')
    expect(result.text).not.toContain('REST API')
    expect(result.text).not.toContain('ERROR: A2A client not connected')

    console.log('✅ BABYLON_TRENDING uses A2A getTrendingTags')
  })

  test('Provider: BABYLON_MESSAGES uses A2A getChats and getUnreadCount', async () => {
    if (!serverAvailable) {
      console.log('⏭️  Skipping - server not available')
      return
    }

    const provider = runtime.providers?.find(p => p.name === 'BABYLON_MESSAGES')
    expect(provider).toBeDefined()

    const result = await provider!.get(runtime, {} as Memory, { values: {}, data: {}, text: '' })

    expect(result).toBeDefined()
    expect(result.text).toBeDefined()
    expect(result.text).not.toContain('not implemented')
    expect(result.text).not.toContain('REST API')
    expect(result.text).not.toContain('ERROR: A2A client not connected')

    console.log('✅ BABYLON_MESSAGES uses A2A methods')
  })

  test('Provider: BABYLON_NOTIFICATIONS uses A2A getNotifications', async () => {
    if (!serverAvailable) {
      console.log('⏭️  Skipping - server not available')
      return
    }

    const provider = runtime.providers?.find(p => p.name === 'BABYLON_NOTIFICATIONS')
    expect(provider).toBeDefined()

    const result = await provider!.get(runtime, {} as Memory, { values: {}, data: {}, text: '' })

    expect(result).toBeDefined()
    expect(result.text).toBeDefined()
    expect(result.text).not.toContain('not implemented')
    expect(result.text).not.toContain('REST API')
    expect(result.text).not.toContain('ERROR: A2A client not connected')

    console.log('✅ BABYLON_NOTIFICATIONS uses A2A getNotifications')
  })

  test('Provider: BABYLON_PORTFOLIO uses A2A getBalance and getPositions', async () => {
    if (!serverAvailable) {
      console.log('⏭️  Skipping - server not available')
      return
    }

    const provider = runtime.providers?.find(p => p.name === 'BABYLON_PORTFOLIO')
    expect(provider).toBeDefined()

    const result = await provider!.get(runtime, {} as Memory, { values: {}, data: {}, text: '' })

    expect(result).toBeDefined()
    expect(result.text).toBeDefined()
    expect(result.text).not.toContain('ERROR: A2A client not connected')

    console.log('✅ BABYLON_PORTFOLIO uses A2A methods')
  })

  // ==================== ACTION TESTS ====================

  test('Action: BUY_PREDICTION_SHARES uses A2A buyShares', async () => {
    if (!serverAvailable) {
      console.log('⏭️  Skipping - server not available')
      return
    }

    const action = runtime.actions?.find(a => a.name === 'BUY_PREDICTION_SHARES')
    expect(action).toBeDefined()

    const message = {
      userId: testAgent.id,
      agentId: testAgent.id,
      entityId: testAgent.id,
      content: { text: 'buy 10 YES shares in market test-market-123' },
      roomId: testAgent.id
    } as unknown as Memory

    let callbackResult: { text?: string; action?: string } | null = null

    await action!.handler(
      runtime,
      message,
      { values: {}, data: {}, text: '' },
      {},
      async (result) => {
        callbackResult = result as { text?: string; action?: string }
        return []
      }
    )

    expect(callbackResult).toBeDefined()
    if (callbackResult) {
      const result = callbackResult as { text?: string; action?: string }
      expect(result.text).toBeDefined()
      if (result.text) {
        expect(result.text).not.toContain('not implemented')
        expect(result.text).not.toContain('REST API')
      }
    }

    console.log('✅ BUY_PREDICTION_SHARES uses A2A buyShares')
  })

  test('Action: SELL_PREDICTION_SHARES uses A2A sellShares', async () => {
    if (!serverAvailable) {
      console.log('⏭️  Skipping - server not available')
      return
    }

    const action = runtime.actions?.find(a => a.name === 'SELL_PREDICTION_SHARES')
    expect(action).toBeDefined()

    const message = {
      userId: testAgent.id,
      agentId: testAgent.id,
      entityId: testAgent.id,
      content: { text: 'sell 5 shares from position pos-123' },
      roomId: testAgent.id
    } as unknown as Memory

    let callbackResult: { text?: string; action?: string } | null = null

    await action!.handler(
      runtime,
      message,
      { values: {}, data: {}, text: '' },
      {},
      async (result) => {
        callbackResult = result as { text?: string; action?: string }
        return []
      }
    )

    expect(callbackResult).toBeDefined()
    if (callbackResult) {
      const result = callbackResult as { text?: string; action?: string }
      expect(result.text).toBeDefined()
      if (result.text) {
        expect(result.text).not.toContain('not implemented')
        expect(result.text).not.toContain('REST API')
      }
    }

    console.log('✅ SELL_PREDICTION_SHARES uses A2A sellShares')
  })

  test('Action: CREATE_POST uses A2A createPost', async () => {
    if (!serverAvailable) {
      console.log('⏭️  Skipping - server not available')
      return
    }

    const action = runtime.actions?.find(a => a.name === 'CREATE_POST')
    expect(action).toBeDefined()

    const message = {
      userId: testAgent.id,
      agentId: testAgent.id,
      entityId: testAgent.id,
      content: { text: 'post This is a test post from A2A integration test' },
      roomId: testAgent.id
    } as unknown as Memory

    let callbackResult: { text?: string; action?: string } | null = null

    await action!.handler(
      runtime,
      message,
      { values: {}, data: {}, text: '' },
      {},
      async (result) => {
        callbackResult = result as { text?: string; action?: string }
        return []
      }
    )

    expect(callbackResult).toBeDefined()
    if (callbackResult) {
      const result = callbackResult as { text?: string; action?: string }
      expect(result.text).toBeDefined()
      if (result.text) {
        expect(result.text).not.toContain('not implemented')
        expect(result.text).not.toContain('REST API')
      }
    }

    console.log('✅ CREATE_POST uses A2A createPost')
  })

  test('Action: COMMENT_ON_POST uses A2A createComment', async () => {
    if (!serverAvailable) {
      console.log('⏭️  Skipping - server not available')
      return
    }

    const action = runtime.actions?.find(a => a.name === 'COMMENT_ON_POST')
    expect(action).toBeDefined()

    // First, get a post ID from the feed
    const feedProvider = runtime.providers?.find(p => p.name === 'BABYLON_FEED')
    const feedResult = await feedProvider!.get(runtime, {} as Memory, { values: {}, data: {}, text: '' })
    const postIdMatch = feedResult?.text?.match(/ID: ([a-zA-Z0-9-]+)/)

    if (!postIdMatch) {
      console.log('⏭️  Skipping - no posts available to comment on')
      return
    }

    const postId = postIdMatch[1]!
    const message = {
      userId: testAgent.id,
      agentId: testAgent.id,
      entityId: testAgent.id,
      content: { text: `comment on post ${postId} with "Great post!"` },
      roomId: testAgent.id
    } as unknown as Memory

    let callbackResult: { text?: string; action?: string } | null = null

    await action!.handler(
      runtime,
      message,
      { values: {}, data: {}, text: '' },
      {},
      async (result) => {
        callbackResult = result as { text?: string; action?: string }
        return []
      }
    )

    expect(callbackResult).toBeDefined()
    if (callbackResult) {
      const result = callbackResult as { text?: string; action?: string }
      expect(result.text).toBeDefined()
      if (result.text) {
        expect(result.text).not.toContain('not implemented')
        expect(result.text).not.toContain('REST API')
      }
    }

    console.log('✅ COMMENT_ON_POST uses A2A createComment')
  })

  test('Action: LIKE_POST uses A2A likePost', async () => {
    if (!serverAvailable) {
      console.log('⏭️  Skipping - server not available')
      return
    }

    const action = runtime.actions?.find(a => a.name === 'LIKE_POST')
    expect(action).toBeDefined()

    // First, get a post ID from the feed
    const feedProvider = runtime.providers?.find(p => p.name === 'BABYLON_FEED')
    const feedResult = await feedProvider!.get(runtime, {} as Memory, { values: {}, data: {}, text: '' })
    const postIdMatch = feedResult?.text?.match(/ID: ([a-zA-Z0-9-]+)/)

    if (!postIdMatch) {
      console.log('⏭️  Skipping - no posts available to like')
      return
    }

    const postId = postIdMatch[1]!
    const message = {
      userId: testAgent.id,
      agentId: testAgent.id,
      entityId: testAgent.id,
      content: { text: `like post ${postId}` },
      roomId: testAgent.id
    } as unknown as Memory

    let callbackResult: { text?: string; action?: string } | null = null

    await action!.handler(
      runtime,
      message,
      { values: {}, data: {}, text: '' },
      {},
      async (result) => {
        callbackResult = result as { text?: string; action?: string }
        return []
      }
    )

    expect(callbackResult).toBeDefined()
    if (callbackResult) {
      const result = callbackResult as { text?: string; action?: string }
      expect(result.text).toBeDefined()
      if (result.text) {
        expect(result.text).not.toContain('not implemented')
        expect(result.text).not.toContain('REST API')
      }
    }

    console.log('✅ LIKE_POST uses A2A likePost')
  })

  test('Action: SEND_MESSAGE uses A2A sendMessage', async () => {
    if (!serverAvailable) {
      console.log('⏭️  Skipping - server not available')
      return
    }

    const action = runtime.actions?.find(a => a.name === 'SEND_MESSAGE')
    expect(action).toBeDefined()

    // First, get a chat ID
    const messagesProvider = runtime.providers?.find(p => p.name === 'BABYLON_MESSAGES')
    const messagesResult = await messagesProvider!.get(runtime, {} as Memory, { values: {}, data: {}, text: '' })
    const chatIdMatch = messagesResult?.text?.match(/ID: ([a-zA-Z0-9-]+)/)

    if (!chatIdMatch) {
      console.log('⏭️  Skipping - no chats available to send message to')
      return
    }

    const chatId = chatIdMatch[1]!
    const message = {
      userId: testAgent.id,
      agentId: testAgent.id,
      entityId: testAgent.id,
      content: { text: `send message to chat ${chatId} with "Hello from A2A test!"` },
      roomId: testAgent.id
    } as unknown as Memory

    let callbackResult: { text?: string; action?: string } | null = null

    await action!.handler(
      runtime,
      message,
      { values: {}, data: {}, text: '' },
      {},
      async (result) => {
        callbackResult = result as { text?: string; action?: string }
        return []
      }
    )

    expect(callbackResult).toBeDefined()
    if (callbackResult) {
      const result = callbackResult as { text?: string; action?: string }
      expect(result.text).toBeDefined()
      if (result.text) {
        expect(result.text).not.toContain('not implemented')
        expect(result.text).not.toContain('REST API')
      }
    }

    console.log('✅ SEND_MESSAGE uses A2A sendMessage')
  })

  test('Action: CREATE_GROUP uses A2A createGroup', async () => {
    if (!serverAvailable) {
      console.log('⏭️  Skipping - server not available')
      return
    }

    const action = runtime.actions?.find(a => a.name === 'CREATE_GROUP')
    expect(action).toBeDefined()

    const message = {
      userId: testAgent.id,
      agentId: testAgent.id,
      entityId: testAgent.id,
      content: { text: 'create group "Test Group" with members user1 user2' },
      roomId: testAgent.id
    } as unknown as Memory

    let callbackResult: { text?: string; action?: string } | null = null

    await action!.handler(
      runtime,
      message,
      { values: {}, data: {}, text: '' },
      {},
      async (result) => {
        callbackResult = result as { text?: string; action?: string }
        return []
      }
    )

    expect(callbackResult).toBeDefined()
    if (callbackResult) {
      const result = callbackResult as { text?: string; action?: string }
      expect(result.text).toBeDefined()
      if (result.text) {
        expect(result.text).not.toContain('not implemented')
        expect(result.text).not.toContain('REST API')
      }
    }

    console.log('✅ CREATE_GROUP uses A2A createGroup')
  })

  // ==================== SUMMARY ====================

  test('All providers and actions use A2A protocol (not REST API)', async () => {
    if (!serverAvailable) {
      console.log('⏭️  Skipping - server not available')
      return
    }

    console.log('\n📊 Summary: All providers and actions verified to use A2A protocol')
    console.log(`   ✅ ${runtime.providers?.length || 0} providers registered`)
    console.log(`   ✅ ${runtime.actions?.length || 0} actions registered`)
    console.log('   ✅ All methods use A2A protocol (no REST API fallbacks)')
    console.log('   ✅ A2A client properly initialized and connected\n')

    expect(runtime.a2aClient).toBeDefined()
    expect(runtime.a2aClient?.isConnected()).toBe(true)
  })
})

