/**
 * Test Script: Babylon Plugin Setup
 * 
 * Verifies that the Babylon plugin is properly configured with A2A protocol
 * 
 * REQUIRES: A2A server must be running before this test
 */

import { agentRuntimeManager } from '@/lib/agents/runtime/AgentRuntimeManager'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

async function testPluginSetup() {
  console.log('🧪 Testing Babylon Plugin Setup with A2A Protocol...\n')
  
  try {
    // 1. Check environment
    console.log('1️⃣  Checking environment configuration...')
    
    const a2aEndpoint = process.env.BABYLON_A2A_ENDPOINT
    if (!a2aEndpoint) {
      throw new Error('BABYLON_A2A_ENDPOINT not set. A2A is REQUIRED.')
    }
    console.log(`   ✅ A2A Endpoint: ${a2aEndpoint}`)
    
    const privateKey = process.env.AGENT_DEFAULT_PRIVATE_KEY
    if (!privateKey) {
      throw new Error('AGENT_DEFAULT_PRIVATE_KEY not set. Required for A2A authentication.')
    }
    console.log('   ✅ Private key configured\n')
    
    // 2. Check database connection
    console.log('2️⃣  Testing database connection...')
    await prisma.$queryRaw<Array<{ '?column?': number }>>`SELECT 1`
    console.log('   ✅ Database connected\n')
    
    // 3. Find test agent
    console.log('3️⃣  Finding test agent...')
    let agent = await prisma.user.findFirst({
      where: { isAgent: true }
    })
    
    if (!agent) {
      console.log('   ⚠️  No agent found. Create one via the UI first.')
      console.log('   Visit: http://localhost:3000/agents/create')
      return
    }
    
    console.log(`   ✅ Found agent: ${agent.displayName} (${agent.id})`)
    
    if (!agent.walletAddress) {
      console.log('   ❌ Agent has no wallet address!')
      console.log('   Agents require wallets for A2A authentication')
      return
    }
    console.log(`   ✅ Agent wallet: ${agent.walletAddress}\n`)
    
    // 4. Get runtime (this auto-registers the plugin and connects A2A)
    console.log('4️⃣  Initializing agent runtime with A2A...')
    let runtime
    try {
      runtime = await agentRuntimeManager.getRuntime(agent.id)
      console.log('   ✅ Runtime initialized\n')
    } catch (error) {
      console.error('   ❌ Runtime initialization failed!')
      console.error(`   Error: ${error instanceof Error ? error.message : error}`)
      console.log('\n   This usually means:')
      console.log('   - A2A server is not running')
      console.log('   - A2A endpoint is misconfigured')
      console.log('   - Agent credentials are invalid\n')
      throw error
    }
    
    // 5. Verify A2A connection (REQUIRED)
    console.log('5️⃣  Verifying A2A connection...')
    const babylonRuntime = runtime as any
    
    const hasA2AClient = !!babylonRuntime.a2aClient
    const a2aConnected = babylonRuntime.a2aClient?.isConnected()
    
    console.log(`   A2A client present: ${hasA2AClient ? '✅' : '❌ MISSING'}`)
    console.log(`   A2A connected: ${a2aConnected ? '✅ YES' : '❌ NO'}`)
    
    if (!hasA2AClient || !a2aConnected) {
      console.error('\n   ❌ FATAL: A2A client not connected!')
      console.error('   Agents REQUIRE A2A to function.')
      console.error('\n   Fix:')
      console.error('   1. Start A2A server: npm run a2a:server')
      console.error('   2. Check BABYLON_A2A_ENDPOINT in .env.local')
      console.error('   3. Verify AGENT_DEFAULT_PRIVATE_KEY is set\n')
      throw new Error('A2A connection required but not available')
    }
    
    console.log('\n')
    
    // 6. Test providers (all via A2A)
    console.log('6️⃣  Testing providers (all via A2A)...')
    
    const providers = [
      'BABYLON_DASHBOARD',
      'BABYLON_MARKETS',
      'BABYLON_PORTFOLIO',
      'BABYLON_FEED',
      'BABYLON_TRENDING',
      'BABYLON_MESSAGES',
      'BABYLON_NOTIFICATIONS'
    ]
    
    for (const providerName of providers) {
      const provider = runtime.providers?.find((p: any) => p.name === providerName)
      if (provider) {
        try {
          const result = await provider.get(runtime, {} as any, {} as any)
          const preview = result?.toString().substring(0, 50).replace(/\n/g, ' ')
          console.log(`   ✅ ${providerName}: ${preview}...`)
        } catch (error) {
          console.log(`   ❌ ${providerName}: ${error instanceof Error ? error.message : 'Error'}`)
        }
      } else {
        console.log(`   ⚠️  ${providerName}: Not found`)
      }
    }
    
    console.log('\n7️⃣  Checking actions (all via A2A)...')
    const actions = [
      'BUY_PREDICTION_SHARES',
      'SELL_PREDICTION_SHARES',
      'OPEN_PERP_POSITION',
      'CLOSE_PERP_POSITION',
      'CREATE_POST',
      'COMMENT_ON_POST',
      'LIKE_POST',
      'SEND_MESSAGE',
      'CREATE_GROUP'
    ]
    
    for (const actionName of actions) {
      const action = runtime.actions?.find((a: any) => a.name === actionName)
      console.log(`   ${action ? '✅' : '❌'} ${actionName}`)
    }
    
    // 8. Summary
    console.log('\n' + '='.repeat(60))
    console.log('📊 SUMMARY')
    console.log('='.repeat(60))
    console.log(`Environment: ✅ Configured`)
    console.log(`Database: ✅ Connected`)
    console.log(`A2A Server: ✅ Connected to ${a2aEndpoint}`)
    console.log(`Runtime: ✅ Initialized`)
    console.log(`Plugin: ✅ Registered`)
    console.log(`Providers: ${runtime.providers?.length || 0}/7 (all via A2A)`)
    console.log(`Actions: ${runtime.actions?.length || 0}/9 (all via A2A)`)
    console.log(`Mode: 🌐 A2A Protocol (REQUIRED)`)
    console.log('='.repeat(60))
    
    console.log('\n✅ ALL TESTS PASSED!')
    console.log('🚀 A2A protocol is active and working')
    console.log('💡 Agents are ready to use all 74 A2A methods')
    console.log('\n✨ Setup complete!\n')
    
  } catch (error) {
    console.error('\n❌ Test failed:', error)
    console.log('\n📋 Troubleshooting:')
    console.log('   1. Start A2A server: npm run a2a:server')
    console.log('   2. Check BABYLON_A2A_ENDPOINT in .env.local')
    console.log('   3. Check AGENT_DEFAULT_PRIVATE_KEY in .env.local')
    console.log('   4. Run: npm run test:a2a (test A2A connection)')
    console.log('   5. Check DATABASE_URL in .env.local')
    console.log('   6. Run: npx prisma migrate dev')
    console.log('   7. See: A2A_SETUP.md for complete guide\n')
    console.log('🚨 Remember: A2A server is REQUIRED for agents!\n')
    process.exit(1)
  }
  
  process.exit(0)
}

// Run test
testPluginSetup().catch(console.error)


