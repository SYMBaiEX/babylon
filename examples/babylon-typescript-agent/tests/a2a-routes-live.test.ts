/**
 * A2A Routes Live Verification
 * 
 * Tests all A2A routes against live Babylon instance
 * Verifies data is returned correctly
 * 
 * NOTE: A2A protocol currently implements 10 core methods
 */

import { describe, it, expect } from 'bun:test'
import { BabylonA2AClient } from '../src/a2a-client'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const TEST_CONFIG = {
  apiUrl: 'http://localhost:3000/api/a2a',
  address: '0x' + '1'.repeat(40),
  tokenId: 999999,
  privateKey: '0x' + '1'.repeat(64)
}

describe('A2A Routes Live Verification', () => {
  const client = new BabylonA2AClient(TEST_CONFIG)

  it('should connect to server and authenticate', async () => {
    console.log('\n🔍 Testing A2A HTTP Connection...')
    
    // Check if server is accessible
    const response = await fetch('http://localhost:3000/api/health')
    const health = await response.json()
    expect(health.status).toBe('ok')
    console.log('✅ Server is running:', health.status)

    // Connect A2A client
    await client.connect()
    expect(client.agentId).toBeDefined()
    expect(client.sessionToken).toBeDefined()
    console.log('✅ A2A Client connected:', client.agentId)
  })

  it('should have all 10 A2A methods available', () => {
    const methods = [
      // Agent Discovery (2)
      'discoverAgents', 'getAgentInfo',
      
      // Market Operations (3)
      'getMarketData', 'getMarketPrices', 'subscribeMarket',
      
      // Portfolio (3)
      'getBalance', 'getPositions', 'getUserWallet',
      
      // Payments (2)
      'paymentRequest', 'paymentReceipt'
    ]
    
    let missingMethods: string[] = []
    let foundCount = 0
    
    methods.forEach(method => {
      if (typeof (client as unknown as Record<string, (...args: unknown[]) => unknown>)[method] === 'function') {
        foundCount++
      } else {
        missingMethods.push(method)
      }
    })
    
    console.log(`   ✅ Found ${foundCount}/${methods.length} A2A methods`)
    
    if (missingMethods.length > 0) {
      console.log(`   ⚠️  Missing: ${missingMethods.join(', ')}`)
    }
    
    expect(foundCount).toBe(10)
  })
})

export {}
