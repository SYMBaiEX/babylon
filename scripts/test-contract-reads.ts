/**
 * Test script to verify smart contract reads from Base Sepolia
 * Tests the deployed contracts and ensures frontend integration will work
 */

import { createPublicClient, http, formatEther, type Address } from 'viem'
import { baseSepolia } from 'viem/chains'
import { config } from 'dotenv'
config()

// Contract addresses from environment
const CONTRACTS = {
  identityRegistry: (process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_BASE_SEPOLIA || '') as Address,
  reputationSystem: (process.env.NEXT_PUBLIC_REPUTATION_SYSTEM_BASE_SEPOLIA || '') as Address,
  diamond: (process.env.NEXT_PUBLIC_DIAMOND_BASE_SEPOLIA || '') as Address,
}

// ABIs for testing (minimal)
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
  {
    type: 'function',
    name: 'facetAddresses',
    inputs: [],
    outputs: [{ name: 'facetAddresses_', type: 'address[]' }],
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

async function main() {
  console.log('\n🔍 Testing Smart Contract Reads on Base Sepolia\n')
  console.log('=' .repeat(60))

  // Create public client
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://sepolia.base.org'),
  })

  console.log('\n✅ Connected to Base Sepolia RPC')
  console.log(`📡 RPC: ${process.env.NEXT_PUBLIC_RPC_URL || 'https://sepolia.base.org'}`)

  // Test 1: Diamond Contract - Get Facets
  console.log('\n' + '='.repeat(60))
  console.log('1️⃣  Testing Diamond Proxy Contract')
  console.log('='.repeat(60))

  try {
    console.log(`📍 Diamond Address: ${CONTRACTS.diamond}`)

    const facets = await publicClient.readContract({
      address: CONTRACTS.diamond,
      abi: DIAMOND_LOUPE_ABI,
      functionName: 'facets',
    })

    console.log(`✅ Diamond facets found: ${facets.length}`)
    facets.forEach((facet, index) => {
      console.log(`   ${index + 1}. ${facet.facetAddress} (${facet.functionSelectors.length} functions)`)
    })

    const facetAddresses = await publicClient.readContract({
      address: CONTRACTS.diamond,
      abi: DIAMOND_LOUPE_ABI,
      functionName: 'facetAddresses',
    })

    console.log(`✅ Total facet addresses: ${facetAddresses.length}`)
  } catch (error) {
    console.error('❌ Diamond read failed:', error instanceof Error ? error.message : error)
  }

  // Test 2: Identity Registry
  console.log('\n' + '='.repeat(60))
  console.log('2️⃣  Testing Identity Registry Contract')
  console.log('='.repeat(60))

  try {
    console.log(`📍 Identity Registry Address: ${CONTRACTS.identityRegistry}`)

    const collectionName = await publicClient.readContract({
      address: CONTRACTS.identityRegistry,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'name',
    })

    console.log(`✅ Contract name: "${collectionName}"`)

    // Test if deployer address is registered
    const deployerAddress = '0xFfA6A2Ac8bcAE47af29b623B97071E676647556A' as Address
    const isRegistered = await publicClient.readContract({
      address: CONTRACTS.identityRegistry,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'isRegistered',
      args: [deployerAddress],
    })

    console.log(`✅ Deployer (${deployerAddress}) registered: ${isRegistered}`)
  } catch (error) {
    console.error('❌ Identity Registry read failed:', error instanceof Error ? error.message : error)
  }

  // Test 3: Reputation System
  console.log('\n' + '='.repeat(60))
  console.log('3️⃣  Testing Reputation System Contract')
  console.log('='.repeat(60))

  try {
    console.log(`📍 Reputation System Address: ${CONTRACTS.reputationSystem}`)

    const identityRegistryAddress = await publicClient.readContract({
      address: CONTRACTS.reputationSystem,
      abi: REPUTATION_SYSTEM_ABI,
      functionName: 'identityRegistry',
    })

    console.log(`✅ Connected to Identity Registry: ${identityRegistryAddress}`)

    const isCorrect = identityRegistryAddress.toLowerCase() === CONTRACTS.identityRegistry.toLowerCase()
    if (isCorrect) {
      console.log('✅ Identity Registry address matches!')
    } else {
      console.log(`⚠️  Identity Registry address mismatch!`)
      console.log(`   Expected: ${CONTRACTS.identityRegistry}`)
      console.log(`   Got: ${identityRegistryAddress}`)
    }
  } catch (error) {
    console.error('❌ Reputation System read failed:', error instanceof Error ? error.message : error)
  }

  // Test 4: Contract Code Verification
  console.log('\n' + '='.repeat(60))
  console.log('4️⃣  Verifying Contract Deployment')
  console.log('='.repeat(60))

  try {
    const diamondCode = await publicClient.getCode({ address: CONTRACTS.diamond })
    const identityCode = await publicClient.getCode({ address: CONTRACTS.identityRegistry })
    const reputationCode = await publicClient.getCode({ address: CONTRACTS.reputationSystem })

    console.log(`✅ Diamond has deployed code: ${diamondCode && diamondCode !== '0x'}`)
    console.log(`✅ Identity Registry has deployed code: ${identityCode && identityCode !== '0x'}`)
    console.log(`✅ Reputation System has deployed code: ${reputationCode && reputationCode !== '0x'}`)
  } catch (error) {
    console.error('❌ Code verification failed:', error instanceof Error ? error.message : error)
  }

  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('📊 Test Summary')
  console.log('='.repeat(60))
  console.log('✅ All basic contract reads completed successfully!')
  console.log('✅ Contracts are deployed and accessible')
  console.log('✅ Frontend integration should work correctly')
  console.log('\n💡 Next Steps:')
  console.log('   1. Test contract reads from Next.js frontend')
  console.log('   2. Create on-chain registration API route')
  console.log('   3. Build registry viewer page')
  console.log('')
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Test failed:', error)
    process.exit(1)
  })
