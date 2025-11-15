/**
 * Complete Example: Agent0 Discovery + Official A2A Protocol
 * 
 * This example demonstrates the full workflow:
 * 1. Discover Babylon via Agent0 registry
 * 2. Connect using official A2A SDK
 * 3. Execute game skills via message/send
 * 4. Handle task lifecycle
 * 
 * Prerequisites:
 * - Babylon must be registered on Agent0 (run scripts/register-babylon-agent0.ts)
 * - Base Sepolia RPC access
 */

import { A2AClient } from '@a2a-js/sdk/client'
import { SDK } from 'agent0-sdk'
import type { Task, Message } from '@a2a-js/sdk'

// Configuration
const BASE_SEPOLIA_RPC = process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org'
const FALLBACK_BABYLON_URL = 'https://babylon.game/.well-known/agent-card.json'

async function main() {
  console.log('🤖 Official A2A & Agent0 Example\n')
  console.log('=' .repeat(60))
  
  // ===========================================
  // STEP 1: Discover Babylon via Agent0
  // ===========================================
  
  console.log('\n📡 Step 1: Discovering Babylon via Agent0 Registry...')
  
  const agent0 = new SDK({
    chainId: 84532,  // Base Sepolia
    rpcUrl: BASE_SEPOLIA_RPC
    // No signer needed for read-only discovery
  })
  
  let babylonEndpoint = FALLBACK_BABYLON_URL
  
  try {
    // Search for Babylon on Agent0 registry
    const results = await agent0.searchAgents({
      a2a: true,  // Only agents with A2A support
      a2aSkills: ['prediction-market-trader'],  // Agents with trading skills
      name: 'Babylon',
      active: true
    })
    
    if (results.items.length === 0) {
      console.log('⚠️  Babylon not found on Agent0 registry')
      console.log('   Using fallback endpoint:', FALLBACK_BABYLON_URL)
      console.log('\n   💡 To register Babylon:')
      console.log('      cd /path/to/babylon')
      console.log('      bun run scripts/register-babylon-agent0.ts')
    } else {
      const babylon = results.items[0]
      console.log('✅ Found Babylon on Agent0!')
      console.log(`   Agent ID: ${babylon.agentId}`)
      console.log(`   Name: ${babylon.name}`)
      console.log(`   Description: ${babylon.description}`)
      console.log(`   Active: ${babylon.active}`)
      console.log(`   Skills: ${babylon.a2aSkills?.length || 0}`)
      
      if (babylon.a2aSkills && babylon.a2aSkills.length > 0) {
        console.log('\n   Available Skills:')
        babylon.a2aSkills.forEach(skill => console.log(`     - ${skill}`))
      }
      
      // Get A2A endpoint from registration
      if (babylon.a2aEndpoint) {
        babylonEndpoint = babylon.a2aEndpoint
        console.log(`\n   A2A Endpoint: ${babylonEndpoint}`)
      }
    }
  } catch (error) {
    console.log('⚠️  Could not query Agent0 registry:', (error as Error).message)
    console.log('   Using fallback endpoint:', FALLBACK_BABYLON_URL)
  }
  
  // ===========================================
  // STEP 2: Connect via Official A2A SDK
  // ===========================================
  
  console.log('\n📡 Step 2: Connecting via Official A2A Protocol...')
  
  let babylon: A2AClient
  
  try {
    babylon = await A2AClient.fromCardUrl(babylonEndpoint)
    console.log('✅ Connected to Babylon!')
    
    // Get and display agent card
    const card = await babylon.getAgentCard()
    console.log(`   Name: ${card.name}`)
    console.log(`   Protocol: ${card.protocolVersion}`)
    console.log(`   Transport: ${card.preferredTransport}`)
    console.log(`   Skills: ${card.skills.length}`)
    
    console.log('\n   Available Game Skills:')
    card.skills.forEach((skill, i) => {
      console.log(`   ${i + 1}. ${skill.name} (${skill.id})`)
      console.log(`      ${skill.description.substring(0, 80)}...`)
    })
    
  } catch (error) {
    console.error('❌ Could not connect to Babylon:', (error as Error).message)
    process.exit(1)
  }
  
  // ===========================================
  // STEP 3: Execute Game Skill - Get Portfolio
  // ===========================================
  
  console.log('\n📊 Step 3: Getting Portfolio via Natural Language...')
  
  try {
    const response = await babylon.sendMessage({
      message: {
        kind: 'message',
        messageId: crypto.randomUUID(),
        role: 'user',
        parts: [{
          kind: 'text',
          text: 'What is my current balance and positions?'
        }]
      }
    })
    
    console.log('✅ Response received!')
    console.log(JSON.stringify(response, null, 2))
    
    if ('kind' in response) {
      if (response.kind === 'task') {
        const task = response as Task
        console.log(`\n   Task Created: ${task.id}`)
        console.log(`   Status: ${task.status.state}`)
        
        if (task.artifacts && task.artifacts.length > 0) {
          console.log(`\n   Results:`)
          task.artifacts.forEach((artifact, i) => {
            console.log(`   Artifact ${i + 1}:`, JSON.stringify(artifact.parts, null, 2))
          })
        }
      } else if (response.kind === 'message') {
        console.log(`\n   Direct Response:`)
        const msg = response as Message
        msg.parts.forEach(part => {
          if (part.kind === 'text') {
            console.log(`   ${part.text}`)
          }
        })
      }
    }
  } catch (error) {
    console.error('❌ Portfolio query failed:', (error as Error).message)
  }
  
  // ===========================================
  // STEP 4: Execute Trading Skill - Buy Shares
  // ===========================================
  
  console.log('\n📈 Step 4: Executing Trade via Structured Input...')
  
  try {
    const tradeMessage = JSON.stringify({
      action: 'buy_shares',
      params: {
        marketId: 'market-example-123',  // Replace with real market ID
        outcome: 'YES',
        amount: 100
      }
    })
    
    const response = await babylon.sendMessage({
      message: {
        kind: 'message',
        messageId: crypto.randomUUID(),
        role: 'user',
        parts: [{
          kind: 'text',
          text: tradeMessage
        }]
      }
    })
    
    console.log('✅ Trade executed!')
    
    if ('kind' in response && response.kind === 'task') {
      const task = response as Task
      console.log(`   Task ID: ${task.id}`)
      console.log(`   Status: ${task.status.state}`)
      
      // Poll for completion
      if (task.status.state === 'working' || task.status.state === 'submitted') {
        console.log('\n   ⏳ Waiting for task to complete...')
        
        for (let i = 0; i < 10; i++) {
          await new Promise(resolve => setTimeout(resolve, 1000))
          
          const status = await babylon.getTask({ id: task.id })
          console.log(`   Status check ${i + 1}: ${status.status.state}`)
          
          if (['completed', 'failed', 'canceled'].includes(status.status.state)) {
            if (status.status.state === 'completed') {
              console.log('\n   ✅ Task completed successfully!')
              
              if (status.artifacts) {
                console.log(`   Results:`, JSON.stringify(status.artifacts, null, 2))
              }
            } else {
              console.log(`\n   ❌ Task ${status.status.state}`)
              if (status.status.message) {
                console.log(`   Message:`, status.status.message)
              }
            }
            break
          }
        }
      }
    }
  } catch (error) {
    console.error('❌ Trade failed:', (error as Error).message)
  }
  
  // ===========================================
  // STEP 5: Execute Social Skill - Create Post
  // ===========================================
  
  console.log('\n💬 Step 5: Creating Social Post via Natural Language...')
  
  try {
    const response = await babylon.sendMessage({
      message: {
        kind: 'message',
        messageId: crypto.randomUUID(),
        role: 'user',
        parts: [{
          kind: 'text',
          text: 'Post: Just executed my first trade via A2A protocol! 🚀'
        }]
      }
    })
    
    console.log('✅ Post created!')
    console.log(JSON.stringify(response, null, 2))
    
  } catch (error) {
    console.error('❌ Post creation failed:', (error as Error).message)
  }
  
  // ===========================================
  // STEP 6: List All Tasks
  // ===========================================
  
  console.log('\n📋 Step 6: Listing Recent Tasks...')
  
  try {
    // Note: tasks/list might not be implemented in basic SDK
    // This demonstrates the call pattern
    
    const response = await fetch(babylonEndpoint.replace('/.well-known/agent-card.json', '/api/a2a-official'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tasks/list',
        params: {
          pageSize: 10
        },
        id: Date.now()
      })
    })
    
    const result = await response.json()
    
    if (result.result) {
      console.log('✅ Tasks listed!')
      console.log(`   Total: ${result.result.totalSize || 0}`)
      console.log(`   Returned: ${result.result.tasks?.length || 0}`)
    }
  } catch (error) {
    console.log('⚠️  tasks/list not available yet')
  }
  
  console.log('\n' + '='.repeat(60))
  console.log('🎉 Example Complete!')
  console.log('\nYou've successfully:')
  console.log('  ✅ Discovered Babylon via Agent0 (or used fallback)')
  console.log('  ✅ Connected via official A2A protocol')
  console.log('  ✅ Executed multiple game skills')
  console.log('  ✅ Handled task lifecycle')
  console.log('\n💡 Next steps:')
  console.log('  - Register your own agent on Agent0')
  console.log('  - Build autonomous trading strategies')
  console.log('  - Integrate with your application')
}

// Run
main()
  .then(() => {
    console.log('\n✨ Done!')
    process.exit(0)
  })
  .catch(error => {
    console.error('\n💥 Fatal error:', error)
    process.exit(1)
  })

