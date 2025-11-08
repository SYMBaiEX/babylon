/**
 * Query all agents registered to Babylon's custom identity registry
 * Network: Base Sepolia
 */

import { createPublicClient, http, type Address } from 'viem'
import { baseSepolia } from 'viem/chains'

// Babylon's Identity Registry on Base Sepolia
const IDENTITY_REGISTRY = process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_BASE_SEPOLIA as Address

// Identity Registry ABI
const IDENTITY_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'getAllActiveAgents',
    inputs: [],
    outputs: [{ name: '', type: 'uint256[]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getAgentProfile',
    inputs: [{ name: '_tokenId', type: 'uint256' }],
    outputs: [
      { name: 'name', type: 'string' },
      { name: 'endpoint', type: 'string' },
      { name: 'capabilitiesHash', type: 'bytes32' },
      { name: 'registeredAt', type: 'uint256' },
      { name: 'isActive', type: 'bool' },
      { name: 'metadata', type: 'string' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'ownerOf',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalSupply',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const

async function queryBabylonAgents() {
  console.log('🔍 Querying Babylon Game Registry...\n')
  console.log('📋 Registry Details:')
  console.log(`   Network: Base Sepolia`)
  console.log(`   Registry: ${IDENTITY_REGISTRY}`)
  console.log(`   RPC: ${baseSepolia.rpcUrls.default.http[0]}\n`)

  // Create public client
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(),
  })

  try {
    // Get all active agents
    const activeAgentIds = (await publicClient.readContract({
      address: IDENTITY_REGISTRY,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'getAllActiveAgents',
    })) as bigint[]

    console.log(`✅ Found ${activeAgentIds.length} active agents\n`)

    if (activeAgentIds.length === 0) {
      console.log('No agents registered yet.')
      return
    }

    // Fetch details for each agent
    console.log('📊 Agent Details:\n')
    console.log('─'.repeat(80))

    for (const tokenId of activeAgentIds) {
      try {
        const [profile, owner] = await Promise.all([
          publicClient.readContract({
            address: IDENTITY_REGISTRY,
            abi: IDENTITY_REGISTRY_ABI,
            functionName: 'getAgentProfile',
            args: [tokenId],
          }) as Promise<[string, string, `0x${string}`, bigint, boolean, string]>,
          publicClient.readContract({
            address: IDENTITY_REGISTRY,
            abi: IDENTITY_REGISTRY_ABI,
            functionName: 'ownerOf',
            args: [tokenId],
          }) as Promise<Address>,
        ])

        const [name, endpoint, capabilitiesHash, registeredAt, isActive, metadata] = profile

        console.log(`\n🤖 Agent #${tokenId}`)
        console.log(`   Name: ${name}`)
        console.log(`   Owner: ${owner}`)
        console.log(`   Endpoint: ${endpoint}`)
        console.log(`   Capabilities Hash: ${capabilitiesHash}`)
        console.log(`   Registered: ${new Date(Number(registeredAt) * 1000).toISOString()}`)
        console.log(`   Status: ${isActive ? '✅ Active' : '❌ Inactive'}`)
        
        // Try to parse metadata as JSON
        try {
          const meta = JSON.parse(metadata)
          console.log(`   Metadata:`)
          console.log(`      Type: ${meta.type || 'N/A'}`)
          console.log(`      Bio: ${meta.bio || 'N/A'}`)
          if (meta.registered) {
            console.log(`      Registered: ${meta.registered}`)
          }
        } catch {
          console.log(`   Metadata: ${metadata.substring(0, 100)}${metadata.length > 100 ? '...' : ''}`)
        }
        console.log('─'.repeat(80))
      } catch (error) {
        console.error(`   ❌ Error fetching agent #${tokenId}:`, error)
      }
    }

    console.log(`\n✅ Query complete! Found ${activeAgentIds.length} active agents.`)
  } catch (error) {
    console.error('❌ Error querying registry:', error)
    throw error
  }
}

// Run the query
queryBabylonAgents().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})




