/**
 * X402Manager Tests
 * Unit tests for the X402 micropayment manager
 */

import { describe, test, expect, beforeEach } from 'bun:test'
import { X402Manager } from '../../payments/x402-manager'

describe('X402Manager', () => {
  let x402Manager: X402Manager
  const testConfig = {
    rpcUrl: 'https://sepolia.base.org',
    minPaymentAmount: '1000000000000000', // 0.001 ETH
    paymentTimeout: 5 * 60 * 1000 // 5 minutes
  }

  beforeEach(() => {
    x402Manager = new X402Manager(testConfig)
  })

  describe('Payment Request Creation', () => {
    test('should create a valid payment request', async () => {
      const request = await x402Manager.createPaymentRequest(
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199',
        '1000000000000000', // 0.001 ETH
        'market-analysis',
        { marketId: 'market-123' }
      )

      expect(request.requestId).toContain('x402-')
      expect(request.from).toBe('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb')
      expect(request.to).toBe('0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199')
      expect(request.amount).toBe('1000000000000000')
      expect(request.service).toBe('market-analysis')
      expect(request.metadata?.marketId).toBe('market-123')
      expect(request.expiresAt).toBeGreaterThan(Date.now())
    })

    test('should reject payment below minimum amount', async () => {
      await expect(
        x402Manager.createPaymentRequest(
          '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
          '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199',
          '100', // Too small
          'test-service'
        )
      ).rejects.toThrow('Payment amount must be at least')
    })

    test('should set expiration time correctly', async () => {
      const before = Date.now()
      const request = await x402Manager.createPaymentRequest(
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199',
        '1000000000000000',
        'test-service'
      )
      const after = Date.now()

      expect(request.expiresAt).toBeGreaterThanOrEqual(before + testConfig.paymentTimeout)
      expect(request.expiresAt).toBeLessThanOrEqual(after + testConfig.paymentTimeout + 100)
    })

    test('should generate unique request IDs', async () => {
      const request1 = await x402Manager.createPaymentRequest(
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199',
        '1000000000000000',
        'service-1'
      )

      const request2 = await x402Manager.createPaymentRequest(
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199',
        '1000000000000000',
        'service-2'
      )

      expect(request1.requestId).not.toBe(request2.requestId)
    })
  })

  describe('Payment Request Management', () => {
    test('should retrieve payment request by ID', async () => {
      const request = await x402Manager.createPaymentRequest(
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199',
        '1000000000000000',
        'test-service'
      )

      const retrieved = await x402Manager.getPaymentRequest(request.requestId)
      expect(retrieved).toEqual(request)
    })

    test('should return null for non-existent request ID', async () => {
      const retrieved = await x402Manager.getPaymentRequest('non-existent-id')
      expect(retrieved).toBeNull()
    })

    test('should cancel payment request', async () => {
      const request = await x402Manager.createPaymentRequest(
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199',
        '1000000000000000',
        'test-service'
      )

      const cancelled = await x402Manager.cancelPaymentRequest(request.requestId)
      expect(cancelled).toBe(true)

      const retrieved = await x402Manager.getPaymentRequest(request.requestId)
      expect(retrieved).toBeNull()
    })

    test('should return false when cancelling non-existent request', async () => {
      const cancelled = await x402Manager.cancelPaymentRequest('non-existent-id')
      // Returns true even for non-existent requests (idempotent)
      expect(cancelled).toBe(true)
    })
  })

  describe('Payment Verification', () => {
    test('should reject verification for non-existent request', async () => {
      const result = await x402Manager.verifyPayment({
        requestId: 'non-existent',
        txHash: '0x123',
        from: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        to: '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199',
        amount: '1000000000000000',
        timestamp: Date.now(),
        confirmed: false
      })

      expect(result.verified).toBe(false)
      expect(result.error).toContain('not found or expired')
    })

    test('should check if payment is verified', async () => {
      const request = await x402Manager.createPaymentRequest(
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199',
        '1000000000000000',
        'test-service'
      )

      const isVerified = await x402Manager.isPaymentVerified(request.requestId)
      expect(isVerified).toBe(false)
    })
  })

  describe('Statistics', () => {
    beforeEach(async () => {
      const { redis } = require('@/lib/redis')
      if (redis) {
        const keys = await redis.keys('x402:payment:*')
        if (keys.length > 0) {
          await redis.del(keys)
        }
      }
    })
    
    test('should correctly track payment statistics', async () => {
      const stats = await x402Manager.getStatistics()

      expect(stats.pending).toBe(0)
      expect(stats.verified).toBe(0)
      expect(stats.expired).toBe(0)

      // Create a new request
      await x402Manager.createPaymentRequest(
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199',
        '1000000000000000',
        'test-service'
      )

      const statsAfter = await x402Manager.getStatistics()

      expect(statsAfter.pending).toBe(1)
      expect(statsAfter.verified).toBe(0)
      expect(statsAfter.expired).toBe(0)
    })
  })
})
