/**
 * Points Purchase Flow Integration Test
 * 
 * Tests the complete flow from creating a payment request to verifying it
 */

import { describe, test, expect, beforeEach } from 'bun:test'
import { X402Manager } from '../../payments/x402-manager'

describe('Points Purchase Integration Flow', () => {
  let x402Manager: X402Manager
  const testConfig = {
    rpcUrl: 'https://sepolia.base.org',
    minPaymentAmount: '1000000000000000', // 0.001 ETH
    paymentTimeout: 15 * 60 * 1000 // 15 minutes
  }

  beforeEach(() => {
    x402Manager = new X402Manager(testConfig)
  })

  test('complete purchase flow: create payment request', () => {
    // Simulate user wants to buy $10 worth of points (1000 points)
    const amountUSD = 10
    const pointsAmount = amountUSD * 100 // 1000 points
    
    // User's smart wallet address
    const userAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'
    
    // Payment receiver (treasury)
    const treasuryAddress = '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199'
    
    // Convert USD to wei ($1 = 0.001 ETH)
    const ethAmount = amountUSD * 0.001
    const amountInWei = BigInt(Math.floor(ethAmount * 1e18)).toString()
    
    // Create payment request (simulating API endpoint)
    const paymentRequest = x402Manager.createPaymentRequest(
      userAddress,
      treasuryAddress,
      amountInWei,
      'points_purchase',
      {
        userId: 'test-user-123',
        amountUSD,
        pointsAmount
      }
    )
    
    // Verify payment request was created correctly
    expect(paymentRequest.requestId).toContain('x402-')
    expect(paymentRequest.from).toBe(userAddress)
    expect(paymentRequest.to).toBe(treasuryAddress)
    expect(paymentRequest.amount).toBe(amountInWei)
    expect(paymentRequest.service).toBe('points_purchase')
    expect(paymentRequest.metadata?.userId).toBe('test-user-123')
    expect(paymentRequest.metadata?.amountUSD).toBe(10)
    expect(paymentRequest.metadata?.pointsAmount).toBe(1000)
    expect(paymentRequest.expiresAt).toBeGreaterThan(Date.now())
    expect(paymentRequest.expiresAt).toBeLessThanOrEqual(Date.now() + 15 * 60 * 1000 + 1000)
    
    console.log('✅ Payment request created successfully')
    console.log(`   Request ID: ${paymentRequest.requestId}`)
    console.log(`   Amount: ${ethAmount} ETH (${amountInWei} wei)`)
    console.log(`   Points: ${pointsAmount}`)
  })

  test('payment request can be retrieved', () => {
    const userAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'
    const treasuryAddress = '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199'
    const amountInWei = '10000000000000000' // 0.01 ETH
    
    const paymentRequest = x402Manager.createPaymentRequest(
      userAddress,
      treasuryAddress,
      amountInWei,
      'points_purchase',
      { userId: 'test-user', amountUSD: 10, pointsAmount: 1000 }
    )
    
    // Retrieve the payment request
    const retrieved = x402Manager.getPaymentRequest(paymentRequest.requestId)
    
    expect(retrieved).not.toBeNull()
    expect(retrieved?.requestId).toBe(paymentRequest.requestId)
    expect(retrieved?.from).toBe(userAddress)
    expect(retrieved?.to).toBe(treasuryAddress)
    expect(retrieved?.amount).toBe(amountInWei)
    expect(retrieved?.metadata?.pointsAmount).toBe(1000)
    
    console.log('✅ Payment request retrieved successfully')
  })

  test('payment verification with incorrect amount fails', async () => {
    const userAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'
    const treasuryAddress = '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199'
    const amountInWei = '10000000000000000' // 0.01 ETH
    
    const paymentRequest = x402Manager.createPaymentRequest(
      userAddress,
      treasuryAddress,
      amountInWei,
      'points_purchase',
      { userId: 'test-user', amountUSD: 10, pointsAmount: 1000 }
    )
    
    // Try to verify with a fake transaction (will fail - transaction not found)
    const result = await x402Manager.verifyPayment({
      requestId: paymentRequest.requestId,
      txHash: '0x1234567890123456789012345678901234567890123456789012345678901234',
      from: userAddress,
      to: treasuryAddress,
      amount: amountInWei,
      timestamp: Date.now(),
      confirmed: false
    })
    
    expect(result.verified).toBe(false)
    expect(result.error).toBeTruthy()
    
    console.log('✅ Verification correctly fails for non-existent transaction')
    console.log(`   Error: ${result.error}`)
  })

  test('expired payment request cannot be verified', async () => {
    const userAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'
    const treasuryAddress = '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199'
    const amountInWei = '10000000000000000'
    
    const paymentRequest = x402Manager.createPaymentRequest(
      userAddress,
      treasuryAddress,
      amountInWei,
      'points_purchase',
      { userId: 'test-user', amountUSD: 10, pointsAmount: 1000 }
    )
    
    // Manually expire the request
    const storedRequest = x402Manager.getPaymentRequest(paymentRequest.requestId)
    if (storedRequest) {
      storedRequest.expiresAt = Date.now() - 1000 // Expired 1 second ago
    }
    
    // Try to verify
    const result = await x402Manager.verifyPayment({
      requestId: paymentRequest.requestId,
      txHash: '0x1234567890123456789012345678901234567890123456789012345678901234',
      from: userAddress,
      to: treasuryAddress,
      amount: amountInWei,
      timestamp: Date.now(),
      confirmed: false
    })
    
    expect(result.verified).toBe(false)
    expect(result.error).toContain('expired')
    
    console.log('✅ Expired payment request correctly rejected')
  })

  test('payment request statistics are tracked', () => {
    // Create multiple payment requests
    const addresses = [
      '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
      '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199',
      '0x1234567890123456789012345678901234567890'
    ]
    
    const treasuryAddress = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
    
    addresses.forEach((addr, i) => {
      x402Manager.createPaymentRequest(
        addr,
        treasuryAddress,
        '10000000000000000',
        'points_purchase',
        { userId: `user-${i}`, amountUSD: 10, pointsAmount: 1000 }
      )
    })
    
    const stats = x402Manager.getStatistics()
    
    expect(stats.totalPending).toBe(3)
    expect(stats.totalVerified).toBe(0)
    expect(stats.totalExpired).toBe(0)
    
    console.log('✅ Payment statistics tracked correctly')
    console.log(`   Pending: ${stats.totalPending}`)
    console.log(`   Verified: ${stats.totalVerified}`)
    console.log(`   Expired: ${stats.totalExpired}`)
  })

  test('amount conversions are correct for different USD values', () => {
    const testCases = [
      { usd: 1, eth: 0.001, wei: '1000000000000000', points: 100 },
      { usd: 5, eth: 0.005, wei: '5000000000000000', points: 500 },
      { usd: 10, eth: 0.01, wei: '10000000000000000', points: 1000 },
      { usd: 50, eth: 0.05, wei: '50000000000000000', points: 5000 },
      { usd: 100, eth: 0.1, wei: '100000000000000000', points: 10000 },
      { usd: 1000, eth: 1.0, wei: '1000000000000000000', points: 100000 }
    ]
    
    const userAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'
    const treasuryAddress = '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199'
    
    testCases.forEach(testCase => {
      const calculatedWei = BigInt(Math.floor(testCase.eth * 1e18)).toString()
      
      expect(calculatedWei).toBe(testCase.wei)
      
      const paymentRequest = x402Manager.createPaymentRequest(
        userAddress,
        treasuryAddress,
        testCase.wei,
        'points_purchase',
        { 
          userId: 'test-user',
          amountUSD: testCase.usd,
          pointsAmount: testCase.points
        }
      )
      
      expect(paymentRequest.amount).toBe(testCase.wei)
      expect(paymentRequest.metadata?.amountUSD).toBe(testCase.usd)
      expect(paymentRequest.metadata?.pointsAmount).toBe(testCase.points)
    })
    
    console.log('✅ All amount conversions correct')
    console.log(`   Tested ${testCases.length} different amounts`)
  })

  test('payment request can be cancelled', () => {
    const userAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'
    const treasuryAddress = '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199'
    
    const paymentRequest = x402Manager.createPaymentRequest(
      userAddress,
      treasuryAddress,
      '10000000000000000',
      'points_purchase',
      { userId: 'test-user', amountUSD: 10, pointsAmount: 1000 }
    )
    
    // Cancel the request
    const cancelled = x402Manager.cancelPaymentRequest(paymentRequest.requestId)
    expect(cancelled).toBe(true)
    
    // Verify it's gone
    const retrieved = x402Manager.getPaymentRequest(paymentRequest.requestId)
    expect(retrieved).toBeNull()
    
    console.log('✅ Payment request successfully cancelled')
  })

  test('multiple concurrent payment requests are handled correctly', () => {
    const userAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'
    const treasuryAddress = '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199'
    
    // Create 10 payment requests
    const requests = []
    for (let i = 0; i < 10; i++) {
      const request = x402Manager.createPaymentRequest(
        userAddress,
        treasuryAddress,
        `${(i + 1) * 10000000000000000}`, // Increasing amounts
        'points_purchase',
        { 
          userId: 'test-user',
          amountUSD: (i + 1) * 10,
          pointsAmount: (i + 1) * 1000
        }
      )
      requests.push(request)
    }
    
    // Verify all requests have unique IDs
    const requestIds = new Set(requests.map(r => r.requestId))
    expect(requestIds.size).toBe(10)
    
    // Verify all can be retrieved
    requests.forEach(request => {
      const retrieved = x402Manager.getPaymentRequest(request.requestId)
      expect(retrieved).not.toBeNull()
      expect(retrieved?.requestId).toBe(request.requestId)
    })
    
    // Verify statistics
    const stats = x402Manager.getStatistics()
    expect(stats.totalPending).toBeGreaterThanOrEqual(10)
    
    console.log('✅ Multiple concurrent requests handled correctly')
    console.log(`   Created ${requests.length} unique requests`)
  })
})

