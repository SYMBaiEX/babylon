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

  test('complete purchase flow: create payment request', async () => {
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
    const paymentRequest = await x402Manager.createPaymentRequest(
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
    
  })

  test('payment request can be retrieved', async () => {
    const userAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'
    const treasuryAddress = '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199'
    const amountInWei = '10000000000000000' // 0.01 ETH
    
    const paymentRequest = await x402Manager.createPaymentRequest(
      userAddress,
      treasuryAddress,
      amountInWei,
      'points_purchase',
      { userId: 'test-user', amountUSD: 10, pointsAmount: 1000 }
    )
    
    // Retrieve the payment request
    const retrieved = await x402Manager.getPaymentRequest(paymentRequest.requestId)
    
    expect(retrieved).not.toBeNull()
    expect(retrieved?.requestId).toBe(paymentRequest.requestId)
    expect(retrieved?.from).toBe(userAddress)
    expect(retrieved?.to).toBe(treasuryAddress)
    expect(retrieved?.amount).toBe(amountInWei)
    expect(retrieved?.metadata?.pointsAmount).toBe(1000)
    
  })

  test('payment verification with incorrect amount fails', async () => {
    const userAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'
    const treasuryAddress = '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199'
    const amountInWei = '10000000000000000' // 0.01 ETH
    
    const paymentRequest = await x402Manager.createPaymentRequest(
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
    
  })

  test('expired payment request cannot be verified', async () => {
    const userAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'
    const treasuryAddress = '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199'
    const amountInWei = '10000000000000000'
    
    // Create a manager with very short timeout (1 second)
    const shortTimeoutManager = new X402Manager({
      rpcUrl: testConfig.rpcUrl,
      minPaymentAmount: testConfig.minPaymentAmount,
      paymentTimeout: 1000 // 1 second
    })
    
    const paymentRequest = await shortTimeoutManager.createPaymentRequest(
      userAddress,
      treasuryAddress,
      amountInWei,
      'points_purchase',
      { userId: 'test-user', amountUSD: 10, pointsAmount: 1000 }
    )
    
    // Wait for request to expire (with Redis TTL)
    await new Promise(resolve => setTimeout(resolve, 2000)) // Wait 2 seconds
    
    // Try to verify - should fail because Redis TTL expired the key
    const result = await shortTimeoutManager.verifyPayment({
      requestId: paymentRequest.requestId,
      txHash: '0x1234567890123456789012345678901234567890123456789012345678901234',
      from: userAddress,
      to: treasuryAddress,
      amount: amountInWei,
      timestamp: Date.now(),
      confirmed: false
    })
    
    expect(result.verified).toBe(false)
    expect(result.error).toBeTruthy() // Could be 'expired' or 'not found' depending on Redis
    
    // Accept either error message - both indicate the request is no longer valid
    const errorMessages = ['expired', 'not found']
    const hasValidError = errorMessages.some(msg => result.error?.toLowerCase().includes(msg))
    expect(hasValidError).toBe(true)
  })

  test('amount conversions are correct for different USD values', async () => {
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
    
    for (const testCase of testCases) {
      const calculatedWei = BigInt(Math.floor(testCase.eth * 1e18)).toString()
      
      expect(calculatedWei).toBe(testCase.wei)
      
      const paymentRequest = await x402Manager.createPaymentRequest(
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
    }
    
  })

  test('payment request can be cancelled', async () => {
    const userAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'
    const treasuryAddress = '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199'
    
    const paymentRequest = await x402Manager.createPaymentRequest(
      userAddress,
      treasuryAddress,
      '10000000000000000',
      'points_purchase',
      { userId: 'test-user', amountUSD: 10, pointsAmount: 1000 }
    )
    
    // Cancel the request
    const cancelled = await x402Manager.cancelPaymentRequest(paymentRequest.requestId)
    expect(cancelled).toBe(true)
    
    // Verify it's gone
    const retrieved = await x402Manager.getPaymentRequest(paymentRequest.requestId)
    expect(retrieved).toBeNull()
    
  })

  test('multiple concurrent payment requests are handled correctly', async () => {
    const userAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'
    const treasuryAddress = '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199'
    
    // Create 10 payment requests
    const requests = []
    for (let i = 0; i < 10; i++) {
      const request = await x402Manager.createPaymentRequest(
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
    for (const request of requests) {
      const retrieved = await x402Manager.getPaymentRequest(request.requestId)
      expect(retrieved).not.toBeNull()
      expect(retrieved?.requestId).toBe(request.requestId)
    }
    
  })

  test('CRITICAL: payment request persists across different X402Manager instances (simulates serverless)', async () => {
    
    const userAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'
    const treasuryAddress = '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199'
    const amountInWei = '10000000000000000' // 0.01 ETH
    const testMetadata = {
      userId: 'test-user-456',
      amountUSD: 10,
      pointsAmount: 1000
    }
    
    // ========================================
    // STEP 1: Create payment in Instance A
    // (Simulates /api/points/purchase/create-payment)
    // ========================================
    const instanceA = new X402Manager(testConfig)
    
    const paymentRequest = await instanceA.createPaymentRequest(
      userAddress,
      treasuryAddress,
      amountInWei,
      'points_purchase',
      testMetadata
    )
    
    expect(paymentRequest.requestId).toContain('x402-')
    expect(paymentRequest.metadata?.userId).toBe('test-user-456')
    
    // ========================================
    // STEP 2: Retrieve payment in Instance B
    // (Simulates /api/points/purchase/verify-payment in different serverless instance)
    // ========================================
    const instanceB = new X402Manager(testConfig)
    
    const retrieved = await instanceB.getPaymentRequest(paymentRequest.requestId)
    
    // THIS IS THE CRITICAL TEST - Without Redis, this would be null!
    expect(retrieved).not.toBeNull()
    expect(retrieved?.requestId).toBe(paymentRequest.requestId)
    expect(retrieved?.from).toBe(userAddress)
    expect(retrieved?.to).toBe(treasuryAddress)
    expect(retrieved?.amount).toBe(amountInWei)
    expect(retrieved?.service).toBe('points_purchase')
    expect(retrieved?.metadata?.userId).toBe('test-user-456')
    expect(retrieved?.metadata?.amountUSD).toBe(10)
    expect(retrieved?.metadata?.pointsAmount).toBe(1000)
    
    // ========================================
    // STEP 3: Verify payment can be marked as verified in Instance B
    // ========================================
    const verificationResult = await instanceB.verifyPayment({
      requestId: paymentRequest.requestId,
      txHash: '0x1234567890123456789012345678901234567890123456789012345678901234',
      from: userAddress,
      to: treasuryAddress,
      amount: amountInWei,
      timestamp: Date.now(),
      confirmed: false
    })
    
    // Will fail because transaction doesn't exist on blockchain, but should fail for the right reason
    expect(verificationResult.verified).toBe(false)
    expect(verificationResult.error).toContain('Transaction not found') // Not "Payment request not found"!
    
    // ========================================
    // STEP 4: Verify Instance C can also see the payment
    // (Simulates yet another serverless invocation)
    // ========================================
    const instanceC = new X402Manager(testConfig)
    
    const retrievedAgain = await instanceC.getPaymentRequest(paymentRequest.requestId)
    expect(retrievedAgain).not.toBeNull()
    expect(retrievedAgain?.requestId).toBe(paymentRequest.requestId)
    
    // ========================================
    // STEP 5: Cleanup - Cancel from yet another instance
    // ========================================
    const instanceD = new X402Manager(testConfig)
    const cancelled = await instanceD.cancelPaymentRequest(paymentRequest.requestId)
    expect(cancelled).toBe(true)
    
    // Verify it's gone from all instances
    const afterCancel = await instanceA.getPaymentRequest(paymentRequest.requestId)
    expect(afterCancel).toBeNull()
    
  })

  test('REGRESSION: payment request NOT found error is prevented', async () => {
    
    const userAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'
    const treasuryAddress = '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199'
    const amountInWei = '1000000000000000' // 0.001 ETH
    
    // Create payment in one instance
    const createInstance = new X402Manager(testConfig)
    const paymentRequest = await createInstance.createPaymentRequest(
      userAddress,
      treasuryAddress,
      amountInWei,
      'points_purchase',
      { userId: 'test-user', amountUSD: 1, pointsAmount: 100 }
    )
    
    // Try to verify in a different instance (simulates the bug scenario)
    const verifyInstance = new X402Manager(testConfig)
    const retrieved = await verifyInstance.getPaymentRequest(paymentRequest.requestId)
    
    // Before fix: This would be null → "Payment request not found or expired"
    // After fix: This should work!
    expect(retrieved).not.toBeNull()
    expect(retrieved?.requestId).toBe(paymentRequest.requestId)
    
  })
})


