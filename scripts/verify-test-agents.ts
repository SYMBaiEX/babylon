/**
 * Verify Test Agents Status
 * 
 * Quick health check for all test agents
 */

import { prisma } from '../src/lib/prisma'

async function verifyTestAgents() {
  console.log('🔍 Verifying test agent system...\n')
  
  const agents = await prisma.user.findMany({
    where: {
      isTest: true,
      isAgent: true
    },
    select: {
      id: true,
      displayName: true,
      agentStatus: true,
      agentPointsBalance: true,
      agentLastTickAt: true,
      virtualBalance: true,
      autonomousTrading: true,
      autonomousPosting: true,
      autonomousCommenting: true,
      autonomousDMs: true,
      autonomousGroupChats: true,
    },
    orderBy: {
      displayName: 'asc'
    }
  })
  
  console.log(`Found ${agents.length} test agents\n`)
  
  let running = 0
  let paused = 0
  let lowBalance = 0
  let totalActions = 0
  
  for (const agent of agents) {
    // Query action counts separately
    const [postCount, commentCount, tradeCount, messageCount] = await Promise.all([
      prisma.post.count({ where: { authorId: agent.id } }),
      prisma.comment.count({ where: { authorId: agent.id } }),
      prisma.agentTrade.count({ where: { agentUserId: agent.id } }),
      prisma.message.count({ where: { senderId: agent.id } })
    ])
    
    const actions = postCount + commentCount + tradeCount + messageCount
    totalActions += actions
    
    // Status indicators
    const statusIcon = agent.agentStatus === 'running' ? '▶️ ' : agent.agentStatus === 'paused' ? '⏸️ ' : '⏹️ '
    const pointsIcon = agent.agentPointsBalance < 10 ? '⚠️ ' : '✓'
    
    // Time since last tick
    let tickStatus = 'Never ran'
    if (agent.agentLastTickAt) {
      const msSinceLastTick = Date.now() - new Date(agent.agentLastTickAt).getTime()
      const minutesSince = Math.floor(msSinceLastTick / 60000)
      if (minutesSince === 0) {
        tickStatus = `Just now`
      } else if (minutesSince < 60) {
        tickStatus = `${minutesSince}m ago`
      } else {
        const hoursSince = Math.floor(minutesSince / 60)
        tickStatus = `${hoursSince}h ago`
      }
    }
    
    // Autonomous features
    const features = []
    if (agent.autonomousTrading) features.push('Trading')
    if (agent.autonomousPosting) features.push('Posting')
    if (agent.autonomousCommenting) features.push('Commenting')
    if (agent.autonomousDMs) features.push('DMs')
    if (agent.autonomousGroupChats) features.push('Groups')
    
    console.log(`${statusIcon}${pointsIcon} ${agent.displayName}`)
    console.log(`   Status: ${agent.agentStatus} | Points: ${agent.agentPointsBalance} | Balance: ${agent.virtualBalance}`)
    console.log(`   Last Tick: ${tickStatus}`)
    console.log(`   Features: ${features.join(', ')}`)
    console.log(`   Actions: ${postCount} posts, ${commentCount} comments, ${tradeCount} trades, ${messageCount} messages`)
    console.log()
    
    // Update counters
    if (agent.agentStatus === 'running') running++
    if (agent.agentStatus === 'paused') paused++
    if (agent.agentPointsBalance < 10) lowBalance++
  }
  
  console.log('━'.repeat(60))
  console.log('\n📊 Summary:')
  console.log(`   Total Agents: ${agents.length}`)
  console.log(`   Running: ${running}`)
  console.log(`   Paused: ${paused}`)
  console.log(`   Low Balance: ${lowBalance}`)
  console.log(`   Total Actions Performed: ${totalActions}`)
  
  console.log('\n💡 Health Status:')
  if (agents.length < 10) {
    console.log(`   ⚠️  Expected at least 10 agents, found ${agents.length}`)
    console.log(`   → Run: bun run scripts/create-test-agents.ts`)
  } else if (agents.length < 16) {
    console.log(`   ⚠️  Expected 16 agents, found ${agents.length}`)
    console.log(`   → Some agents may have been deleted. Run: bun run scripts/create-test-agents.ts`)
  } else {
    console.log(`   ✅ All ${agents.length} test agents present`)
  }
  
  if (paused > 0) {
    console.log(`   ⚠️  ${paused} agents are paused`)
    console.log(`   → Run: bun run scripts/top-up-test-agents.ts`)
  } else {
    console.log(`   ✅ All agents running`)
  }
  
  if (lowBalance > 0) {
    console.log(`   ⚠️  ${lowBalance} agents have low points (<10)`)
    console.log(`   → Run: bun run scripts/top-up-test-agents.ts`)
  } else {
    console.log(`   ✅ All agents have sufficient points`)
  }
  
  if (totalActions === 0) {
    console.log(`   ⚠️  No actions performed yet`)
    console.log(`   → Agents may not have run yet. Wait for next tick or manually trigger:`)
    console.log(`     curl -X POST http://localhost:3000/api/cron/agent-tick -H "Authorization: Bearer $CRON_SECRET"`)
  } else {
    console.log(`   ✅ Agents are actively testing (${totalActions} total actions)`)
  }
  
  console.log('\n✨ Verification complete!')
}

if (import.meta.main) {
  verifyTestAgents()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('❌ Error:', error)
      process.exit(1)
    })
}

export { verifyTestAgents }

