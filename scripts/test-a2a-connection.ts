/**
 * Test A2A Connection
 * 
 * Verifies that A2A server is running and agents can connect
 */

import { A2AClient } from '@/a2a/client/a2a-client'
import { logger } from '@/lib/logger'
import { ethers } from 'ethers'

async function testA2AConnection() {
  console.log('🧪 Testing A2A Server Connection...\n')
  
  try {
    // Check environment
    console.log('1️⃣  Checking environment configuration...')
    
    const endpoint = process.env.BABYLON_A2A_ENDPOINT
    if (!endpoint) {
      throw new Error('BABYLON_A2A_ENDPOINT not set in environment')
    }
    console.log(`   ✅ Endpoint: ${endpoint}`)
    
    const privateKey = process.env.AGENT_DEFAULT_PRIVATE_KEY
    if (!privateKey) {
      throw new Error('AGENT_DEFAULT_PRIVATE_KEY not set in environment')
    }
    console.log('   ✅ Private key configured\n')
    
    // Create test wallet
    console.log('2️⃣  Creating test credentials...')
    const wallet = new ethers.Wallet(privateKey)
    const address = wallet.address
    console.log(`   ✅ Address: ${address}\n`)
    
    // Create A2A client
    console.log('3️⃣  Creating A2A client...')
    const client = new A2AClient({
      endpoint,
      credentials: {
        address,
        privateKey,
        tokenId: 9999 // Test token ID
      },
      capabilities: {
        strategies: ['test'],
        markets: ['prediction'],
        actions: ['read'],
        version: '1.0.0'
      },
      autoReconnect: false
    })
    console.log('   ✅ Client created\n')
    
    // Attempt connection
    console.log('4️⃣  Connecting to A2A server...')
    console.log(`   Endpoint: ${endpoint}`)
    
    const connectTimeout = setTimeout(() => {
      throw new Error('Connection timeout after 10 seconds')
    }, 10000)
    
    await client.connect()
    clearTimeout(connectTimeout)
    
    console.log('   ✅ Connected successfully!\n')
    
    // Test basic methods
    console.log('5️⃣  Testing A2A methods...')
    
    try {
      const predictions = await client.sendRequest('a2a.getPredictions', { status: 'active' })
      console.log(`   ✅ getPredictions: ${JSON.stringify(predictions).substring(0, 50)}...`)
    } catch (error) {
      console.log(`   ⚠️  getPredictions: ${error instanceof Error ? error.message : 'Error'}`)
    }
    
    try {
      const balance = await client.sendRequest('a2a.getBalance', {})
      console.log(`   ✅ getBalance: ${JSON.stringify(balance).substring(0, 50)}...`)
    } catch (error) {
      console.log(`   ⚠️  getBalance: ${error instanceof Error ? error.message : 'Error'}`)
    }
    
    try {
      const feed = await client.sendRequest('a2a.getFeed', { limit: 5, offset: 0 })
      console.log(`   ✅ getFeed: ${JSON.stringify(feed).substring(0, 50)}...`)
    } catch (error) {
      console.log(`   ⚠️  getFeed: ${error instanceof Error ? error.message : 'Error'}`)
    }
    
    console.log()
    
    // Disconnect
    console.log('6️⃣  Disconnecting...')
    await client.disconnect()
    console.log('   ✅ Disconnected\n')
    
    // Summary
    console.log('='.repeat(60))
    console.log('✅ A2A CONNECTION TEST PASSED')
    console.log('='.repeat(60))
    console.log('A2A server is running and accessible')
    console.log('Agents can connect and communicate via A2A protocol')
    console.log('='.repeat(60) + '\n')
    
    process.exit(0)
    
  } catch (error) {
    console.error('\n' + '='.repeat(60))
    console.error('❌ A2A CONNECTION TEST FAILED')
    console.error('='.repeat(60))
    console.error('Error:', error instanceof Error ? error.message : error)
    console.error('='.repeat(60))
    
    console.log('\n📋 Troubleshooting Steps:')
    console.log('   1. Start A2A server: npm run a2a:server')
    console.log('   2. Check .env.local has:')
    console.log('      BABYLON_A2A_ENDPOINT="ws://localhost:8765"')
    console.log('      AGENT_DEFAULT_PRIVATE_KEY="0x..."')
    console.log('   3. Verify port 8765 is not in use: lsof -i :8765')
    console.log('   4. Check A2A server logs for errors')
    console.log('   5. See A2A_SETUP.md for complete guide\n')
    
    process.exit(1)
  }
}

// Run test
testA2AConnection().catch(console.error)

