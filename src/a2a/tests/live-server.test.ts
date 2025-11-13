/**
 * Live Server Test Script
 * Tests A2A connection to the live Babylon server
 * Run this to verify agents can connect and use all features
 */

import WebSocket from 'ws'
import { ethers } from 'ethers'

// Configuration
const SERVER_URL = process.env.A2A_SERVER_URL || 'ws://localhost:8765'
const TEST_PRIVATE_KEY = process.env.A2A_TEST_PRIVATE_KEY || ethers.Wallet.createRandom().privateKey

// Test class
class LiveServerTest {
  private ws: WebSocket | null = null
  private wallet: ethers.Wallet
  private agentId: string | null = null
  private messageId = 0
  private pendingRequests = new Map<number, {
    resolve: (value: Record<string, unknown>) => void
    reject: (reason: Error) => void
  }>()

  constructor() {
    this.wallet = new ethers.Wallet(TEST_PRIVATE_KEY)
  }

  async connect(): Promise<void> {
    console.log('\n🔌 Connecting to A2A server...')
    console.log(`   URL: ${SERVER_URL}`)
    console.log(`   Wallet: ${this.wallet.address}\n`)

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(SERVER_URL)

      this.ws.on('open', async () => {
        console.log('✅ WebSocket connected')
        try {
          await this.authenticate()
          console.log('✅ Authentication successful\n')
          resolve()
        } catch (error) {
          reject(error)
        }
      })

      this.ws.on('message', (data: Buffer) => {
        this.handleMessage(data)
      })

      this.ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error.message)
        reject(error)
      })

      this.ws.on('close', () => {
        console.log('\n🔌 Connection closed')
      })

      setTimeout(() => {
        reject(new Error('Connection timeout'))
      }, 10000)
    })
  }

  private async authenticate(): Promise<void> {
    const timestamp = Date.now()
    const message = `A2A Authentication\n\nAddress: ${this.wallet.address}\nToken ID: 1\nTimestamp: ${timestamp}`
    const signature = await this.wallet.signMessage(message)

    const result = await this.sendRequest('a2a.handshake', {
      credentials: {
        address: this.wallet.address,
        tokenId: 1,
        signature,
        timestamp
      },
      capabilities: {
        strategies: ['momentum', 'test'],
        markets: ['prediction', 'perpetual'],
        actions: ['trade', 'social', 'chat'],
        version: '1.0.0'
      },
      endpoint: SERVER_URL
    })

    this.agentId = result.agentId
    console.log(`✅ Authenticated as: ${this.agentId}`)
    console.log(`   Session token: ${result.sessionToken.slice(0, 16)}...`)
    console.log(`   Server capabilities: ${result.serverCapabilities.join(', ')}`)
  }

  private handleMessage(data: Buffer): void {
    const message = JSON.parse(data.toString())

    if (message.id !== undefined && message.id !== null) {
      const pending = this.pendingRequests.get(message.id)
      if (pending) {
        this.pendingRequests.delete(message.id)
        if (message.error) {
          pending.reject(new Error(message.error.message))
        } else {
          pending.resolve(message.result)
        }
      }
    }
  }

  private sendRequest(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const id = this.messageId++
      const request = {
        jsonrpc: '2.0',
        method,
        params,
        id
      }

      this.pendingRequests.set(id, { resolve, reject })
      this.ws!.send(JSON.stringify(request))

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          reject(new Error('Request timeout'))
        }
      }, 30000)
    })
  }

  async runTests(): Promise<void> {
    console.log('🧪 Running Live Server Tests\n')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    const tests = [
      // Authentication & Discovery
      { name: 'Get balance', method: 'a2a.getBalance', params: {} },
      { name: 'Discover agents', method: 'a2a.discover', params: { limit: 5 } },

      // Markets & Trading
      { name: 'Get predictions', method: 'a2a.getPredictions', params: {} },
      { name: 'Get perpetuals', method: 'a2a.getPerpetuals', params: {} },
      { name: 'Get positions', method: 'a2a.getPositions', params: {} },
      { name: 'Get trades', method: 'a2a.getTrades', params: { limit: 10 } },

      // Social Features
      { name: 'Get feed', method: 'a2a.getFeed', params: { limit: 10 } },
      { name: 'Create post', method: 'a2a.createPost', params: { content: 'Test post from A2A live test' } },

      // User Management
      { name: 'Search users', method: 'a2a.searchUsers', params: { query: 'test', limit: 5 } },

      // Chats & Messaging
      { name: 'Get chats', method: 'a2a.getChats', params: {} },
      { name: 'Get unread count', method: 'a2a.getUnreadCount', params: {} },

      // Notifications
      { name: 'Get notifications', method: 'a2a.getNotifications', params: { limit: 10 } },
      { name: 'Get group invites', method: 'a2a.getGroupInvites', params: {} },

      // Leaderboard & Stats
      { name: 'Get leaderboard', method: 'a2a.getLeaderboard', params: { page: 1, pageSize: 10 } },
      { name: 'Get system stats', method: 'a2a.getSystemStats', params: {} },

      // Rewards & Referrals
      { name: 'Get referrals', method: 'a2a.getReferrals', params: {} },
      { name: 'Get referral stats', method: 'a2a.getReferralStats', params: {} },
      { name: 'Get referral code', method: 'a2a.getReferralCode', params: {} },

      // Reputation
      { name: 'Get reputation', method: 'a2a.getReputation', params: {} },

      // Trending & Discovery
      { name: 'Get trending tags', method: 'a2a.getTrendingTags', params: { limit: 10 } },
      { name: 'Get organizations', method: 'a2a.getOrganizations', params: {} },

      // Pools
      { name: 'Get pools', method: 'a2a.getPools', params: {} },
    ]

    let passed = 0
    let failed = 0

    for (const test of tests) {
      try {
        const startTime = Date.now()
        const result = await this.sendRequest(test.method, test.params)
        const duration = Date.now() - startTime

        console.log(`✅ ${test.name}`)
        console.log(`   Method: ${test.method}`)
        console.log(`   Duration: ${duration}ms`)
        console.log(`   Result: ${JSON.stringify(result).slice(0, 100)}...`)
        console.log()

        passed++
      } catch (error) {
        console.log(`❌ ${test.name}`)
        console.log(`   Method: ${test.method}`)
        console.log(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
        console.log()

        failed++
      }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
    console.log('📊 Test Results:\n')
    console.log(`   ✅ Passed: ${passed}/${tests.length}`)
    console.log(`   ❌ Failed: ${failed}/${tests.length}`)
    console.log(`   Success Rate: ${((passed / tests.length) * 100).toFixed(1)}%\n`)

    if (passed === tests.length) {
      console.log('🎉 ALL TESTS PASSED - A2A SERVER IS FULLY OPERATIONAL!\n')
    } else {
      console.log('⚠️  Some tests failed - check configuration and server status\n')
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }
}

// Run tests
async function main() {
  console.log('\n╔════════════════════════════════════════╗')
  console.log('║  A2A Live Server Test Suite           ║')
  console.log('╚════════════════════════════════════════╝')

  const test = new LiveServerTest()

  try {
    await test.connect()
    await test.runTests()
  } catch (error) {
    console.error('\n❌ Test suite failed:', error instanceof Error ? error.message : error)
    process.exit(1)
  } finally {
    test.disconnect()
  }

  process.exit(0)
}

// Run if executed directly
if (import.meta.main) {
  main()
}

export { LiveServerTest }

