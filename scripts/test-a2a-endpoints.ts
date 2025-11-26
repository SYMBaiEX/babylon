#!/usr/bin/env bun
/**
 * A2A Endpoints Test Script
 * 
 * Tests all A2A endpoints against a running dev server
 * Run with: bun run dev (in another terminal)
 * Then: bun run scripts/test-a2a-endpoints.ts
 */

/**
 * JSON-serializable value type (mirrors src/types/common.ts)
 * Used for test data responses
 */
type TestJsonValue = 
  | string 
  | number 
  | boolean 
  | null 
  | TestJsonValue[] 
  | { [key: string]: TestJsonValue };

const BASE_URL = process.env.BABYLON_URL || 'http://localhost:3000'
const API_KEY = process.env.BABYLON_API_KEY || 'test'

interface TestResult {
  name: string
  passed: boolean
  error?: string
  data?: TestJsonValue
}

const tests: TestResult[] = []

async function test(name: string, fn: () => Promise<TestJsonValue>): Promise<void> {
  try {
    const data = await fn()
    tests.push({ name, passed: true, data })
    console.log(`✅ ${name}`)
  } catch (error) {
    tests.push({ name, passed: false, error: error instanceof Error ? error.message : String(error) })
    console.error(`❌ ${name}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function main() {
  console.log('🧪 Testing A2A Endpoints\n')
  console.log(`Server: ${BASE_URL}\n`)

  // Test 1: Root A2A Agent Card (GET)
  await test('Root A2A Agent Card (GET)', async () => {
    const response = await fetch(`${BASE_URL}/api/a2a`, {
      headers: { 'X-Babylon-Api-Key': API_KEY },
      signal: AbortSignal.timeout(5000) // 5 second timeout
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const card = await response.json()
    if (!card.name || !card.protocolVersion) throw new Error('Invalid agent card')
    return card
  })

  // Test 2: Root A2A Message Send (POST)
  await test('Root A2A Message Send', async () => {
    const response = await fetch(`${BASE_URL}/api/a2a`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Babylon-Api-Key': API_KEY
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout for message processing
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'message/send',
        params: {
          message: {
            role: 'user',
            parts: [{ kind: 'text', text: 'What is my balance?' }]
          }
        },
        id: 1
      })
    })
    if (!response.ok) {
      const error = await response.text()
      throw new Error(`HTTP ${response.status}: ${error}`)
    }
    const result = await response.json()
    if (!result.result && !result.error) throw new Error('Invalid response format')
    return result
  })

  // Test 3: Health Check
  await test('Health Endpoint', async () => {
    const response = await fetch(`${BASE_URL}/api/health`, {
      signal: AbortSignal.timeout(5000)
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json()
    if (data.status !== 'ok') throw new Error('Health check failed')
    return data
  })

  // Summary
  console.log('\n' + '='.repeat(50))
  console.log('📊 Test Summary')
  console.log('='.repeat(50))
  const passed = tests.filter(t => t.passed).length
  const failed = tests.filter(t => !t.passed).length
  console.log(`✅ Passed: ${passed}`)
  console.log(`❌ Failed: ${failed}`)
  console.log(`📈 Success Rate: ${Math.round((passed / tests.length) * 100)}%`)
  
  if (failed > 0) {
    console.log('\n❌ Failed Tests:')
    tests.filter(t => !t.passed).forEach(t => {
      console.log(`  - ${t.name}: ${t.error}`)
    })
  }

  process.exit(failed > 0 ? 1 : 0)
}

main().catch(console.error)

