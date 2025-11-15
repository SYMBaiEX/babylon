/**
 * Direct A2A Client Integration Test
 * 
 * Tests A2A client directly against the actual A2A API,
 * verifying all methods work correctly with full tracing.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { createHttpA2AClient } from '@/lib/a2a/client'
import { prisma } from '@/lib/prisma'
import { generateSnowflakeId } from '@/lib/snowflake'
import { ethers } from 'ethers'

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'
const A2A_ENDPOINT = process.env.BABYLON_A2A_ENDPOINT || `${BASE_URL}/api/a2a`

interface CallTrace {
  method: string
  success: boolean
  error?: string
  duration: number
}

class CallTracer {
  private traces: CallTrace[] = []

  record(method: string, success: boolean, duration: number, error?: string) {
    this.traces.push({ method, success, error, duration })
  }

  getTraces(): CallTrace[] {
    return [...this.traces]
  }

  getSuccessful(): CallTrace[] {
    return this.traces.filter(t => t.success)
  }

  getFailed(): CallTrace[] {
    return this.traces.filter(t => !t.success)
  }

  printSummary(): void {
    console.log('\n📊 A2A Client Call Summary:')
    console.log(`   Total calls: ${this.traces.length}`)
    console.log(`   Successful: ${this.getSuccessful().length}`)
    console.log(`   Failed: ${this.getFailed().length}`)
    
    const avgDuration = this.traces.reduce((sum, t) => sum + t.duration, 0) / this.traces.length
    console.log(`   Avg duration: ${avgDuration.toFixed(2)}ms`)
    
    if (this.getFailed().length > 0) {
      console.log('\n❌ Failed calls:')
      this.getFailed().forEach(trace => {
        console.log(`   - ${trace.method}: ${trace.error}`)
      })
    }
  }
}

describe('Direct A2A Client Integration', () => {
  let testAgent: { id: string; walletAddress: string | null }
  let client: ReturnType<typeof createHttpA2AClient>
  let tracer: CallTracer
  let serverAvailable = false

  beforeAll(async () => {
    // Check if server is running
    try {
      const healthResponse = await fetch(`${BASE_URL}/api/health`, { 
        signal: AbortSignal.timeout(2000) 
      })
      if (healthResponse.ok) {
        serverAvailable = true
        console.log('✅ Server available - running direct A2A client tests')
      } else {
        console.log('⚠️  Server not running - skipping A2A client tests')
        return
      }
    } catch (error) {
      console.log('⚠️  Server not available - skipping A2A client tests')
      return
    }

    // Create test agent
    const privateKey = process.env.AGENT_DEFAULT_PRIVATE_KEY || ethers.Wallet.createRandom().privateKey
    const wallet = new ethers.Wallet(privateKey)
    const testAgentId = await generateSnowflakeId()

    await prisma.user.deleteMany({
      where: { walletAddress: wallet.address }
    })

    testAgent = await prisma.user.create({
      data: {
        id: testAgentId,
        username: `test_a2a_client_${Date.now()}`,
        displayName: 'A2A Client Test Agent',
        walletAddress: wallet.address,
        isAgent: true,
        virtualBalance: 10000,
        reputationPoints: 1000,
        agentSystem: 'Test agent',
        agentModelTier: 'free',
        updatedAt: new Date()
      }
    })

    // Create A2A client
    client = createHttpA2AClient({
      endpoint: A2A_ENDPOINT,
      agentId: testAgent.id,
      address: wallet.address
    })

    tracer = new CallTracer()

    console.log(`✅ Created test agent: ${testAgent.id}`)
  })

  afterAll(async () => {
    if (testAgent) {
      await prisma.user.deleteMany({
        where: { id: testAgent.id }
      })
    }
  })

  // Helper to trace calls
  async function tracedCall<T>(
    method: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const start = Date.now()
    try {
      const result = await fn()
      const duration = Date.now() - start
      tracer.record(method, true, duration)
      return result
    } catch (error) {
      const duration = Date.now() - start
      tracer.record(method, false, duration, error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  test('Trading methods work correctly', async () => {
    if (!serverAvailable) {
      console.log('⏭️  Skipping - server not available')
      return
    }

    console.log('\n📈 Testing trading methods...')

    // Get predictions
    const predictions = await tracedCall('getPredictions', () =>
      client.getPredictions({ status: 'active' })
    )
    expect(predictions).toBeDefined()
    console.log('   ✅ getPredictions')

    // Get perpetuals
    const perpetuals = await tracedCall('getPerpetuals', () =>
      client.getPerpetuals()
    )
    expect(perpetuals).toBeDefined()
    console.log('   ✅ getPerpetuals')

    // Get trades
    const trades = await tracedCall('getTrades', () =>
      client.getTrades({ limit: 10 })
    )
    expect(trades).toBeDefined()
    console.log('   ✅ getTrades')

    // Get trade history
    const tradeHistory = await tracedCall('getTradeHistory', () =>
      client.getTradeHistory(testAgent.id, 10)
    )
    expect(tradeHistory).toBeDefined()
    console.log('   ✅ getTradeHistory')

    // Get balance
    const balance = await tracedCall('getBalance', () =>
      client.getBalance()
    )
    expect(balance).toBeDefined()
    console.log('   ✅ getBalance')

    // Get positions
    const positions = await tracedCall('getPositions', () =>
      client.getPositions()
    )
    expect(positions).toBeDefined()
    console.log('   ✅ getPositions')
  })

  test('Social methods work correctly', async () => {
    if (!serverAvailable) {
      console.log('⏭️  Skipping - server not available')
      return
    }

    console.log('\n📱 Testing social methods...')

    // Get feed
    const feed = await tracedCall('getFeed', () =>
      client.getFeed({ limit: 20, offset: 0 })
    )
    expect(feed).toBeDefined()
    console.log('   ✅ getFeed')

    // Get trending tags
    const trending = await tracedCall('getTrendingTags', () =>
      client.getTrendingTags(10)
    )
    expect(trending).toBeDefined()
    console.log('   ✅ getTrendingTags')

    // Create post
    const postResult = await tracedCall('createPost', () =>
      client.createPost('Test post from direct A2A client test', 'post')
    )
    expect(postResult).toBeDefined()
    console.log('   ✅ createPost')

    // Get a post ID from feed if available
    const feedData = await client.getFeed({ limit: 1 })
    if (feedData && typeof feedData === 'object' && 'posts' in feedData) {
      const posts = (feedData as { posts?: Array<{ id?: string }> }).posts
      if (posts && posts.length > 0 && posts[0]?.id) {
        const postId = posts[0].id

        // Like post
        const likeResult = await tracedCall('likePost', () =>
          client.likePost(postId)
        )
        expect(likeResult).toBeDefined()
        console.log('   ✅ likePost')

        // Get post
        const post = await tracedCall('getPost', () =>
          client.getPost(postId)
        )
        expect(post).toBeDefined()
        console.log('   ✅ getPost')

        // Get comments
        const comments = await tracedCall('getComments', () =>
          client.getComments(postId, 10)
        )
        expect(comments).toBeDefined()
        console.log('   ✅ getComments')
      }
    }
  })

  test('User management methods work correctly', async () => {
    if (!serverAvailable) {
      console.log('⏭️  Skipping - server not available')
      return
    }

    console.log('\n👤 Testing user management methods...')

    // Get user profile
    const profile = await tracedCall('getUserProfile', () =>
      client.getUserProfile(testAgent.id)
    )
    expect(profile).toBeDefined()
    console.log('   ✅ getUserProfile')

    // Get followers
    const followers = await tracedCall('getFollowers', () =>
      client.getFollowers(testAgent.id, 10)
    )
    expect(followers).toBeDefined()
    console.log('   ✅ getFollowers')

    // Get following
    const following = await tracedCall('getFollowing', () =>
      client.getFollowing(testAgent.id, 10)
    )
    expect(following).toBeDefined()
    console.log('   ✅ getFollowing')

    // Search users
    const searchResult = await tracedCall('searchUsers', () =>
      client.searchUsers('test', 10)
    )
    expect(searchResult).toBeDefined()
    console.log('   ✅ searchUsers')
  })

  test('Messaging methods work correctly', async () => {
    if (!serverAvailable) {
      console.log('⏭️  Skipping - server not available')
      return
    }

    console.log('\n💬 Testing messaging methods...')

    // Get chats
    const chats = await tracedCall('getChats', () =>
      client.getChats('all')
    )
    expect(chats).toBeDefined()
    console.log('   ✅ getChats')

    // Get unread count
    const unreadCount = await tracedCall('getUnreadCount', () =>
      client.getUnreadCount()
    )
    expect(unreadCount).toBeDefined()
    console.log('   ✅ getUnreadCount')
  })

  test('Notifications methods work correctly', async () => {
    if (!serverAvailable) {
      console.log('⏭️  Skipping - server not available')
      return
    }

    console.log('\n🔔 Testing notification methods...')

    // Get notifications
    const notifications = await tracedCall('getNotifications', () =>
      client.getNotifications(20)
    )
    expect(notifications).toBeDefined()
    console.log('   ✅ getNotifications')

    // Get group invites
    const groupInvites = await tracedCall('getGroupInvites', () =>
      client.getGroupInvites()
    )
    expect(groupInvites).toBeDefined()
    console.log('   ✅ getGroupInvites')
  })

  test('Stats and discovery methods work correctly', async () => {
    if (!serverAvailable) {
      console.log('⏭️  Skipping - server not available')
      return
    }

    console.log('\n📊 Testing stats and discovery methods...')

    // Get leaderboard
    const leaderboard = await tracedCall('getLeaderboard', () =>
      client.getLeaderboard({ page: 1, pageSize: 10 })
    )
    expect(leaderboard).toBeDefined()
    console.log('   ✅ getLeaderboard')

    // Get user stats
    const userStats = await tracedCall('getUserStats', () =>
      client.getUserStats(testAgent.id)
    )
    expect(userStats).toBeDefined()
    console.log('   ✅ getUserStats')

    // Get system stats
    const systemStats = await tracedCall('getSystemStats', () =>
      client.getSystemStats()
    )
    expect(systemStats).toBeDefined()
    console.log('   ✅ getSystemStats')

    // Get reputation
    const reputation = await tracedCall('getReputation', () =>
      client.getReputation(testAgent.id)
    )
    expect(reputation).toBeDefined()
    console.log('   ✅ getReputation')

    // Get organizations
    const organizations = await tracedCall('getOrganizations', () =>
      client.getOrganizations(10)
    )
    expect(organizations).toBeDefined()
    console.log('   ✅ getOrganizations')
  })

  test('All methods complete without errors', async () => {
    if (!serverAvailable) {
      console.log('⏭️  Skipping - server not available')
      return
    }

    tracer.printSummary()

    const failed = tracer.getFailed()
    expect(failed.length).toBe(0)

    const successful = tracer.getSuccessful()
    expect(successful.length).toBeGreaterThan(0)

    console.log(`\n✅ All ${successful.length} A2A client calls completed successfully`)
  })
})

