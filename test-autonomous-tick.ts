/**
 * Test script for autonomous tick
 * Run with: npx tsx test-autonomous-tick.ts
 */

// Load environment variables
import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '.env.local') })

import { testSingleTick } from './src/lib/agents/examples/autonomous-agent-setup'

const AGENT_ID = '247206847168118784'

console.log('╔══════════════════════════════════════════════════════════╗')
console.log('║        AUTONOMOUS TICK TEST - WITH GROQ                  ║')
console.log('╚══════════════════════════════════════════════════════════╝\n')

async function main() {
  try {
    console.log(`Testing agent: ${AGENT_ID}\n`)
    console.log('Executing autonomous tick with LLM...\n')
    
    const result = await testSingleTick(AGENT_ID)
    
    console.log('\n╔══════════════════════════════════════════════════════════╗')
    console.log('║                   TEST COMPLETE                          ║')
    console.log('╚══════════════════════════════════════════════════════════╝\n')
    
    console.log('📋 RESULTS:')
    console.log('─'.repeat(60))
    console.log(`✅ Agent: ${result.agent.displayName} (${result.agent.id})`)
    console.log(`✅ Success: ${result.result.success}`)
    console.log(`✅ Method: ${result.result.method}`)
    console.log(`✅ Duration: ${result.result.duration}ms`)
    console.log(`✅ Total Actions: ${result.totalActions}`)
    console.log('\n📊 Actions Breakdown:')
    console.log(JSON.stringify(result.result.actionsExecuted, null, 2))
    console.log('\n✅ ALL TESTS PASSED\n')
    
    process.exit(0)
  } catch (error) {
    console.error('\n❌ TEST FAILED\n')
    console.error('Error:', error)
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:')
      console.error(error.stack.split('\n').slice(0, 15).join('\n'))
    }
    process.exit(1)
  }
}

main()
