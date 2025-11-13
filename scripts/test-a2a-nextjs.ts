/**
 * Test A2A Integration with Next.js App
 * 
 * Tests the A2A server integrated into the Next.js app.
 * Verifies agent card, JSON-RPC methods, and plugin integration.
 */

import { logger } from '@/lib/logger'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const A2A_ENDPOINT = `${BASE_URL}/api/a2a`
const AGENT_CARD_URL = `${BASE_URL}/.well-known/agent-card`

interface JsonRpcRequest {
  jsonrpc: string
  method: string
  params?: any
  id: string | number
}

interface JsonRpcResponse {
  jsonrpc: string
  result?: any
  error?: {
    code: number
    message: string
    data?: any
  }
  id: string | number | null
}

async function sendA2ARequest(method: string, params?: any): Promise<any> {
  const request: JsonRpcRequest = {
    jsonrpc: '2.0',
    method,
    params,
    id: Date.now()
  }

  const response = await fetch(A2A_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-agent-id': 'test-agent',
      'x-agent-address': '0x0000000000000000000000000000000000000000'
    },
    body: JSON.stringify(request)
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  const jsonResponse: JsonRpcResponse = await response.json()

  if (jsonResponse.error) {
    throw new Error(`RPC Error ${jsonResponse.error.code}: ${jsonResponse.error.message}`)
  }

  return jsonResponse.result
}

