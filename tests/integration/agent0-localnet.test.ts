/**
 * Agent0 Localnet Integration Tests
 * 
 * Tests Agent0 integration on local Anvil instance
 * These tests are designed to run automatically without manual configuration
 */

import { describe, test, expect, beforeAll } from 'bun:test'
import { execSync } from 'child_process'
import { Agent0Client } from '../../src/agents/agent0/Agent0Client'
import { GameDiscoveryService } from '../../src/agents/agent0/GameDiscovery'

// Default Anvil configuration
const ANVIL_RPC_URL = process.env.AGENT0_RPC_URL || process.env.ANVIL_RPC_URL || 'http://localhost:8545'
const ANVIL_PRIVATE_KEY = process.env.AGENT0_PRIVATE_KEY || process.env.BABYLON_GAME_PRIVATE_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const ANVIL_CHAIN_ID = 31337

/**
 * Check if Anvil is running, start it if needed
 */
async function ensureAnvilRunning(): Promise<boolean> {
  try {
    // Check if Anvil is responding
    execSync(`cast block-number --rpc-url ${ANVIL_RPC_URL}`, { stdio: 'ignore' })
    return true
  } catch {
    // Try to start Anvil via docker-compose
    try {
      console.log('🔄 Starting Anvil...')
      execSync('docker-compose up -d anvil', { stdio: 'inherit' })
      
      // Wait for Anvil to be ready (max 30 seconds)
      for (let i = 0; i < 30; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000))
        try {
          execSync(`cast block-number --rpc-url ${ANVIL_RPC_URL}`, { stdio: 'ignore' })
          console.log('✅ Anvil started successfully')
          return true
        } catch {
          // Continue waiting
        }
      }
      
      console.log('⚠️  Anvil startup timeout')
      return false
    } catch (error) {
      console.log('⚠️  Could not start Anvil:', error instanceof Error ? error.message : String(error))
      return false
    }
  }
}

describe('Agent0 Localnet Integration', () => {
  let anvilRunning = false

  beforeAll(async () => {
    // Set environment for localnet testing
    process.env.AGENT0_NETWORK = 'localnet'
    process.env.AGENT0_ENABLED = 'true'
    process.env.AGENT0_RPC_URL = ANVIL_RPC_URL
    process.env.AGENT0_PRIVATE_KEY = ANVIL_PRIVATE_KEY
    
    // Ensure Anvil is running
    anvilRunning = await ensureAnvilRunning()
    
    if (!anvilRunning) {
      console.log('⚠️  Anvil not available - some tests will be skipped')
    }
  })

  test('Anvil is running and accessible', () => {
    expect(anvilRunning).toBe(true)
    
    if (anvilRunning) {
      try {
        const blockNumber = execSync(`cast block-number --rpc-url ${ANVIL_RPC_URL}`, { encoding: 'utf-8' }).trim()
        console.log(`✅ Anvil is running at block ${blockNumber}`)
        expect(parseInt(blockNumber)).toBeGreaterThanOrEqual(0)
      } catch (error) {
        throw new Error(`Anvil RPC check failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  })

  test('Agent0 configuration is valid for localnet', () => {
    expect(process.env.AGENT0_NETWORK).toBe('localnet')
    expect(process.env.AGENT0_ENABLED).toBe('true')
    expect(ANVIL_RPC_URL).toBeDefined()
    expect(ANVIL_PRIVATE_KEY).toBeDefined()
    
    console.log('✅ Agent0 configuration valid for localnet')
    console.log(`   RPC URL: ${ANVIL_RPC_URL}`)
    console.log(`   Chain ID: ${ANVIL_CHAIN_ID}`)
  })

  test('Can initialize Agent0Client for localnet', () => {
    if (!anvilRunning) {
      console.log('⚠️  Anvil not running, skipping client initialization test')
      return
    }

    const client = new Agent0Client({
      network: 'localnet',
      rpcUrl: ANVIL_RPC_URL,
      privateKey: ANVIL_PRIVATE_KEY
    })

    expect(client).toBeDefined()
    
    // Note: isAvailable() might return false if SDK initialization fails
    // This is OK for localnet testing - we're mainly checking the client can be created
    console.log('✅ Agent0Client initialized for localnet')
  })

  test('RPC URL is configurable', () => {
    const customRpcUrl = process.env.AGENT0_RPC_URL || ANVIL_RPC_URL
    
    expect(customRpcUrl).toBeDefined()
    expect(customRpcUrl).toMatch(/^https?:\/\//)
    
    console.log(`✅ RPC URL is configurable: ${customRpcUrl}`)
  })

  test('Can create Agent0Client with custom RPC URL', () => {
    if (!anvilRunning) {
      console.log('⚠️  Anvil not running, skipping custom RPC test')
      return
    }

    const customRpcUrl = process.env.AGENT0_RPC_URL || ANVIL_RPC_URL
    
    const client = new Agent0Client({
      network: 'localnet',
      rpcUrl: customRpcUrl,
      privateKey: ANVIL_PRIVATE_KEY
    })

    expect(client).toBeDefined()
    console.log(`✅ Agent0Client created with custom RPC: ${customRpcUrl}`)
  })

  test('GameDiscoveryService can be instantiated', () => {
    // For localnet, subgraph might not be available
    // This is OK - we're just testing that the service can be created
    // Actual discovery functionality requires a subgraph
    if (!process.env.AGENT0_SUBGRAPH_URL) {
      console.log('⚠️  AGENT0_SUBGRAPH_URL not set - GameDiscoveryService requires subgraph')
      console.log('   This is expected for localnet testing without subgraph')
      return
    }
    
    try {
      const discovery = new GameDiscoveryService()
      expect(discovery).toBeDefined()
      console.log('✅ GameDiscoveryService instantiated')
    } catch (error) {
      // If subgraph URL is invalid, that's OK for localnet
      if (error instanceof Error && error.message.includes('AGENT0_SUBGRAPH_URL')) {
        console.log('⚠️  Subgraph not configured - skipping GameDiscoveryService test')
        return
      }
      throw error
    }
  })

  test('Chain ID is correctly set for localnet', () => {
    if (!anvilRunning) {
      console.log('⚠️  Anvil not running, skipping chain ID test')
      return
    }

    const client = new Agent0Client({
      network: 'localnet',
      rpcUrl: ANVIL_RPC_URL,
      privateKey: ANVIL_PRIVATE_KEY
    })

    // Access private chainId via reflection for testing
    const chainId = (client as any).chainId
    expect(chainId).toBe(ANVIL_CHAIN_ID)
    console.log(`✅ Chain ID correctly set to ${ANVIL_CHAIN_ID}`)
  })

  test('IPFS configuration is valid', () => {
    const ipfsProvider = process.env.AGENT0_IPFS_PROVIDER || 'node'
    expect(['node', 'pinata', 'filecoinPin']).toContain(ipfsProvider)
    console.log(`✅ IPFS provider: ${ipfsProvider}`)
  })

  test('Private key is valid format', () => {
    expect(ANVIL_PRIVATE_KEY).toMatch(/^0x[a-fA-F0-9]{64}$/)
    console.log('✅ Private key format is valid')
  })
})

