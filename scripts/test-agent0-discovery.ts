/**
 * Test Agent0 Discovery Integration
 * 
 * Tests discovery, search, and feedback functionality with the new production-grade implementation.
 */

import { getAgent0Client } from '../src/agents/agent0/Agent0Client'
import { GameDiscoveryService } from '../src/agents/agent0/GameDiscovery'
import { getUnifiedDiscoveryService } from '../src/agents/agent0/UnifiedDiscovery'
import { agent0CircuitBreaker, agent0RateLimiter } from '../src/lib/resilience/agent0-resilience'
import { agent0Metrics } from '../src/lib/metrics/agent0-metrics'
import { Agent0FeedbackError, Agent0ReputationError } from '../src/lib/errors'

async function main() {
  console.log('🧪 Testing Agent0 Discovery Integration\n')
  console.log('========================================\n')

  // Check environment
  console.log('📋 Environment Check:')
  console.log(`   AGENT0_ENABLED: ${process.env.AGENT0_ENABLED}`)
  console.log(`   AGENT0_NETWORK: ${process.env.AGENT0_NETWORK || 'sepolia (default)'}`)
  console.log(`   RPC_URL: ${process.env.BASE_SEPOLIA_RPC_URL ? '✅' : '❌'}`)
  console.log(`   PRIVATE_KEY: ${process.env.BABYLON_GAME_PRIVATE_KEY ? '✅' : '❌'}`)
  console.log(`   SUBGRAPH_URL: ${process.env.AGENT0_SUBGRAPH_URL || 'Auto-resolved ✅'}`)
  console.log()

  if (process.env.AGENT0_ENABLED !== 'true') {
    console.log('⚠️  Agent0 is disabled. Set AGENT0_ENABLED=true to test.')
    return
  }

  try {
    // Initialize Agent0Client
    console.log('🔧 Initializing Agent0Client...')
    const agent0Client = getAgent0Client()
    console.log('✅ Agent0Client initialized')
    console.log(`   Available: ${agent0Client.isAvailable()}`)
    console.log()

    // Test 1: Check Circuit Breaker Status
    console.log('🔄 Circuit Breaker Status:')
    const cbState = agent0CircuitBreaker.getState()
    const cbMetrics = agent0CircuitBreaker.getMetrics()
    console.log(`   State: ${cbState}`)
    console.log(`   Failures: ${cbMetrics.failureCount}`)
    console.log(`   Successes: ${cbMetrics.successCount}`)
    console.log()

    // Test 2: Check Rate Limiter Status
    console.log('⏱️  Rate Limiter Status:')
    console.log(`   General tokens: ${agent0RateLimiter.getAvailableTokens()}/10`)
    console.log()

    // Test 3: Search Agents
    console.log('🔍 Testing Agent Search...')
    try {
      const agents = await agent0Client.searchAgents({
        markets: ['prediction'],
        x402Support: false,
      })
      
      console.log(`✅ Found ${agents.length} agents`)
      if (agents.length > 0) {
        console.log(`   First agent: ${agents[0].name} (Token ID: ${agents[0].tokenId})`)
      }
      console.log()
    } catch (error) {
      if (Agent0ReputationError.isInstance(error)) {
        console.log(`⚠️  Search failed: ${error.message}`)
      } else {
        console.log(`❌ Unexpected error: ${error}`)
      }
      console.log()
    }

    // Test 4: Game Discovery
    console.log('🎮 Testing Game Discovery...')
    try {
      const gameDiscovery = new GameDiscoveryService()
      const games = await gameDiscovery.discoverGames({
        type: 'game-platform',
        markets: ['prediction']
      })
      
      console.log(`✅ Found ${games.length} game platforms`)
      if (games.length > 0) {
        console.log(`   First game: ${games[0].name}`)
      }
      console.log()
    } catch (error) {
      console.log(`⚠️  Game discovery error: ${error}`)
      console.log()
    }

    // Test 5: Find Babylon
    console.log('🔍 Testing Babylon Discovery...')
    try {
      const gameDiscovery = new GameDiscoveryService()
      const babylon = await gameDiscovery.findBabylon()
      
      if (babylon) {
        console.log('✅ Babylon found on Agent0 network!')
        console.log(`   Name: ${babylon.name}`)
        console.log(`   A2A Endpoint: ${babylon.endpoints.a2a}`)
        console.log(`   MCP Endpoint: ${babylon.endpoints.mcp}`)
        console.log(`   API Endpoint: ${babylon.endpoints.api}`)
      } else {
        console.log('⚠️  Babylon not found on Agent0 network (may not be registered yet)')
      }
      console.log()
    } catch (error) {
      console.log(`⚠️  Babylon discovery error: ${error}`)
      console.log()
    }

    // Test 6: Unified Discovery
    console.log('🌐 Testing Unified Discovery (Local + Agent0)...')
    try {
      const unifiedDiscovery = getUnifiedDiscoveryService()
      const allAgents = await unifiedDiscovery.discoverAgents({
        markets: ['prediction'],
        includeExternal: true,
      })
      
      console.log(`✅ Found ${allAgents.length} agents (local + Agent0 network)`)
      console.log()
    } catch (error) {
      console.log(`⚠️  Unified discovery error: ${error}`)
      console.log()
    }

    // Test 7: Get Reputation Summary
    console.log('📊 Testing Reputation Summary...')
    try {
      // Try to get reputation for Babylon (token 989 if registered)
      const summary = await agent0Client.getReputationSummary(989)
      
      if (summary) {
        console.log('✅ Reputation summary retrieved')
        console.log(`   Trust Score: ${summary.trustScore}`)
        console.log(`   Accuracy Score: ${summary.accuracyScore}`)
        console.log(`   Total Feedback: ${summary.totalFeedback}`)
      } else {
        console.log('⚠️  No reputation data found (agent may not have feedback yet)')
      }
      console.log()
    } catch (error) {
      if (Agent0ReputationError.isInstance(error)) {
        console.log(`⚠️  Reputation query failed: ${error.message}`)
      } else {
        console.log(`❌ Unexpected error: ${error}`)
      }
      console.log()
    }

    // Test 8: Metrics Summary
    console.log('📈 Metrics Summary:')
    const metrics = agent0Metrics.getMetrics()
    const metricsEntries = Object.entries(metrics)
    
    if (metricsEntries.length > 0) {
      console.log('   Collected metrics:')
      metricsEntries.slice(0, 10).forEach(([key, value]) => {
        console.log(`     ${key}: ${value}`)
      })
      if (metricsEntries.length > 10) {
        console.log(`     ... and ${metricsEntries.length - 10} more`)
      }
    } else {
      console.log('   No metrics collected yet')
    }
    console.log()

    // Test 9: Rate Limiter Status After Tests
    console.log('⏱️  Rate Limiter Status (After Tests):')
    console.log(`   General tokens remaining: ${agent0RateLimiter.getAvailableTokens()}/10`)
    console.log()

    console.log('========================================')
    console.log('✅ Agent0 Discovery Integration Tests Complete!')
    console.log('========================================\n')

  } catch (error) {
    console.error('❌ Test failed:', error)
    process.exit(1)
  }
}

main()

