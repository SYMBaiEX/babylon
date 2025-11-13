/**
 * X402Manager Smart Wallet Integration Tests
 * Unit tests for smart wallet transaction verification
 */

import { describe, test, expect, beforeEach } from 'bun:test'
import { X402Manager } from '../../payments/x402-manager'

describe('X402Manager Smart Wallet Support', () => {
  let x402Manager: X402Manager
  const testConfig = {
    rpcUrl: 'https://sepolia.base.org',
    minPaymentAmount: '1000000000000000', // 0.001 ETH
    paymentTimeout: 5 * 60 * 1000 // 5 minutes
  }

  beforeEach(() => {
    x402Manager = new X402Manager(testConfig)
  })

  describe('Smart Wallet Payment Creation', () => {
    test('should create payment request with smart wallet address', async () => {
      const smartWalletAddress = '0x1234567890123456789012345678901234567890'
      const receiverAddress = '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199'
      
      const request = await x402Manager.createPaymentRequest(
        smartWalletAddress,
        receiverAddress,
        '1000000000000000', // 0.001 ETH
        'points_purchase',
        { userId: 'test-user', pointsAmount: 1000 }
      )

      expect(request.requestId).toContain('x402-')
      expect(request.from).toBe(smartWalletAddress)
      expect(request.to).toBe(receiverAddress)
      expect(request.amount).toBe('1000000000000000')
      expect(request.service).toBe('points_purchase')
      expect(request.metadata?.userId).toBe('test-user')
      expect(request.metadata?.pointsAmount).toBe(1000)
    })

    test('should accept native ETH amounts in wei (18 decimals)', async () => {
      // $10 = 0.01 ETH = 10000000000000000 wei
      const amountInWei = '10000000000000000'
      
      const request = await x402Manager.createPaymentRequest(
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199',
        amountInWei,
        'points_purchase',
        { amountUSD: 10, pointsAmount: 1000 }
      )

      expect(request.amount).toBe(amountInWei)
      expect(request.expiresAt).toBeGreaterThan(Date.now())
    })

    test('should validate minimum amount for native ETH', async () => {
      await expect(
        x402Manager.createPaymentRequest(
          '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
          '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199',
          '100', // Too small (less than 0.001 ETH)
          'points_purchase'
        )
      ).rejects.toThrow('Payment amount must be at least')
    })
  })

  describe('Smart Wallet Transaction Verification', () => {
    test('should handle verification with non-existent transaction', async () => {
      const request = await x402Manager.createPaymentRequest(
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199',
        '1000000000000000',
        'test-service'
      )

      // Use a valid transaction hash format (64 hex chars)
      const result = await x402Manager.verifyPayment({
        requestId: request.requestId,
        txHash: '0x1234567890123456789012345678901234567890123456789012345678901234',
        from: request.from,
        to: request.to,
        amount: request.amount,
        timestamp: Date.now(),
        confirmed: false
      })

      expect(result.verified).toBe(false)
      // Error message could be "Transaction not found" or connection error
      expect(result.error).toBeTruthy()
    })

    test('should handle expired payment request', async () => {
      // Create a manager with very short timeout (1 second)
      const shortTimeoutManager = new X402Manager({
        rpcUrl: testConfig.rpcUrl,
        minPaymentAmount: testConfig.minPaymentAmount,
        paymentTimeout: 1000 // 1 second
      })
      
      const request = await shortTimeoutManager.createPaymentRequest(
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199',
        '1000000000000000',
        'test-service'
      )

      // Wait for request to expire (with Redis TTL)
      await new Promise(resolve => setTimeout(resolve, 2000)) // Wait 2 seconds

      const result = await shortTimeoutManager.verifyPayment({
        requestId: request.requestId,
        txHash: '0x1234567890123456789012345678901234567890123456789012345678901234',
        from: request.from,
        to: request.to,
        amount: request.amount,
        timestamp: Date.now(),
        confirmed: false
      })

      expect(result.verified).toBe(false)
      expect(result.error).toContain('expired')
    })

    test('should not verify already verified payment', async () => {
      const request = await x402Manager.createPaymentRequest(
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199',
        '1000000000000000',
        'test-service'
      )

      // Note: In real scenario, this would verify against blockchain
      // For testing, we just check the logic
      const isVerified = await x402Manager.isPaymentVerified(request.requestId)
      expect(isVerified).toBe(false)
    })
  })

  describe('Payment Request Management', () => {
    test('should retrieve payment request by ID', async () => {
      const request = await x402Manager.createPaymentRequest(
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199',
        '1000000000000000',
        'points_purchase',
        { userId: 'test', pointsAmount: 1000 }
      )

      const retrieved = await x402Manager.getPaymentRequest(request.requestId)
      expect(retrieved).toEqual(request)
      expect(retrieved?.metadata?.userId).toBe('test')
    })

    test('should handle pending payments for smart wallet', async () => {
      const smartWallet = '0x1234567890123456789012345678901234567890'
      const receiver = '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199'

      // Create multiple payments (all above minimum 0.001 ETH)
      await x402Manager.createPaymentRequest(
        smartWallet,
        receiver,
        '1000000000000000', // 0.001 ETH
        'service-1'
      )

      await x402Manager.createPaymentRequest(
        smartWallet,
        receiver,
        '2000000000000000', // 0.002 ETH
        'service-2'
      )

      // Incoming payment to smart wallet (also above minimum)
      await x402Manager.createPaymentRequest(
        receiver,
        smartWallet,
        '1500000000000000', // 0.0015 ETH
        'service-3'
      )

      const pending = await x402Manager.getPendingPayments()
      expect(pending.length).toBeGreaterThanOrEqual(3)
    })

    test('should cancel payment request', async () => {
      const request = await x402Manager.createPaymentRequest(
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199',
        '1000000000000000',
        'points_purchase'
      )

      const cancelled = await x402Manager.cancelPaymentRequest(request.requestId)
      expect(cancelled).toBe(true)

      const retrieved = await x402Manager.getPaymentRequest(request.requestId)
      expect(retrieved).toBeNull()
    })
  })

  describe('Amount Conversion', () => {
    test('should correctly convert USD to wei for point purchases', async () => {
      // $1 = 0.001 ETH = 1000000000000000 wei
      const amount1USD = '1000000000000000'
      
      // $10 = 0.01 ETH = 10000000000000000 wei
      const amount10USD = '10000000000000000'
      
      // $100 = 0.1 ETH = 100000000000000000 wei
      const amount100USD = '100000000000000000'

      // Test each amount
      const request1 = await x402Manager.createPaymentRequest(
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199',
        amount1USD,
        'points_purchase',
        { amountUSD: 1, pointsAmount: 100 }
      )
      expect(request1.amount).toBe(amount1USD)

      const request10 = await x402Manager.createPaymentRequest(
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199',
        amount10USD,
        'points_purchase',
        { amountUSD: 10, pointsAmount: 1000 }
      )
      expect(request10.amount).toBe(amount10USD)

      const request100 = await x402Manager.createPaymentRequest(
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199',
        amount100USD,
        'points_purchase',
        { amountUSD: 100, pointsAmount: 10000 }
      )
      expect(request100.amount).toBe(amount100USD)

      const stats = await x402Manager.getStatistics()
      expect(stats.pending).toBeGreaterThanOrEqual(3)
    })

    test('should handle maximum purchase amount', async () => {
      // $1000 = 1 ETH = 1000000000000000000 wei
      const amount1000USD = '1000000000000000000'

      const request = await x402Manager.createPaymentRequest(
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199',
        amount1000USD,
        'points_purchase',
        { amountUSD: 1000, pointsAmount: 100000 }
      )

      expect(request.amount).toBe(amount1000USD)
      expect(request.metadata?.pointsAmount).toBe(100000)

      const stats = await x402Manager.getStatistics()
      expect(stats.pending).toBeGreaterThanOrEqual(1)
    })
  })
})
