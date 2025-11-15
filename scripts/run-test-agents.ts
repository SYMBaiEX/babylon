/**
 * Run Test Agents Manually
 * 
 * Triggers autonomous ticks for all test agents to verify A2A functionality
 */

import { prisma } from '../src/lib/prisma'
import { autonomousCoordinator } from '../src/lib/agents/autonomous'
import { agentRuntimeManager } from '../src/lib/agents/runtime/AgentRuntimeManager'

async function runTestAgents() {
  console.log('🤖 Running all test agents...\n')
  
  // Find all test agents
  const testAgents = await prisma.user.findMany({
    where: {
      isAgent: true,
      username: { startsWith: 'test-' },
      isTest: true
    }
  })
  
  if (testAgents.length === 0) {
    console.log('No test agents found. Run: bun run scripts/create-test-agents.ts')
    return
  }
  
  console.log(`Found ${testAgents.length} test agents\n`)
  
  for (const agent of testAgents) {
    const startTime = Date.now()
    console.log(`\n${'='.repeat(60)}`)
    console.log(`Running: ${agent.displayName} (@${agent.username})`)
    console.log(`${'='.repeat(60)}`)
    
    try {
      // Get runtime
      const runtime = await agentRuntimeManager.getRuntime(agent.id)
      
      // Execute autonomous tick
      const result = await autonomousCoordinator.executeAutonomousTick(agent.id, runtime)
      
      const duration = Date.now() - startTime
      
      console.log('\n📊 Results:')
      console.log(`  Status: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`)
      console.log(`  Method: ${result.method}`)
      console.log(`  Duration: ${duration}ms`)
      console.log(`  Actions:`)
      console.log(`    - Trades: ${result.actionsExecuted.trades}`)
      console.log(`    - Posts: ${result.actionsExecuted.posts}`)
      console.log(`    - Comments: ${result.actionsExecuted.comments}`)
      console.log(`    - Messages: ${result.actionsExecuted.messages}`)
      console.log(`    - Group Messages: ${result.actionsExecuted.groupMessages}`)
      console.log(`    - Engagements: ${result.actionsExecuted.engagements}`)
      
    } catch (error) {
      console.error(`\n❌ Error running ${agent.displayName}:`, error)
      console.error('This indicates missing or broken A2A methods')
    }
  }
  
  console.log(`\n${'='.repeat(60)}`)
  console.log('✅ Test run complete')
  console.log(`${'='.repeat(60)}\n`)
  console.log('Check logs above to see which A2A methods worked/failed')
  console.log('Implement missing methods based on failure messages')
}

runTestAgents()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })

