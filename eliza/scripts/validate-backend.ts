#!/usr/bin/env bun
/**
 * Validate Backend is Ready for Agents
 * 
 * NO LARP - Actually tests the backend endpoints work
 */

const API_URL = process.env.BABYLON_API_URL || 'http://localhost:3000'
const TEST_AGENT_ID = 'validate-test-agent'
const TEST_AGENT_SECRET = process.env.BABYLON_AGENT_SECRET || 'test-secret-validation'

interface TestResult {
  name: string
  passed: boolean
  error?: string
  data?: unknown
}

const results: TestResult[] = []

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
    results.push({ name, passed: true })
    console.log(`✅ ${name}`)
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    results.push({ name, passed: false, error: errorMsg })
    console.error(`❌ ${name}: ${errorMsg}`)
  }
}

async function main() {
  console.log('🔍 Validating Babylon Backend for Agent Integration\n')
  console.log(`API URL: ${API_URL}\n`)
  
  // Test 1: Server is running
  await test('Server responds to health check', async () => {
    const response = await fetch(`${API_URL}/api/stats`)
    if (!response.ok) throw new Error(`Stats endpoint returned ${response.status}`)
  })
  
  // Test 2: Agent auth endpoint exists and works
  await test('Agent authentication endpoint works', async () => {
    const response = await fetch(`${API_URL}/api/agents/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: TEST_AGENT_ID,
        agentSecret: TEST_AGENT_SECRET,
      }),
    })
    
    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Auth failed (${response.status}): ${error}`)
    }
    
    const data = await response.json()
    if (!data.success || !data.sessionToken) {
      throw new Error('Auth response missing sessionToken')
    }
    
    results[results.length - 1]!.data = { sessionToken: '***' + data.sessionToken.slice(-4) }
  })
  
  // Test 3: Can check onboard status
  await test('Agent onboard status endpoint works', async () => {
    // First get session token
    const authRes = await fetch(`${API_URL}/api/agents/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: TEST_AGENT_ID,
        agentSecret: TEST_AGENT_SECRET,
      }),
    })
    
    const authData = await authRes.json()
    const token = authData.sessionToken
    
    // Check status
    const response = await fetch(`${API_URL}/api/agents/onboard`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    })
    
    if (!response.ok) {
      throw new Error(`Onboard status check failed: ${response.status}`)
    }
    
    const data = await response.json()
    results[results.length - 1]!.data = { isRegistered: data.isRegistered }
  })
  
  // Test 4: Can access markets
  await test('Markets endpoint accessible', async () => {
    const response = await fetch(`${API_URL}/api/markets`)
    if (!response.ok) {
      throw new Error(`Markets endpoint returned ${response.status}`)
    }
  })
  
  // Test 5: Required environment variables
  await test('Required environment variables set', async () => {
    const required = [
      'BABYLON_AGENT_SECRET',
      'NEXT_PUBLIC_IDENTITY_REGISTRY_BASE_SEPOLIA',
      'NEXT_PUBLIC_REPUTATION_SYSTEM_BASE_SEPOLIA',
      'DEPLOYER_PRIVATE_KEY',
    ]
    
    const missing = required.filter(key => !process.env[key])
    
    if (missing.length > 0) {
      throw new Error(`Missing env vars: ${missing.join(', ')}`)
    }
  })
  
  // Summary
  console.log('\n' + '='.repeat(50))
  const passed = results.filter(r => r.passed).length
  const total = results.length
  
  if (passed === total) {
    console.log(`\n✅ ALL TESTS PASSED (${passed}/${total})`)
    console.log('\n🚀 Backend is ready for agent integration!\n')
    process.exit(0)
  } else {
    console.log(`\n❌ SOME TESTS FAILED (${passed}/${total} passed)`)
    console.log('\n⚠️  Fix the failed tests before running agents\n')
    process.exit(1)
  }
}

main().catch(error => {
  console.error('\n💥 Fatal error:', error)
  process.exit(1)
})

