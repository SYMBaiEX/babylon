// @ts-nocheck - Test file

/**
 * Contract Reads Integration Test
 * 
 * Tests smart contract reads from deployed contracts
 * Automatically ensures Anvil is running and contracts are deployed
 */

import { describe, test, expect, beforeAll } from 'bun:test'
import { createPublicClient, http, type Address } from 'viem'
import { baseSepolia } from 'viem/chains'
import { ensureContractsReady } from '../helpers/contract-setup'
import { loadDeployment } from '@/lib/deployment/validation'

const ANVIL_RPC_URL = 'http://localhost:8545'
const isLocalnet = !process.env.NEXT_PUBLIC_DIAMOND_BASE_SEPOLIA

// Contract addresses - will be loaded in beforeAll
let CONTRACTS: {
  identityRegistry: Address
  reputationSystem: Address
  diamond: Address
} = {
  identityRegistry: '' as Address,
  reputationSystem: '' as Address,
  diamond: '' as Address,
}

const DIAMOND_LOUPE_ABI = [
  {
    type: 'function',
    name: 'facets',
    inputs: [],
    outputs: [
      {
        name: 'facets_',
        type: 'tuple[]',
        components: [
          { name: 'facetAddress', type: 'address' },
          { name: 'functionSelectors', type: 'bytes4[]' },
        ],
      },
    ],
    stateMutability: 'view',
  },
] as const

const IDENTITY_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'isRegistered',
    inputs: [{ name: '_address', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'name',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
] as const

const REPUTATION_SYSTEM_ABI = [
  {
    type: 'function',
    name: 'identityRegistry',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
] as const

describe('Contract Reads', () => {
  let publicClient: ReturnType<typeof createPublicClient>
  let contractsAvailable = false

  beforeAll(async () => {
    // If using localnet, ensure Anvil and contracts are ready
    if (isLocalnet) {
      contractsAvailable = await ensureContractsReady()
      if (!contractsAvailable) {
        console.warn('⚠️  Contracts not available - skipping tests')
        return
      }
      
      // Load contract addresses from deployment file
      try {
        const deployment = await loadDeployment('localnet')
        if (deployment) {
          CONTRACTS.diamond = deployment.contracts.diamond as Address
          CONTRACTS.identityRegistry = deployment.contracts.identityRegistry as Address
          CONTRACTS.reputationSystem = deployment.contracts.reputationSystem as Address
        } else {
          // Fall back to environment variables
          CONTRACTS.diamond = (process.env.NEXT_PUBLIC_DIAMOND || '') as Address
          CONTRACTS.identityRegistry = (process.env.NEXT_PUBLIC_IDENTITY_REGISTRY || '') as Address
          CONTRACTS.reputationSystem = (process.env.NEXT_PUBLIC_REPUTATION_SYSTEM || '') as Address
        }
      } catch {
        // Fall back to environment variables
        CONTRACTS.diamond = (process.env.NEXT_PUBLIC_DIAMOND || '') as Address
        CONTRACTS.identityRegistry = (process.env.NEXT_PUBLIC_IDENTITY_REGISTRY || '') as Address
        CONTRACTS.reputationSystem = (process.env.NEXT_PUBLIC_REPUTATION_SYSTEM || '') as Address
      }
      
      // Use Anvil for localnet
      publicClient = createPublicClient({
        chain: {
          id: 31337,
          name: 'Anvil',
          network: 'anvil',
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
          rpcUrls: {
            default: { http: [ANVIL_RPC_URL] },
            public: { http: [ANVIL_RPC_URL] },
          },
        },
        transport: http(ANVIL_RPC_URL),
      }) as typeof publicClient
    } else {
      // Use testnet - load addresses from env
      CONTRACTS.diamond = (process.env.NEXT_PUBLIC_DIAMOND_BASE_SEPOLIA || '') as Address
      CONTRACTS.identityRegistry = (process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_BASE_SEPOLIA || '') as Address
      CONTRACTS.reputationSystem = (process.env.NEXT_PUBLIC_REPUTATION_SYSTEM_BASE_SEPOLIA || '') as Address
      
      if (!CONTRACTS.diamond) {
        console.warn('⚠️  Contracts not deployed to testnet - skipping tests')
        return
      }

      publicClient = createPublicClient({
        chain: baseSepolia,
        transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://sepolia.base.org'),
      }) as typeof publicClient
      contractsAvailable = true
    }
  })

  test('Diamond contract - read facets', async () => {
    if (!contractsAvailable || !CONTRACTS.diamond) return

    const facets = await publicClient.readContract({
      address: CONTRACTS.diamond,
      abi: DIAMOND_LOUPE_ABI,
      functionName: 'facets',
    })

    expect(facets).toBeDefined()
    expect(facets.length).toBeGreaterThan(0)
  })

  test('Identity Registry - read name', async () => {
    if (!contractsAvailable || !CONTRACTS.identityRegistry) return

    const name = await publicClient.readContract({
      address: CONTRACTS.identityRegistry,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'name',
    })

    expect(name).toBeDefined()
    expect(typeof name).toBe('string')
  })

  test('Reputation System - verify registry link', async () => {
    if (!contractsAvailable || !CONTRACTS.reputationSystem || !CONTRACTS.identityRegistry) return

    const registryAddress = await publicClient.readContract({
      address: CONTRACTS.reputationSystem,
      abi: REPUTATION_SYSTEM_ABI,
      functionName: 'identityRegistry',
    })

    expect(registryAddress.toLowerCase()).toBe(CONTRACTS.identityRegistry.toLowerCase())
  })

  test('Contracts have deployed code', async () => {
    if (!contractsAvailable || !CONTRACTS.diamond) return

    const diamondCode = await publicClient.getCode({ address: CONTRACTS.diamond })
    expect(diamondCode).toBeDefined()
    expect(diamondCode).not.toBe('0x')
  })
})

