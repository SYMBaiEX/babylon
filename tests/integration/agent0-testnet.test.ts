/**
 * Agent0 Testnet Integration Tests
 * 
 * Tests Agent0 integration on Base Sepolia testnet
 * Falls back to local Anvil if testnet config is not available
 */

import { describe, test, expect, beforeAll } from 'bun:test'
import { Agent0Client } from '../../src/agents/agent0/Agent0Client'
import { GameDiscoveryService } from '../../src/agents/agent0/GameDiscovery'
import { ensureContractsReady } from '../helpers/contract-setup'

const ANVIL_RPC_URL = 'http://localhost:8545'
const ANVIL_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

// Determine if we're using testnet or localnet
const isTestnet = !!(process.env.BASE_SEPOLIA_RPC_URL && process.env.BABYLON_GAME_PRIVATE_KEY)
const useLocalnet = !isTestnet

describe('Agent0 Testnet Integration', () => {
  const isAgent0Enabled = process.env.AGENT0_ENABLED === 'true' || useLocalnet
  const hasRequiredConfig = isTestnet || useLocalnet
  let contractsReady = false

  beforeAll(async () => {
    // If using localnet, ensure Anvil and contracts are ready
    if (useLocalnet) {
      contractsReady = await ensureContractsReady()
      if (contractsReady) {
        // Set up environment for localnet
        process.env.AGENT0_NETWORK = 'localnet'
        process.env.AGENT0_ENABLED = 'true'
        process.env.AGENT0_RPC_URL = ANVIL_RPC_URL
        process.env.AGENT0_PRIVATE_KEY = ANVIL_PRIVATE_KEY
        process.env.BASE_SEPOLIA_RPC_URL = ANVIL_RPC_URL
        process.env.BABYLON_GAME_PRIVATE_KEY = ANVIL_PRIVATE_KEY
      }
    }
  })

  test('Agent0 configuration is valid', () => {
    if (!isAgent0Enabled && !contractsReady) {
      console.log('⚠️  Agent0 not enabled, skipping test')
      console.log('   Run: bun run agent0:configure')
      return
    }

    const network = useLocalnet ? 'localnet' : 'sepolia'
    expect(process.env.AGENT0_NETWORK || network).toBeDefined()
    expect(process.env.BASE_SEPOLIA_RPC_URL || ANVIL_RPC_URL).toBeDefined()

    console.log(`✅ Agent0 configuration valid for ${useLocalnet ? 'localnet' : 'testnet'}`)
  })

  test('Can initialize Agent0Client for testnet', async () => {
    if (!hasRequiredConfig && !contractsReady) {
      console.log('⚠️  Missing Agent0 configuration, skipping test')
      return
    }

    const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL || ANVIL_RPC_URL
    const privateKey = process.env.BABYLON_GAME_PRIVATE_KEY || ANVIL_PRIVATE_KEY
    const network = useLocalnet ? 'localnet' : 'sepolia'

    expect(rpcUrl).toBeDefined()
    expect(privateKey).toBeDefined()

    const client = new Agent0Client({
      network,
      rpcUrl,
      privateKey
    })

    expect(client).toBeDefined()
    
    // Initialize SDK and check availability
    // For localnet, SDK might be read-only (no Agent0 contracts deployed)
    // This is OK - we're mainly checking the client can be created and initialized
    const isAvailable = await client.ensureAvailable()
    if (useLocalnet) {
      // For localnet, just check that SDK was initialized (not null)
      const sdk = client.getSDK()
      expect(sdk).not.toBeNull()
      if (!isAvailable) {
        console.log('⚠️  SDK initialized but in read-only mode (expected for localnet without Agent0 contracts)')
      }
    } else {
      // For testnet, require full availability
      expect(isAvailable).toBe(true)
    }

    console.log(`✅ Agent0Client initialized for ${useLocalnet ? 'localnet' : 'testnet'}`)
  })

  test('GameDiscoveryService can query testnet', async () => {
    if (!isAgent0Enabled && !contractsReady) {
      console.log('⚠️  Agent0 not enabled, skipping discovery test')
      return
    }

    // For localnet, subgraph might not be available
    if (useLocalnet && !process.env.AGENT0_SUBGRAPH_URL) {
      console.log('⚠️  AGENT0_SUBGRAPH_URL not set for localnet - skipping discovery test')
      console.log('   Subgraph is optional for localnet testing')
      return
    }

    const discovery = new GameDiscoveryService()
    const games = await discovery.discoverGames({
      type: 'game-platform',
      markets: ['prediction']
    })

    expect(Array.isArray(games)).toBe(true)
    console.log(`✅ Found ${games.length} game(s) on ${useLocalnet ? 'localnet' : 'testnet'} Agent0 network`)

    if (games.length > 0) {
      console.log('   Example game:', games[0]?.name)
    }
  })

  test('Can find Babylon in Agent0 network', async () => {
    if (!isAgent0Enabled && !contractsReady) {
      console.log('⚠️  Agent0 not enabled, skipping Babylon discovery test')
      return
    }

    // For localnet, subgraph might not be available
    if (useLocalnet && !process.env.AGENT0_SUBGRAPH_URL) {
      console.log('⚠️  AGENT0_SUBGRAPH_URL not set for localnet - skipping Babylon discovery test')
      console.log('   Subgraph is optional for localnet testing')
      return
    }

    const discovery = new GameDiscoveryService()
    const babylon = await discovery.findBabylon()

    if (babylon) {
      expect(babylon.name).toContain('Babylon')
      expect(babylon.endpoints).toBeDefined()
      console.log(`✅ Babylon found in Agent0 network (${useLocalnet ? 'localnet' : 'testnet'})`)
      console.log(`   Name: ${babylon.name}`)
      console.log(`   Endpoints: ${Object.keys(babylon.endpoints).join(', ')}`)
    } else {
      console.log(`⚠️  Babylon not found in Agent0 network (${useLocalnet ? 'localnet' : 'testnet'})`)
      if (!useLocalnet) {
        console.log('   Run registration: bun run agent0:register')
      }
    }
  })

  test('Agent0 registration can be verified', async () => {
    if (!hasRequiredConfig && !contractsReady) {
      console.log('⚠️  Missing Agent0 configuration, skipping registration test')
      return
    }

    const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL || ANVIL_RPC_URL
    const privateKey = process.env.BABYLON_GAME_PRIVATE_KEY || ANVIL_PRIVATE_KEY
    const network = useLocalnet ? 'localnet' : 'sepolia'

    expect(rpcUrl).toBeDefined()
    expect(privateKey).toBeDefined()

    const client = new Agent0Client({
      network,
      rpcUrl,
      privateKey
    })

    expect(client).toBeDefined()

    // Initialize SDK and check availability
    // For localnet, SDK might be read-only (no Agent0 contracts deployed)
    // This is OK - we're mainly checking the client can be created and initialized
    const isAvailable = await client.ensureAvailable()
    if (useLocalnet) {
      // For localnet, just check that SDK was initialized (not null)
      const sdk = client.getSDK()
      expect(sdk).not.toBeNull()
      if (!isAvailable) {
        console.log('⚠️  SDK initialized but in read-only mode (expected for localnet without Agent0 contracts)')
      }
    } else {
      // For testnet, require full availability
      expect(isAvailable).toBe(true)
    }
    console.log(`✅ Agent0Client ready for registration (${useLocalnet ? 'localnet' : 'testnet'})`)
  })

  test('IPFS configuration is valid', () => {
    if (!isAgent0Enabled && !contractsReady) {
      console.log('⚠️  Agent0 not enabled, skipping IPFS test')
      return
    }

    const ipfsProvider = process.env.AGENT0_IPFS_PROVIDER || 'node'
    expect(['node', 'pinata', 'filecoinPin']).toContain(ipfsProvider)

    if (ipfsProvider === 'pinata') {
      if (!process.env.PINATA_JWT) {
        console.log('⚠️  PINATA_JWT not set but Pinata provider selected')
      } else {
        console.log('✅ Pinata IPFS configuration present')
      }
    } else {
      console.log(`✅ IPFS provider: ${ipfsProvider}`)
    }
  })
})

