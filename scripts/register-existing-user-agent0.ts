/**
 * Register an existing user to Agent0
 * This is for users who were created before Agent0 integration
 */

import { prisma } from '../src/lib/database-service'
import { Agent0Client } from '../src/agents/agent0/Agent0Client'
import type { AgentCapabilities } from '../src/a2a/types'
import { logger } from '../src/lib/logger'

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`

async function registerExistingUser() {
  // Get the latest user who is not registered to Agent0
  const user = await prisma.user.findFirst({
    where: {
      onChainRegistered: false,
      walletAddress: { not: null }
    },
    orderBy: { createdAt: 'desc' }
  })

  if (!user) {
    console.log('❌ No unregistered users found')
    return
  }

  console.log(`\n🔍 Found unregistered user:`)
  console.log(`   ID: ${user.id}`)
  console.log(`   Username: ${user.username || 'N/A'}`)
  console.log(`   Wallet: ${user.walletAddress}`)
  console.log(`\n📝 Registering to Agent0...\n`)

  try {
    // Use Ethereum Sepolia RPC (where Agent0 contracts are deployed)
    const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com'

    // Configure IPFS - use Pinata if available
    const ipfsConfig = process.env.PINATA_JWT
      ? { ipfsProvider: 'pinata' as const, pinataJwt: process.env.PINATA_JWT }
      : { ipfsProvider: 'node' as const, ipfsNodeUrl: process.env.IPFS_NODE_URL || 'https://ipfs.io' }

    const agent0Client = new Agent0Client({
      network: (process.env.AGENT0_NETWORK as 'sepolia' | 'mainnet') || 'sepolia',
      rpcUrl,
      privateKey: DEPLOYER_PRIVATE_KEY,
      ...ipfsConfig
    })

    const agent0Result = await agent0Client.registerAgent({
      name: user.username || user.displayName || user.id,
      description: user.bio || 'Babylon player',
      walletAddress: user.walletAddress!.toLowerCase(),
      capabilities: {
        strategies: [],
        markets: ['prediction', 'perpetuals', 'pools'],
        actions: [
          'trade', 'buy_prediction', 'sell_prediction',
          'open_perp_position', 'close_perp_position',
          'get_positions', 'get_balance',
          'deposit_pool', 'withdraw_pool', 'get_pools',
          'post', 'reply', 'like', 'share', 'comment',
          'follow', 'unfollow', 'chat',
          'search_users', 'get_profile', 'query_feed',
          'get_referral_code', 'get_referrals'
        ],
        version: '1.0.0',
        platform: 'babylon',
        userType: 'player'
      } as AgentCapabilities
    })

    console.log(`✅ User registered with Agent0!`)
    console.log(`   Token ID: ${agent0Result.tokenId}`)
    console.log(`   Metadata CID: ${agent0Result.metadataCID}`)

    // Update database
    await prisma.user.update({
      where: { id: user.id },
      data: {
        onChainRegistered: true,
        nftTokenId: agent0Result.tokenId
      }
    })

    console.log(`\n✅ Database updated!`)
    console.log(`\n🔍 Query Agent0 to verify: bun run agent0:query`)

  } catch (error) {
    console.error('❌ Error registering user:', error)
    throw error
  }
}

registerExistingUser()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