async function main() {
  console.log('🧪 Testing A2A Integration with Next.js')
  console.log('=' .repeat(70))
  console.log(`📍 Base URL: ${BASE_URL}`)
  console.log(`🔗 A2A Endpoint: ${A2A_ENDPOINT}`)
  console.log(`📄 Agent Card: ${AGENT_CARD_URL}`)
  console.log()

  let passedTests = 0
  let failedTests = 0

  // Test 1: Agent Card Discovery
  console.log('1️⃣  Testing Agent Card Discovery...')
  try {
    const response = await fetch(AGENT_CARD_URL)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const agentCard = await response.json()
    console.log('   ✅ Agent card retrieved')
    console.log(`   Name: ${agentCard.name}`)
    console.log(`   Version: ${agentCard.version}`)
    console.log(`   Methods: ${agentCard.supportedMethods?.length || 0} supported`)
    console.log()
    passedTests++
  } catch (error) {
    console.log('   ❌ Failed:', error instanceof Error ? error.message : 'Unknown error')
    console.log()
    failedTests++
  }

  // Test 2: Health Check (GET)
  console.log('2️⃣  Testing Health Check...')
  try {
    const response = await fetch(A2A_ENDPOINT)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const health = await response.json()
    console.log('   ✅ Health check passed')
    console.log(`   Service: ${health.service}`)
    console.log(`   Version: ${health.version}`)
    console.log(`   Status: ${health.status}`)
    console.log()
    passedTests++
  } catch (error) {
    console.log('   ❌ Failed:', error instanceof Error ? error.message : 'Unknown error')
    console.log()
    failedTests++
  }

  // Test 3: Discovery (a2a.discover)
  console.log('3️⃣  Testing Agent Discovery (a2a.discover)...')
  try {
    const result = await sendA2ARequest('a2a.discover', { limit: 5 })
    console.log('   ✅ Discovery successful')
    console.log(`   Agents found: ${result.agents?.length || 0}`)
    console.log(`   Total: ${result.total || 0}`)
    if (result.agents && result.agents.length > 0) {
      console.log(`   First agent: ${result.agents[0].name || result.agents[0].id}`)
    }
    console.log()
    passedTests++
  } catch (error) {
    console.log('   ❌ Failed:', error instanceof Error ? error.message : 'Unknown error')
    console.log()
    failedTests++
  }

  // Test 4: Market Data (a2a.getMarketData)
  console.log('4️⃣  Testing Market Data (a2a.getMarketData)...')
  try {
    // First get a market ID from the database
    const { prisma } = await import('@/lib/prisma')
    const market = await prisma.market.findFirst({
      where: { resolved: false },
      select: { id: true, question: true }
    })

    if (market) {
      const result = await sendA2ARequest('a2a.getMarketData', { marketId: market.id })
      console.log('   ✅ Market data retrieved')
      console.log(`   Market: ${result.question || market.question}`)
      console.log(`   ID: ${result.id || market.id}`)
      console.log()
      passedTests++
    } else {
      console.log('   ⚠️  No markets found in database (skipping)')
      console.log()
    }
  } catch (error) {
    console.log('   ❌ Failed:', error instanceof Error ? error.message : 'Unknown error')
    console.log()
    failedTests++
  }

  // Test 5: Get Balance (a2a.getBalance)
  console.log('5️⃣  Testing Get Balance (a2a.getBalance)...')
  try {
    const { prisma } = await import('@/lib/prisma')
    const user = await prisma.user.findFirst({
      where: { isAgent: true },
      select: { id: true, username: true, virtualBalance: true }
    })

    if (user) {
      const result = await sendA2ARequest('a2a.getBalance', { userId: user.id })
      console.log('   ✅ Balance retrieved')
      console.log(`   User: ${user.username}`)
      console.log(`   Balance: ${result.balance || 0}`)
      console.log(`   Total Deposited: ${result.totalDeposited || 0}`)
      console.log(`   Total Withdrawn: ${result.totalWithdrawn || 0}`)
      console.log(`   Lifetime P&L: ${result.lifetimePnL || 0}`)
      console.log()
      passedTests++
    } else {
      console.log('   ⚠️  No agent users found (skipping)')
      console.log()
    }
  } catch (error) {
    console.log('   ❌ Failed:', error instanceof Error ? error.message : 'Unknown error')
    console.log()
    failedTests++
  }

  // Test 6: Get Positions (a2a.getPositions)
  console.log('6️⃣  Testing Get Positions (a2a.getPositions)...')
  try {
    const { prisma } = await import('@/lib/prisma')
    const user = await prisma.user.findFirst({
      where: { isAgent: true },
      select: { id: true, username: true }
    })

    if (user) {
      const result = await sendA2ARequest('a2a.getPositions', { userId: user.id })
      console.log('   ✅ Positions retrieved')
      console.log(`   User: ${user.username}`)
      console.log(`   Market Positions: ${result.marketPositions?.length || 0}`)
      console.log(`   Perp Positions: ${result.perpPositions?.length || 0}`)
      console.log()
      passedTests++
    } else {
      console.log('   ⚠️  No agent users found (skipping)')
      console.log()
    }
  } catch (error) {
    console.log('   ❌ Failed:', error instanceof Error ? error.message : 'Unknown error')
    console.log()
    failedTests++
  }

  // Test 7: Get User Wallet (a2a.getUserWallet)
  console.log('7️⃣  Testing Get User Wallet (a2a.getUserWallet)...')
  try {
    const { prisma } = await import('@/lib/prisma')
    const user = await prisma.user.findFirst({
      where: { isAgent: true },
      select: { id: true, username: true }
    })

    if (user) {
      const result = await sendA2ARequest('a2a.getUserWallet', { userId: user.id })
      console.log('   ✅ User wallet retrieved')
      console.log(`   User: ${user.username}`)
      console.log(`   Balance: ${result.balance?.balance || 0}`)
      console.log(`   P&L: ${result.balance?.lifetimePnL || 0}`)
      console.log()
      passedTests++
    } else {
      console.log('   ⚠️  No agent users found (skipping)')
      console.log()
    }
  } catch (error) {
    console.log('   ❌ Failed:', error instanceof Error ? error.message : 'Unknown error')
    console.log()
    failedTests++
  }

  // Summary
  console.log('=' .repeat(70))
  console.log('📊 TEST SUMMARY')
  console.log('=' .repeat(70))
  console.log(`✅ Passed: ${passedTests}`)
  console.log(`❌ Failed: ${failedTests}`)
  console.log(`📈 Success Rate: ${((passedTests / (passedTests + failedTests)) * 100).toFixed(1)}%`)
  console.log()

  if (failedTests === 0) {
    console.log('🎉 ALL TESTS PASSED!')
    console.log()
    console.log('✅ A2A server is fully integrated and working in Next.js')
    console.log('✅ Agent card discovery is functional')
    console.log('✅ JSON-RPC methods are responding correctly')
    console.log('✅ Database queries are working')
    console.log()
    console.log('🚀 Ready for agent integration!')
    process.exit(0)
  } else {
    console.log('⚠️  Some tests failed. Review the output above.')
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('💥 Test runner error:', error)
  logger.error('Test runner error', error)
  process.exit(1)
})

