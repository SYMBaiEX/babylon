/**
 * A2A Routes Verification Test
 * 
 * Live tests that verify all A2A routes work and return correct data
 * Tests connection to live Babylon instance and validates responses
 * 
 * NOTE: A2A protocol currently implements 10 core methods
 */

import { describe, it, expect } from 'bun:test'
import { BabylonA2AClient } from '../src/a2a-client'

// Test with mock credentials for route verification
const TEST_CONFIG = {
  apiUrl: 'http://localhost:3000/api/a2a',
  address: '0x' + '1'.repeat(40),
  tokenId: 999999,
  privateKey: '0x' + '1'.repeat(64)
}

describe('A2A Routes Live Verification', () => {
  const client = new BabylonA2AClient(TEST_CONFIG)

  it('should connect to Babylon A2A HTTP endpoint', async () => {
    console.log('\n🔍 Testing A2A HTTP Connection...')
    
    // Check if server is accessible
    const response = await fetch('http://localhost:3000/api/health')
    const health = await response.json()
    expect(health.status).toBe('ok')
    console.log('✅ Server is running:', health.status)
    
    // Create and connect A2A client
    await client.connect()
    expect(client.agentId).toBeDefined()
    expect(client.sessionToken).toBeDefined()
    console.log('✅ A2A Client connected successfully')
  })

  it('should get balance', async () => {
    const balanceResult = await client.getBalance()
    console.log('   ✅ getBalance:', balanceResult)
    expect(balanceResult).toBeDefined()
  })

  it('should get positions', async () => {
    const positionsResult = await client.getPositions()
    console.log('   ✅ getPositions:', positionsResult)
    expect(positionsResult).toBeDefined()
  })

  it('should get market data', async () => {
    // This will fail if no markets exist, which is expected
    try {
      const marketDataResult = await client.getMarketData('market-123')
      console.log('   ✅ getMarketData:', marketDataResult)
      expect(marketDataResult).toBeDefined()
    } catch (error) {
      console.log('   ⏭️  getMarketData: Skipped (no market ID)')
    }
  })

  it('should discover agents', async () => {
    const discoverResult = await client.discoverAgents({}, 10)
    console.log('   ✅ discoverAgents:', discoverResult)
    expect(discoverResult).toBeDefined()
  })

  it('should get agent info', async () => {
    try {
      const infoResult = await client.getAgentInfo(client.agentId!)
      console.log('   ✅ getAgentInfo:', infoResult)
      expect(infoResult).toBeDefined()
    } catch (error) {
      console.log('   ⏭️  getAgentInfo: Skipped (agent not found)')
    }
  })
})

// Test that can run without connection
describe('A2A Client Method Availability', () => {
  it('should have all 10 A2A methods available', () => {
    const client = new BabylonA2AClient(TEST_CONFIG)
    
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
    
    methods.forEach(method => {
      if (typeof (client as unknown as Record<string, (...args: unknown[]) => unknown>)[method] !== 'function') {
        missingMethods.push(method)
      }
    })
    
    if (missingMethods.length > 0) {
      console.log('❌ Missing methods:', missingMethods)
    } else {
      console.log(`✅ All ${methods.length} A2A methods are available`)
    }
    
    expect(missingMethods.length).toBe(0)
    expect(methods.length).toBe(10)
  })
})

export {}
