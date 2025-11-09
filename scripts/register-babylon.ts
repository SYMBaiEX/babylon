/**
 * Register Babylon with Agent0
 *
 * This script registers Babylon as a discoverable entity in the Agent0 registry.
 * Uses agent0-sdk directly to avoid import chain issues.
 */

import { SDK } from 'agent0-sdk'
import { PrismaClient } from '@prisma/client'
import 'dotenv/config'

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
})

async function main() {
  try {
    console.log('Starting Babylon registration with Agent0...')

    // Check if already registered
    if (process.env.BABYLON_REGISTRY_REGISTERED === 'true') {
      console.log('✓ Babylon already registered, skipping...')
      const config = await prisma.gameConfig.findUnique({
        where: { key: 'agent0_registration' }
      })
      if (config?.value) {
        const value = config.value as Record<string, unknown>
        console.log('\n⚠️  Registration skipped (already registered)')
        console.log(`   Token ID: ${value.tokenId}`)
        console.log(`   Metadata CID: ${value.metadataCID}`)
      }
      await prisma.$disconnect()
      return
    }

    if (process.env.AGENT0_ENABLED !== 'true') {
      console.log('ℹ Agent0 integration disabled, skipping registration')
      await prisma.$disconnect()
      return
    }

    const gameWalletAddress = process.env.BABYLON_GAME_WALLET_ADDRESS
    const gamePrivateKey = process.env.BABYLON_GAME_PRIVATE_KEY
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.VERCEL_URL || 'http://localhost:3000'

    if (!gameWalletAddress || !gamePrivateKey) {
      console.warn('⚠ BABYLON_GAME_WALLET_ADDRESS or BABYLON_GAME_PRIVATE_KEY not configured')
      await prisma.$disconnect()
      return
    }

    console.log(`  Network: ${process.env.AGENT0_NETWORK || 'sepolia'}`)
    console.log(`  Wallet: ${gameWalletAddress}`)

    // Initialize Agent0 SDK
    const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com'
    const network = (process.env.AGENT0_NETWORK as 'sepolia' | 'mainnet') || 'sepolia'
    const chainId = network === 'sepolia' ? 11155111 : 1

    // Configure IPFS
    const ipfsConfig = process.env.PINATA_JWT
      ? { ipfs: 'pinata' as const, pinataJwt: process.env.PINATA_JWT }
      : { ipfs: 'node' as const, ipfsNodeUrl: process.env.IPFS_NODE_URL || 'https://ipfs.io' }

    const sdk = new SDK({
      chainId,
      rpcUrl,
      signer: gamePrivateKey,
      ...ipfsConfig
    })

    console.log('✓ SDK initialized')

    // Create agent
    const agent = sdk.createAgent(
      'Babylon Prediction Markets',
      'Real-time prediction market game with autonomous AI agents. Trade predictions on crypto, politics, sports, tech, and entertainment.',
      'https://babylon.game/logo.png'
    )

    console.log('✓ Agent created')

    // Configure endpoints
    const a2aEndpoint = process.env.NEXT_PUBLIC_A2A_ENDPOINT || `${apiBaseUrl.replace('http', 'ws')}/ws/a2a`
    const mcpEndpoint = process.env.NEXT_PUBLIC_MCP_ENDPOINT || `${apiBaseUrl}/mcp`

    await agent.setA2A(a2aEndpoint, '1.0.0')
    await agent.setMCP(mcpEndpoint, '1.0.0')

    console.log('✓ Endpoints configured')
    console.log(`  A2A: ${a2aEndpoint}`)
    console.log(`  MCP: ${mcpEndpoint}`)

    // Set wallet and metadata
    agent.setAgentWallet(gameWalletAddress as `0x${string}`, chainId)
    agent.setMetadata({
      version: '1.0.0',
      network: network,
      categories: ['crypto', 'politics', 'sports', 'tech', 'entertainment'],
      markets: ['prediction', 'perpetuals', 'pools']
    })
    agent.setActive(true)
    agent.setX402Support(false)

    console.log('✓ Metadata configured')

    // Register on-chain with IPFS
    console.log('Registering on-chain with IPFS...')
    const registrationFile = await agent.registerIPFS()

    console.log('✓ Registration complete!')
    console.log(`  Agent ID: ${registrationFile.agentId}`)
    console.log(`  Agent URI: ${registrationFile.agentURI}`)

    // Validate registration response
    if (!registrationFile.agentId || !registrationFile.agentURI) {
      throw new Error('Registration succeeded but agentId or agentURI not returned')
    }

    // Extract token ID and CID
    const tokenId = parseInt(registrationFile.agentId.split(':')[1] || '0', 10)
    const metadataCID = registrationFile.agentURI.replace('ipfs://', '')

    // Store in database
    await prisma.gameConfig.upsert({
      where: { key: 'agent0_registration' },
      create: {
        key: 'agent0_registration',
        value: {
          registered: true,
          tokenId,
          metadataCID,
          agentId: registrationFile.agentId,
          agentURI: registrationFile.agentURI,
          registeredAt: new Date().toISOString()
        }
      },
      update: {
        value: {
          registered: true,
          tokenId,
          metadataCID,
          agentId: registrationFile.agentId,
          agentURI: registrationFile.agentURI,
          registeredAt: new Date().toISOString()
        }
      }
    })

    console.log('\n✅ Registration successful!')
    console.log(`   Token ID: ${tokenId}`)
    console.log(`   Metadata CID: ${metadataCID}`)
    console.log(`   Registered at: ${new Date().toISOString()}`)
    console.log('\nNext steps:')
    console.log('1. Set BABYLON_REGISTRY_REGISTERED=true in your .env file')
    console.log('2. Verify registration: bun run agent0:check')
    console.log('3. View on IPFS: https://ipfs.io/ipfs/' + metadataCID)

  } catch (error) {
    console.error('\n❌ Registration failed:', error)
    if (error instanceof Error) {
      console.error('Stack:', error.stack)
    }
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
