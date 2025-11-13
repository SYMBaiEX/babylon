/**
 * User Wallet Feature Integration Test
 * Tests the new wallet display and A2A integration for user profiles
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals'
import { A2AClient } from '@/lib/a2a/client'
import { prisma } from '@/lib/prisma'

describe('User Wallet Feature', () => {
  let testUserId: string
  let a2aClient: A2AClient | null = null

  beforeAll(async () => {
    // Create a test user with balance and positions
    const testUser = await prisma.user.create({
      data: {
        privyId: `test_user_wallet_${Date.now()}`,
        username: `test_wallet_${Date.now()}`,
        displayName: 'Test Wallet User',
        walletAddress: '0x' + '0'.repeat(40),
        virtualBalance: 10000,
        totalDeposited: 15000,
        totalWithdrawn: 5000,
        lifetimePnL: 2500,
        reputationPoints: 500,
        isAgent: false,
      },
    })
    testUserId = testUser.id

    // Create some test positions
    const testMarket = await prisma.market.create({
      data: {
        question: 'Will this test pass?',
        description: 'Testing wallet feature',
        endDate: new Date(Date.now() + 86400000),
        resolved: false,
        yesShares: 1000,
        noShares: 1000,
        liquidity: 2000,
      },
    })

    await prisma.position.create({
      data: {
        userId: testUserId,
        marketId: testMarket.id,
        side: 'YES',
        shares: 100,
        avgPrice: 0.5,
      },
    })
  })

  afterAll(async () => {
    // Cleanup
    if (testUserId) {
      await prisma.position.deleteMany({ where: { userId: testUserId } })
      await prisma.perpPosition.deleteMany({ where: { userId: testUserId } })
      await prisma.user.delete({ where: { id: testUserId } }).catch(() => {})
    }
    
    if (a2aClient) {
      await a2aClient.disconnect()
    }
    
    await prisma.$disconnect()
  })

  test('should fetch user balance via API', async () => {
    const response = await fetch(`http://localhost:3000/api/users/${testUserId}/balance`, {
      headers: {
        'Content-Type': 'application/json',
      },
    })

    expect(response.ok).toBe(true)
    const data = await response.json()
    
    expect(data.balance).toBeDefined()
    expect(parseFloat(data.balance)).toBe(10000)
    expect(parseFloat(data.lifetimePnL)).toBe(2500)
    expect(parseFloat(data.totalDeposited)).toBe(15000)
  })

  test('should fetch user positions via API', async () => {
    const response = await fetch(`http://localhost:3000/api/markets/positions/${testUserId}?status=open`, {
      headers: {
        'Content-Type': 'application/json',
      },
    })

    expect(response.ok).toBe(true)
    const data = await response.json()
    
    expect(data.predictions).toBeDefined()
    expect(Array.isArray(data.predictions)).toBe(true)
    expect(data.predictions.length).toBeGreaterThan(0)
  })

  test('A2A client should have getUserBalance method', () => {
    expect(typeof A2AClient.prototype.getUserBalance).toBe('function')
  })

  test('A2A client should have getUserPositions method', () => {
    expect(typeof A2AClient.prototype.getUserPositions).toBe('function')
  })

  test('A2A client should have getUserWallet method', () => {
    expect(typeof A2AClient.prototype.getUserWallet).toBe('function')
  })

  test('should initialize A2A client with wallet methods', () => {
    // This test verifies the A2A client has the new methods
    const mockConfig = {
      endpoint: 'ws://localhost:8765',
      credentials: {
        address: '0x' + '0'.repeat(40),
        privateKey: '0x' + '0'.repeat(64),
      },
    }

    const client = new A2AClient(mockConfig)
    
    expect(client.getUserBalance).toBeDefined()
    expect(client.getUserPositions).toBeDefined()
    expect(client.getUserWallet).toBeDefined()
  })
})

describe('User Wallet UI Component', () => {
  test('UserWallet component should be importable', async () => {
    const { UserWallet } = await import('@/components/profile/UserWallet')
    expect(UserWallet).toBeDefined()
  })
})

describe('Agent Providers', () => {
  test('userWalletProvider should be exported', async () => {
    const { userWalletProvider } = await import('@/lib/agents/plugins/babylon/providers')
    expect(userWalletProvider).toBeDefined()
    expect(userWalletProvider.name).toBe('BABYLON_USER_WALLET')
  })

  test('babylonPlugin should include userWalletProvider', async () => {
    const { babylonPlugin } = await import('@/lib/agents/plugins/babylon')
    const providerNames = babylonPlugin.providers.map((p: any) => p.name)
    expect(providerNames).toContain('BABYLON_USER_WALLET')
  })
})

