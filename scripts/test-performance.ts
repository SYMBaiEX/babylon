#!/usr/bin/env bun
/**
 * Performance Test Script
 * Tests all optimized endpoints to verify performance improvements
 */

interface TestResult {
  endpoint: string
  status: number
  time: number
  success: boolean
  error?: string
}

const results: TestResult[] = []

async function testEndpoint(name: string, url: string, options: RequestInit = {}) {
  const start = Date.now()
  try {
    const response = await fetch(url, options)
    const time = Date.now() - start
    const data = await response.json()
    
    results.push({
      endpoint: name,
      status: response.status,
      time,
      success: response.ok && (data.success !== false),
      error: data.error
    })
    
    return { response, data, time }
  } catch (error) {
    const time = Date.now() - start
    results.push({
      endpoint: name,
      status: 0,
      time,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    })
    throw error
  }
}

async function main() {
  const baseUrl = 'http://localhost:3000'
  
  console.log('🧪 Running Performance Tests...\n')
  console.log('=' .repeat(80))
  
  // Test 1: Posts endpoint (optimized with batch queries)
  console.log('\n📝 Test 1: Posts API (batch interaction counts)')
  try {
    const { data, time } = await testEndpoint(
      'GET /api/posts',
      `${baseUrl}/api/posts?limit=20`
    )
    console.log(`✅ Success: ${data.posts?.length} posts in ${time}ms`)
    console.log(`   Expected: <200ms, Actual: ${time}ms`)
  } catch (error) {
    console.log(`❌ Failed:`, error)
  }
  
  // Test 2: Feed widgets (should use caching)
  console.log('\n📊 Test 2: Markets Widget (with caching)')
  try {
    const { data, time } = await testEndpoint(
      'GET /api/feed/widgets/markets',
      `${baseUrl}/api/feed/widgets/markets`
    )
    console.log(`✅ Success in ${time}ms`)
    console.log(`   Cached: ${data.cached ? 'Yes' : 'No (first request)'}`)
    console.log(`   Expected: <50ms (cached), <200ms (fresh)`)
  } catch (error) {
    console.log(`❌ Failed:`, error)
  }
  
  // Test 3: Trending posts widget
  console.log('\n🔥 Test 3: Trending Posts Widget')
  try {
    const { data, time } = await testEndpoint(
      'GET /api/feed/widgets/trending-posts',
      `${baseUrl}/api/feed/widgets/trending-posts`
    )
    console.log(`✅ Success: ${data.posts?.length} trending posts in ${time}ms`)
    console.log(`   Expected: <150ms`)
  } catch (error) {
    console.log(`❌ Failed:`, error)
  }
  
  // Test 4: Multiple rapid requests (connection pool test)
  console.log('\n⚡ Test 4: Connection Pool Stress Test (10 parallel requests)')
  try {
    const startTime = Date.now()
    const promises = Array.from({ length: 10 }, (_, i) =>
      testEndpoint(
        `Parallel Request ${i + 1}`,
        `${baseUrl}/api/posts?limit=5`
      )
    )
    await Promise.all(promises)
    const totalTime = Date.now() - startTime
    console.log(`✅ All 10 requests completed in ${totalTime}ms`)
    console.log(`   Average: ${Math.round(totalTime / 10)}ms per request`)
    console.log(`   Expected: No connection pool errors`)
  } catch (error) {
    console.log(`❌ Failed:`, error)
  }
  
  // Test 5: Registry endpoint (batch queries)
  console.log('\n👥 Test 5: Registry API (batch reputation fetches)')
  try {
    const { data, time } = await testEndpoint(
      'GET /api/registry',
      `${baseUrl}/api/registry?limit=10`
    )
    console.log(`✅ Success: ${data.users?.length} users in ${time}ms`)
    console.log(`   Expected: <200ms`)
  } catch (error) {
    console.log(`❌ Failed:`, error)
  }
  
  // Test 6: Predictions endpoint
  console.log('\n🎯 Test 6: Predictions Markets')
  try {
    const { data, time } = await testEndpoint(
      'GET /api/markets/predictions',
      `${baseUrl}/api/markets/predictions`
    )
    console.log(`✅ Success: ${data.questions?.length} questions in ${time}ms`)
    console.log(`   Expected: <150ms`)
  } catch (error) {
    console.log(`❌ Failed:`, error)
  }
  
  // Summary
  console.log('\n' + '='.repeat(80))
  console.log('\n📊 Test Summary\n')
  
  const successful = results.filter(r => r.success).length
  const failed = results.filter(r => !r.success).length
  const avgTime = Math.round(
    results.filter(r => r.success).reduce((sum, r) => sum + r.time, 0) / successful
  )
  
  console.log(`Total Tests: ${results.length}`)
  console.log(`✅ Passed: ${successful}`)
  console.log(`❌ Failed: ${failed}`)
  console.log(`⚡ Average Response Time: ${avgTime}ms`)
  
  // Performance assessment
  console.log('\n🎯 Performance Assessment:')
  const fastRequests = results.filter(r => r.success && r.time < 200).length
  const slowRequests = results.filter(r => r.success && r.time >= 200).length
  
  console.log(`   Fast (<200ms): ${fastRequests}`)
  console.log(`   Slow (≥200ms): ${slowRequests}`)
  
  if (slowRequests === 0 && failed === 0) {
    console.log('\n🎉 EXCELLENT! All endpoints performing optimally!')
  } else if (slowRequests <= 2) {
    console.log('\n✅ GOOD! Performance is acceptable.')
  } else {
    console.log('\n⚠️  WARNING: Some endpoints may need optimization.')
  }
  
  // Detailed results
  console.log('\n📋 Detailed Results:\n')
  results.forEach((result, i) => {
    const status = result.success ? '✅' : '❌'
    const timeColor = result.time < 100 ? '🟢' : result.time < 200 ? '🟡' : '🔴'
    console.log(`${i + 1}. ${status} ${result.endpoint}`)
    console.log(`   Status: ${result.status}, Time: ${result.time}ms ${timeColor}`)
    if (result.error) {
      console.log(`   Error: ${result.error}`)
    }
  })
  
  console.log('\n' + '='.repeat(80))
  
  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})

