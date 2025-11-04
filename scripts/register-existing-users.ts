/**
 * Batch Register Existing Users
 * 
 * Registers all existing users in ERC-8004 + Agent0 who haven't been registered yet.
 * 
 * Usage: bun run scripts/register-existing-users.ts
 */

import { prisma } from '../src/lib/database-service'
import { Agent0Client } from '../src/agents/agent0/Agent0Client'
import { IPFSPublisher } from '../src/agents/agent0/IPFSPublisher'
import { logger } from '../src/lib/logger'
import type { AgentCapabilities } from '../src/a2a/types'

async function registerExistingUsers() {
  if (process.env.AGENT0_ENABLED !== 'true') {
    console.log('⚠️  Agent0 integration disabled. Set AGENT0_ENABLED=true to register users.')
    return
  }
  
  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL || process.env.BASE_RPC_URL
  const privateKey = process.env.BABYLON_GAME_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY
  
  if (!rpcUrl || !privateKey) {
    console.error('❌ Missing required environment variables:')
    console.error('   - BASE_SEPOLIA_RPC_URL or BASE_RPC_URL')
    console.error('   - BABYLON_GAME_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY')
    process.exit(1)
  }
  
  console.log('🔍 Finding users to register...\n')
  
  // Get all users not yet registered
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { onChainRegistered: false },
        { agent0MetadataCID: null }
      ],
      walletAddress: { not: null },
      isActor: false  // Don't register NPC actors
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      bio: true,
      walletAddress: true,
      onChainRegistered: true,
      nftTokenId: true,
      agent0MetadataCID: true
    }
  })
  
  console.log(`Found ${users.length} users to register\n`)
  
  if (users.length === 0) {
    console.log('✅ All users are already registered!')
    return
  }
  
  const agent0Client = new Agent0Client({
    network: (process.env.AGENT0_NETWORK as 'sepolia' | 'mainnet') || 'sepolia',
    rpcUrl,
    privateKey
  })
  
  const ipfsPublisher = new IPFSPublisher()
  
  let successCount = 0
  let errorCount = 0
  
  for (const user of users) {
    try {
      console.log(`Registering ${user.username || user.id}...`)
      
      // Skip if not on-chain registered (need ERC-8004 first)
      if (!user.onChainRegistered || !user.nftTokenId) {
        console.log(`  ⚠️  Skipping: User not registered in ERC-8004 yet`)
        errorCount++
        continue
      }
      
      // Create user metadata for IPFS
      const userMetadata = {
        name: user.displayName || user.username || `User-${user.id.slice(0, 8)}`,
        description: user.bio || 'Babylon player',
        version: '1.0.0',
        type: 'user',
        endpoints: {
          api: `https://babylon.game/api/users/${user.id}`,
        },
        capabilities: {
          strategies: [],
          markets: ['prediction', 'perpetuals'],
          actions: ['trade', 'post', 'chat'],
          version: '1.0.0'
        } as AgentCapabilities,
        babylon: {
          agentId: user.id,
          tokenId: user.nftTokenId,
          walletAddress: user.walletAddress!.toLowerCase()
        }
      }
      
      // Publish to IPFS
      const metadataCID = await ipfsPublisher.publishMetadata(userMetadata)
      console.log(`  📦 Published to IPFS: ${metadataCID}`)
      
      // Register with Agent0 SDK
      try {
        const result = await agent0Client.registerAgent({
          name: userMetadata.name,
          description: userMetadata.description,
          walletAddress: user.walletAddress!.toLowerCase(),
          capabilities: userMetadata.capabilities
        })
        
        console.log(`  ✅ Registered with Agent0 (token: ${result.tokenId})`)
        
        // Update database
        await prisma.user.update({
          where: { id: user.id },
          data: {
            agent0MetadataCID: metadataCID,
            agent0LastSync: new Date()
          }
        })
        
        successCount++
      } catch (agent0Error) {
        // Still store IPFS CID even if Agent0 registration fails
        await prisma.user.update({
          where: { id: user.id },
          data: {
            agent0MetadataCID: metadataCID
          }
        })
        
        console.log(`  ⚠️  Agent0 SDK registration failed (SDK may not be installed)`)
        console.log(`      Metadata published to IPFS: ${metadataCID}`)
        successCount++  // Count as success since IPFS worked
      }
      
      // Rate limiting - wait a bit between registrations
      await new Promise(resolve => setTimeout(resolve, 2000))
      
    } catch (error) {
      console.error(`  ❌ Failed to register ${user.username || user.id}:`, error)
      errorCount++
    }
    
    console.log('')  // Blank line between users
  }
  
  console.log('\n📊 Registration Summary:')
  console.log(`   ✅ Success: ${successCount}`)
  console.log(`   ❌ Errors: ${errorCount}`)
  console.log(`   📝 Total: ${users.length}`)
}

registerExistingUsers()
  .then(() => {
    console.log('\n✅ Batch registration complete!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Batch registration failed:', error)
    process.exit(1)
  })

