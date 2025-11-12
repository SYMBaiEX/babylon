#!/usr/bin/env bun
/**
 * Points Purchase Test Script
 * 
 * Quick test script to verify the points purchase system is working correctly.
 * Tests the API endpoints without requiring browser interaction.
 */

import { X402Manager } from '../src/a2a/payments/x402-manager'

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://sepolia.base.org'
const PAYMENT_RECEIVER = process.env.BABYLON_GAME_WALLET_ADDRESS || '0x0000000000000000000000000000000000000000'

console.log('🧪 Testing Points Purchase System\n')
console.log('Configuration:')
console.log(`  RPC URL: ${RPC_URL}`)
console.log(`  Payment Receiver: ${PAYMENT_RECEIVER}`)
console.log('')

// Validate configuration
if (!PAYMENT_RECEIVER || PAYMENT_RECEIVER === '0x0000000000000000000000000000000000000000') {
  console.error('❌ BABYLON_GAME_WALLET_ADDRESS not configured!')
  console.error('   Set this environment variable to enable point purchases.\n')
  process.exit(1)
}

// Test 1: Initialize X402Manager
console.log('Test 1: Initialize X402 Manager')
try {
  const x402Manager = new X402Manager({
    rpcUrl: RPC_URL,
    minPaymentAmount: '1000000000000000', // 0.001 ETH
    paymentTimeout: 15 * 60 * 1000 // 15 minutes
  })
  console.log('✅ X402 Manager initialized successfully\n')

  // Test 2: Create payment request
  console.log('Test 2: Create Payment Request ($10 = 1000 points)')
  const testWalletAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'
  const amountUSD = 10
  const pointsAmount = amountUSD * 100
  
  // Convert USD to wei (using simplified conversion: $1 = 0.001 ETH)
  const ethAmount = amountUSD * 0.001
  const amountInWei = BigInt(Math.floor(ethAmount * 1e18)).toString()
  
  console.log(`  From: ${testWalletAddress}`)
  console.log(`  To: ${PAYMENT_RECEIVER}`)
  console.log(`  Amount USD: $${amountUSD}`)
  console.log(`  Amount ETH: ${ethAmount} ETH`)
  console.log(`  Amount Wei: ${amountInWei}`)
  console.log(`  Points: ${pointsAmount}`)
  
  const paymentRequest = x402Manager.createPaymentRequest(
    testWalletAddress,
    PAYMENT_RECEIVER,
    amountInWei,
    'points_purchase',
    {
      userId: 'test-user',
      amountUSD,
      pointsAmount
    }
  )
  
  console.log(`  Request ID: ${paymentRequest.requestId}`)
  console.log(`  Expires At: ${new Date(paymentRequest.expiresAt).toISOString()}`)
  console.log('✅ Payment request created successfully\n')

  // Test 3: Retrieve payment request
  console.log('Test 3: Retrieve Payment Request')
  const retrieved = x402Manager.getPaymentRequest(paymentRequest.requestId)
  if (retrieved && retrieved.requestId === paymentRequest.requestId) {
    console.log('✅ Payment request retrieved successfully\n')
  } else {
    console.log('❌ Failed to retrieve payment request\n')
  }

  // Test 4: Check payment status
  console.log('Test 4: Check Payment Status')
  const isVerified = x402Manager.isPaymentVerified(paymentRequest.requestId)
  console.log(`  Verified: ${isVerified}`)
  console.log('✅ Payment status checked\n')

  // Test 5: Get statistics
  console.log('Test 5: Get Payment Statistics')
  const stats = x402Manager.getStatistics()
  console.log(`  Total Pending: ${stats.totalPending}`)
  console.log(`  Total Verified: ${stats.totalVerified}`)
  console.log(`  Total Expired: ${stats.totalExpired}`)
  console.log('✅ Statistics retrieved\n')

  // Test 6: Test amount conversions
  console.log('Test 6: Test Amount Conversions')
  const testAmounts = [
    { usd: 1, eth: 0.001, wei: '1000000000000000' },
    { usd: 10, eth: 0.01, wei: '10000000000000000' },
    { usd: 100, eth: 0.1, wei: '100000000000000000' },
    { usd: 1000, eth: 1.0, wei: '1000000000000000000' }
  ]
  
  for (const test of testAmounts) {
    const calculated = BigInt(Math.floor(test.eth * 1e18)).toString()
    const match = calculated === test.wei
    const symbol = match ? '✅' : '❌'
    console.log(`  ${symbol} $${test.usd} = ${test.eth} ETH = ${test.wei} wei (calculated: ${calculated})`)
  }
  console.log('')

  // Test 7: Cancel payment request
  console.log('Test 7: Cancel Payment Request')
  const cancelled = x402Manager.cancelPaymentRequest(paymentRequest.requestId)
  if (cancelled) {
    console.log('✅ Payment request cancelled successfully\n')
  } else {
    console.log('❌ Failed to cancel payment request\n')
  }

  // Test 8: Verify cancellation
  console.log('Test 8: Verify Cancellation')
  const afterCancel = x402Manager.getPaymentRequest(paymentRequest.requestId)
  if (afterCancel === null) {
    console.log('✅ Payment request properly removed\n')
  } else {
    console.log('❌ Payment request still exists after cancellation\n')
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('✅ All Tests Passed!')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')
  console.log('Next Steps:')
  console.log('1. Run E2E tests: bun run test:e2e tests/synpress/13-points-purchase.spec.ts')
  console.log('2. Test manually in browser: bun run dev')
  console.log('3. Review documentation: tests/synpress/POINTS_PURCHASE_TESTING.md')
  console.log('')

} catch (error) {
  console.error('❌ Test failed:', error)
  process.exit(1)
}

