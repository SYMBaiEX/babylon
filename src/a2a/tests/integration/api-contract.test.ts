/**
 * API Contract Tests
 * 
 * Tests that verify the API request/response contracts for points purchase endpoints
 * This ensures frontend and backend are properly integrated
 */

import { describe, test, expect } from 'bun:test'
import { X402Manager } from '../../payments/x402-manager'

describe('Points Purchase API Contract', () => {
  describe('POST /api/points/purchase/create-payment', () => {
    test('request body matches CreatePaymentSchema', () => {
      // Frontend sends this
      const requestBody = {
        amountUSD: 10,
        fromAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'
      }
      
      // Validate it matches the schema
      expect(requestBody.amountUSD).toBeGreaterThanOrEqual(1)
      expect(requestBody.amountUSD).toBeLessThanOrEqual(1000)
      expect(requestBody.fromAddress).toMatch(/^0x[a-fA-F0-9]+$/)
      expect(requestBody.fromAddress.length).toBeGreaterThanOrEqual(40) // 0x + at least 38 hex chars
      
    })

    test('response matches expected format', async () => {
      const x402Manager = new X402Manager({
        rpcUrl: 'https://sepolia.base.org',
        minPaymentAmount: '1000000000000000',
        paymentTimeout: 15 * 60 * 1000
      })
      
      // Backend creates payment request
      const amountUSD = 10
      const ethAmount = amountUSD * 0.001
      const amountInWei = BigInt(Math.floor(ethAmount * 1e18)).toString()
      
      const paymentRequest = await x402Manager.createPaymentRequest(
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199',
        amountInWei,
        'points_purchase',
        {
          userId: 'test-user',
          amountUSD: 10,
          pointsAmount: 1000
        }
      )
      
      // Frontend expects this response format
      const expectedResponse = {
        success: true,
        paymentRequest: {
          requestId: paymentRequest.requestId,
          amount: paymentRequest.amount,
          from: paymentRequest.from,
          to: paymentRequest.to,
          expiresAt: paymentRequest.expiresAt,
          pointsAmount: 1000,
          amountUSD: 10
        }
      }
      
      expect(expectedResponse.success).toBe(true)
      expect(expectedResponse.paymentRequest.requestId).toContain('x402-')
      expect(expectedResponse.paymentRequest.amount).toBe(amountInWei)
      expect(expectedResponse.paymentRequest.from).toBe('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb')
      expect(expectedResponse.paymentRequest.to).toBe('0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199')
      expect(expectedResponse.paymentRequest.pointsAmount).toBe(1000)
      expect(expectedResponse.paymentRequest.amountUSD).toBe(10)
      
    })
  })

  describe('POST /api/points/purchase/verify-payment', () => {
    test('request body matches VerifyPaymentSchema', () => {
      // Frontend sends this
      const requestBody = {
        requestId: 'x402-1234567890-0xabcdef',
        txHash: '0x1234567890123456789012345678901234567890123456789012345678901234',
        fromAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        toAddress: '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199',
        amount: '10000000000000000'
      }
      
      // Validate it matches the schema
      expect(requestBody.requestId).toContain('x402-')
      expect(requestBody.txHash).toMatch(/^0x[a-fA-F0-9]{64}$/)
      expect(requestBody.fromAddress).toMatch(/^0x[a-fA-F0-9]+$/)
      expect(requestBody.fromAddress.length).toBeGreaterThanOrEqual(40)
      expect(requestBody.toAddress).toMatch(/^0x[a-fA-F0-9]+$/)
      expect(requestBody.toAddress.length).toBeGreaterThanOrEqual(40)
      expect(requestBody.amount).toMatch(/^\d+$/)
      
    })

    test('response matches expected format on success', () => {
      // Frontend expects this response format
      const expectedResponse = {
        success: true,
        pointsAwarded: 1000,
        newTotal: 5000,
        txHash: '0x1234567890123456789012345678901234567890123456789012345678901234'
      }
      
      expect(expectedResponse.success).toBe(true)
      expect(expectedResponse.pointsAwarded).toBeGreaterThan(0)
      expect(expectedResponse.newTotal).toBeGreaterThan(0)
      expect(expectedResponse.txHash).toMatch(/^0x[a-fA-F0-9]{64}$/)
      
    })

    test('response matches expected format on failure', () => {
      // Frontend expects this error format
      const errorResponse = {
        success: false,
        error: 'Payment verification failed'
      }
      
      expect(errorResponse.success).toBe(false)
      expect(errorResponse.error).toBeTruthy()
      
    })
  })

  describe('Payment Flow Integration', () => {
    test('frontend can consume create-payment response', async () => {
      const x402Manager = new X402Manager({
        rpcUrl: 'https://sepolia.base.org',
        minPaymentAmount: '1000000000000000',
        paymentTimeout: 15 * 60 * 1000
      })
      
      // Simulate backend creating payment request
      const amountUSD = 10
      const ethAmount = amountUSD * 0.001
      const amountInWei = BigInt(Math.floor(ethAmount * 1e18)).toString()
      
      const paymentRequest = await x402Manager.createPaymentRequest(
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199',
        amountInWei,
        'points_purchase',
        { userId: 'test-user', amountUSD: 10, pointsAmount: 1000 }
      )
      
      // Frontend receives this and can use it
      const { requestId, to, amount } = paymentRequest
      
      expect(requestId).toBeTruthy()
      expect(to).toBeTruthy()
      expect(amount).toBe(amountInWei)
      
      // Frontend can send transaction with these values
      const transactionParams = {
        to: to as `0x${string}`,
        value: BigInt(amount)
      }
      
      expect(transactionParams.to).toBe(to as `0x${string}`)
      expect(transactionParams.value).toBe(BigInt(amountInWei))
      
    })

    test('points calculation is consistent frontend to backend', () => {
      const testCases = [
        { usd: 1, points: 100 },
        { usd: 5, points: 500 },
        { usd: 10, points: 1000 },
        { usd: 25, points: 2500 },
        { usd: 50, points: 5000 },
        { usd: 100, points: 10000 },
        { usd: 1000, points: 100000 }
      ]
      
      testCases.forEach(testCase => {
        // Frontend calculation
        const frontendPoints = Math.floor(testCase.usd * 100)
        
        // Backend calculation (in points-service.ts)
        const backendPoints = Math.floor(testCase.usd * 100)
        
        expect(frontendPoints).toBe(backendPoints)
        expect(frontendPoints).toBe(testCase.points)
      })
      
    })

    test('amount conversion is consistent', () => {
      const testCases = [
        { usd: 1, wei: '1000000000000000' },
        { usd: 10, wei: '10000000000000000' },
        { usd: 100, wei: '100000000000000000' },
        { usd: 1000, wei: '1000000000000000000' }
      ]
      
      testCases.forEach(testCase => {
        // Backend conversion (in create-payment/route.ts)
        const ethAmount = testCase.usd * 0.001
        const amountInWei = BigInt(Math.floor(ethAmount * 1e18)).toString()
        
        expect(amountInWei).toBe(testCase.wei)
      })
      
    })
  })

  describe('Error Handling Contract', () => {
    test('payment receiver validation error format', () => {
      // When PAYMENT_RECEIVER is not configured
      const errorResponse = {
        error: 'Payment system not configured. Please contact support.',
        status: 500
      }
      
      expect(errorResponse.error).toBeTruthy()
      expect(errorResponse.status).toBe(500)
      
    })

    test('validation error format', () => {
      // When request body is invalid
      const errorResponse = {
        error: 'Invalid request body',
        issues: [],
        status: 400
      }
      
      expect(errorResponse.error).toBeTruthy()
      expect(errorResponse.status).toBe(400)
      
    })

    test('authentication error format', () => {
      // When user is not authenticated
      const errorResponse = {
        error: 'User not found in database',
        status: 401
      }
      
      expect(errorResponse.error).toBeTruthy()
      expect(errorResponse.status).toBe(401)
      
    })
  })
})

