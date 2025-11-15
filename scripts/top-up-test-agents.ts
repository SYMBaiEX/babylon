/**
 * Top Up Test Agent Points
 * 
 * Ensures test agents have sufficient points to continue testing
 */

import { prisma } from '../src/lib/prisma'

async function topUpTestAgents() {
  console.log('💰 Topping up test agent points...\n')
  
  const testAgents = await prisma.user.findMany({
    where: {
      isTest: true,
      isAgent: true
    },
    select: {
      id: true,
      displayName: true,
      agentPointsBalance: true,
      agentStatus: true
    }
  })
  
  console.log(`Found ${testAgents.length} test agents\n`)
  
  let toppedUp = 0
  let resumed = 0
  
  for (const agent of testAgents) {
    const actions = []
    
    // Top up points if low
    if (agent.agentPointsBalance < 50) {
      await prisma.user.update({
        where: { id: agent.id },
        data: { agentPointsBalance: { increment: 500 } }
      })
      actions.push(`+500 points (was ${agent.agentPointsBalance})`)
      toppedUp++
    }
    
    // Resume if paused
    if (agent.agentStatus === 'paused') {
      await prisma.user.update({
        where: { id: agent.id },
        data: { agentStatus: 'running' }
      })
      actions.push('resumed')
      resumed++
    }
    
    if (actions.length > 0) {
      console.log(`✅ ${agent.displayName}: ${actions.join(', ')}`)
    } else {
      console.log(`✓ ${agent.displayName}: OK (${agent.agentPointsBalance} points)`)
    }
  }
  
  console.log(`\n📊 Summary:`)
  console.log(`  Topped up: ${toppedUp} agents`)
  console.log(`  Resumed: ${resumed} agents`)
  console.log(`\n✨ All test agents ready to run!`)
}

if (import.meta.main) {
  topUpTestAgents()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('❌ Error:', error)
      process.exit(1)
    })
}

export { topUpTestAgents }


