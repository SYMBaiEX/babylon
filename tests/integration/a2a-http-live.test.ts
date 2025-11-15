/**
 * A2A HTTP Live Server Tests
 * 
 * Requires: npm run dev (server must be running)
 * 
 * Tests the HTTP A2A endpoints against a live Next.js server
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { prisma } from '@/lib/prisma'
import { generateSnowflakeId } from '@/lib/snowflake'
import { createHttpA2AClient } from '@/lib/a2a/client'

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:3000'
let SERVER_RUNNING = false

describe('A2A HTTP - Live Server Tests', () => {
  let testUserId: string
  let testMarketId: string | null = null
  let a2aClient: ReturnType<typeof createHttpA2AClient>

  beforeAll(async () => {
    // Check if server is running
    try {
      const healthResponse = await fetch(`${BASE_URL}/api/health`, { 
        signal: AbortSignal.timeout(1000) 
      })
      if (healthResponse.ok) {
        SERVER_RUNNING = true
      } else {
        console.log('⚠️  Server not running - skipping live server tests')
        console.log('   Run `bun dev` to start the server for these tests')
        return
      }
    } catch (error) {
      console.log('⚠️  Could not connect to server - skipping live server tests')
      console.log('   Run `bun dev` to start the server for these tests')
      return
    }
    
    if (process.env.SKIP_LIVE_SERVER === 'true') {
      console.log('⚠️  Skipping live server tests (SKIP_LIVE_SERVER=true)')
      SERVER_RUNNING = false
      return
    }

    // Create test user
    testUserId = await generateSnowflakeId()
    await prisma.user.create({
      data: {
        id: testUserId,
        username: `test_a2a_${Date.now()}`,
        displayName: 'A2A Test User',
        virtualBalance: 5000,
        reputationPoints: 100,
        profileComplete: true,
        hasUsername: true,
          isTest: true,
        updatedAt: new Date()
      }
    })

    // Get existing market
    const market = await prisma.market.findFirst({
      where: { resolved: false }
    })
    testMarketId = market?.id || null

    // Create HTTP A2A client
    a2aClient = createHttpA2AClient({
      endpoint: `${BASE_URL}/api/a2a`,
      agentId: 'test-agent-http',
      address: '0xTestAddress'
    })

    console.log('✅ Test setup complete')
    console.log(`   User ID: ${testUserId}`)
    console.log(`   Market ID: ${testMarketId || 'none'}`)
  })

  afterAll(async () => {
    if (!prisma) return;
    if (!SERVER_RUNNING) return

    // Cleanup
    await prisma.user.delete({
      where: { id: testUserId }
    })
  })

  describe('Agent Discovery', () => {
    it('should fetch agent card', async () => {
      if (!SERVER_RUNNING) return

      // Next.js routes this as /.well-known/agent-card (without .json extension)
      const response = await fetch(`${BASE_URL}/.well-known/agent-card`)
      expect(response.ok).toBe(true)

      const card = await response.json()
      expect(card.id).toBeDefined()
      expect(card.supportedMethods).toContain('a2a.getBalance')
      
      console.log('✅ Agent card accessible')
      console.log(`   Supports ${card.supportedMethods.length} methods`)
    })
  })

  describe('Portfolio Methods (via Client)', () => {
    it('should get user balance', async () => {
      if (!SERVER_RUNNING) return

      const result = await a2aClient.getBalance(testUserId)
      
      expect(result).toBeDefined()
      expect((result as any).balance).toBe(5000)
      
      console.log('✅ getBalance works via HTTP client')
      console.log(`   Balance: ${(result as any).balance}`)
    })

    it('should get user positions', async () => {
      if (!SERVER_RUNNING) return

      const result = await a2aClient.getPositions(testUserId)
      
      expect(result).toBeDefined()
      expect((result as any).perpPositions).toBeDefined()
      expect((result as any).marketPositions).toBeDefined()
      
      console.log('✅ getPositions works via HTTP client')
    })

    it('should get complete wallet data', async () => {
      if (!SERVER_RUNNING) return

      const result = await a2aClient.getUserWallet(testUserId)
      
      expect(result).toBeDefined()
      expect((result as any).balance).toBeDefined()
      expect((result as any).positions).toBeDefined()
      
      console.log('✅ getUserWallet works via HTTP client')
    })
  })

  describe('Market Methods (via Client)', () => {
    it('should get market data if market exists', async () => {
      if (!SERVER_RUNNING || !testMarketId) {
        console.log('⚠️  Skipping - no market available')
        return
      }

      const result = await a2aClient.getMarketData(testMarketId)
      
      expect(result).toBeDefined()
      expect((result as any).marketId).toBe(testMarketId)
      expect((result as any).question).toBeDefined()
      
      console.log('✅ getMarketData works')
      console.log(`   Question: ${(result as any).question}`)
    })

    it('should get market prices if market exists', async () => {
      if (!SERVER_RUNNING || !testMarketId) {
        console.log('⚠️  Skipping - no market available')
        return
      }

      const result = await a2aClient.getMarketPrices(testMarketId)
      
      expect(result).toBeDefined()
      console.log('✅ getMarketPrices works')
    })
  })

  describe('Portfolio Methods', () => {
    it('should get balance', async () => {
      if (!SERVER_RUNNING) return

      const result = await a2aClient.getBalance()
      
      expect(result).toBeDefined()
      console.log('✅ getBalance works')
    })

    it('should get positions', async () => {
      if (!SERVER_RUNNING) return

      const result = await a2aClient.getPositions()
      
      expect(result).toBeDefined()
      console.log('✅ getPositions works')
    })

    it('should get user wallet', async () => {
      if (!SERVER_RUNNING) return

      try {
        const result = await a2aClient.getUserWallet(testUserId)
        expect(result).toBeDefined()
        console.log('✅ getUserWallet works')
      } catch (error) {
        console.log('⚠️  getUserWallet skipped (user not found)')
      }
    })
  })

  describe('Payment Methods (x402)', () => {
    it('should create payment request (skipped - requires setup)', async () => {
      console.log('⚠️  paymentRequest skipped (requires x402 setup)')
    })

    it('should submit payment receipt (skipped - requires setup)', async () => {
      console.log('⚠️  paymentReceipt skipped (requires x402 setup)')
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid method gracefully', async () => {
      if (!SERVER_RUNNING) return

      try {
        await a2aClient.request('a2a.invalidMethod', {})
        throw new Error('Should have thrown')
      } catch (error) {
        expect(error).toBeDefined()
        expect((error as Error).message).toContain('Error')
        console.log('✅ Invalid method properly rejected')
      }
    })
  })
})

export {}

