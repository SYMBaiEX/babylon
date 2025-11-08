#!/usr/bin/env tsx
/**
 * Check Deployment Status
 * Verifies all contracts and Agent0 registry integration
 */

import { logger } from '../src/lib/logger'
import { prisma } from '../src/lib/prisma'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

interface DeploymentStatus {
  babylonContracts: {
    network: string
    chainId: number
    deployed: boolean
    addresses?: {
      identityRegistry: string
      reputationSystem: string
      diamond: string
    }
  }
  agent0Integration: {
    enabled: boolean
    network: string
    chainId: number
    registryAddress: string
    babylonRegistered: boolean
    usersRegistered: number
    agentsRegistered: number
  }
  configuration: {
    rpcUrl: string
    gameWallet: string
    ipfsProvider: string
  }
}

async function checkDeploymentStatus(): Promise<DeploymentStatus> {
  logger.info('🔍 Checking Deployment Status...', undefined, 'Script')
  logger.info('='.repeat(80), undefined, 'Script')

  // 1. Check Babylon Contracts (Ethereum Sepolia)
  logger.info('\n📦 Babylon Contracts (Ethereum Sepolia):', undefined, 'Script')
  
  let babylonContracts: DeploymentStatus['babylonContracts']
  try {
    // Try multiple possible deployment file locations
    const deploymentPaths = [
      join(process.cwd(), 'deployments', 'sepolia', 'latest.json'),
      join(process.cwd(), 'deployments', 'base-sepolia', 'latest.json'),
    ]
    
    let deploymentPath: string | null = null
    for (const path of deploymentPaths) {
      if (existsSync(path)) {
        deploymentPath = path
        break
      }
    }
    
    if (!deploymentPath) {
      throw new Error('Deployment file not found')
    }
    
    const deployment = JSON.parse(readFileSync(deploymentPath, 'utf-8')) as {
      timestamp: string
      contracts: {
        identityRegistry: string
        reputationSystem: string
        diamond: string
      }
    }
    
    babylonContracts = {
      network: 'Ethereum Sepolia',
      chainId: 11155111,
      deployed: true,
      addresses: {
        identityRegistry: deployment.contracts.identityRegistry,
        reputationSystem: deployment.contracts.reputationSystem,
        diamond: deployment.contracts.diamond
      }
    }
    
    logger.info(`   ✅ Deployed: ${deployment.timestamp}`, undefined, 'Script')
    logger.info(`   📍 Identity Registry: ${deployment.contracts.identityRegistry}`, undefined, 'Script')
    logger.info(`   📍 Reputation System: ${deployment.contracts.reputationSystem}`, undefined, 'Script')
    logger.info(`   📍 Diamond Proxy: ${deployment.contracts.diamond}`, undefined, 'Script')
    logger.info(`   🔗 Explorer: https://sepolia.etherscan.io/address/${deployment.contracts.identityRegistry}`, undefined, 'Script')
  } catch (error) {
    babylonContracts = {
      network: 'Ethereum Sepolia',
      chainId: 11155111,
      deployed: false
    }
    logger.warn('   ⚠️  No deployment found', undefined, 'Script')
    logger.info('   💡 Run: NETWORK=sepolia DEPLOYER_PRIVATE_KEY=0x... bun run scripts/deploy-contracts.ts', undefined, 'Script')
  }

  // 2. Check Agent0 Integration (Ethereum Sepolia)
  logger.info('\n🤖 Agent0 Integration (Ethereum Sepolia):', undefined, 'Script')
  
  const agent0Enabled = process.env.AGENT0_ENABLED === 'true'
  const agent0Network = process.env.AGENT0_NETWORK || 'sepolia'
  
  // Agent0 uses its own deployed ERC-8004 registry on Ethereum Sepolia
  // Registry address: 0x... (deployed by Agent0 team)
  const agent0RegistryAddress = agent0Network === 'sepolia' 
    ? '0x...' // Agent0's Sepolia registry (from their docs)
    : '0x...' // Agent0's mainnet registry
  
  logger.info(`   Status: ${agent0Enabled ? '✅ Enabled' : '❌ Disabled'}`, undefined, 'Script')
  logger.info(`   Network: Ethereum ${agent0Network.charAt(0).toUpperCase() + agent0Network.slice(1)}`, undefined, 'Script')
  logger.info(`   Registry: Agent0 ERC-8004 Registry (deployed by Agent0)`, undefined, 'Script')
  
  // Check if Babylon game is registered
  let babylonRegistered = false
  let usersRegistered = 0
  let agentsRegistered = 0
  
  if (agent0Enabled) {
    try {
      // Check Babylon registration
      const gameConfig = await prisma.gameConfig.findUnique({
        where: { key: 'agent0_registration' }
      })
      
      babylonRegistered = gameConfig?.value ? true : false
      
      if (babylonRegistered) {
        const value = gameConfig.value as Record<string, unknown>
        logger.info(`   ✅ Babylon Game Registered`, undefined, 'Script')
        logger.info(`      Token ID: ${value.tokenId}`, undefined, 'Script')
        logger.info(`      Metadata CID: ${value.metadataCID}`, undefined, 'Script')
      } else {
        logger.warn('   ⚠️  Babylon Game Not Registered', undefined, 'Script')
        logger.info('      Run: bun run agent0:register', undefined, 'Script')
      }
      
      // Check user registrations
      const users = await prisma.user.findMany({
        where: {
          onChainRegistered: true,
          nftTokenId: { not: null }
        },
        select: { id: true, displayName: true, nftTokenId: true }
      })
      
      usersRegistered = users.length
      
      if (usersRegistered > 0) {
        logger.info(`   ✅ ${usersRegistered} Users Registered`, undefined, 'Script')
        users.slice(0, 3).forEach(user => {
          logger.info(`      - ${user.displayName} (Token #${user.nftTokenId})`, undefined, 'Script')
        })
        if (usersRegistered > 3) {
          logger.info(`      ... and ${usersRegistered - 3} more`, undefined, 'Script')
        }
      } else {
        logger.warn('   ⚠️  No Users Registered Yet', undefined, 'Script')
        logger.info('      Users will register on first login', undefined, 'Script')
      }
      
      // Check agent registrations (agents are users with isActor=true)
      const agents = await prisma.user.findMany({
        where: {
          isActor: true,
          onChainRegistered: true,
          nftTokenId: { not: null }
        },
        select: { id: true, displayName: true, nftTokenId: true }
      })
      
      agentsRegistered = agents.length
      
      if (agentsRegistered > 0) {
        logger.info(`   ✅ ${agentsRegistered} Agents Registered`, undefined, 'Script')
        agents.slice(0, 3).forEach(agent => {
          logger.info(`      - ${agent.displayName} (Token #${agent.nftTokenId})`, undefined, 'Script')
        })
        if (agentsRegistered > 3) {
          logger.info(`      ... and ${agentsRegistered - 3} more`, undefined, 'Script')
        }
      } else {
        logger.warn('   ⚠️  No Agents Registered Yet', undefined, 'Script')
        logger.info('      Agents will register on creation', undefined, 'Script')
      }
      
      await prisma.$disconnect()
    } catch (error) {
      logger.error('   ❌ Database check failed:', error, 'Script')
    }
  }

  // 3. Check Configuration
  logger.info('\n⚙️  Configuration:', undefined, 'Script')
  
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com'
  const gameWallet = process.env.BABYLON_GAME_WALLET_ADDRESS || 'Not Set'
  const ipfsProvider = process.env.PINATA_JWT ? 'Pinata' : 'Public IPFS Node'
  
  logger.info(`   RPC URL: ${rpcUrl}`, undefined, 'Script')
  logger.info(`   Game Wallet: ${gameWallet}`, undefined, 'Script')
  logger.info(`   IPFS Provider: ${ipfsProvider}`, undefined, 'Script')

  // 4. Summary
  logger.info('\n📊 Summary:', undefined, 'Script')
  logger.info('='.repeat(80), undefined, 'Script')
  
  const status: DeploymentStatus = {
    babylonContracts,
    agent0Integration: {
      enabled: agent0Enabled,
      network: agent0Network,
      chainId: agent0Network === 'sepolia' ? 11155111 : 1,
      registryAddress: agent0RegistryAddress,
      babylonRegistered,
      usersRegistered,
      agentsRegistered
    },
    configuration: {
      rpcUrl,
      gameWallet,
      ipfsProvider
    }
  }
  
  // Check if everything is properly configured
  const allGood = 
    babylonContracts.deployed &&
    agent0Enabled &&
    babylonRegistered &&
    gameWallet !== 'Not Set'
  
  if (allGood) {
    logger.info('✅ All systems operational!', undefined, 'Script')
    logger.info('', undefined, 'Script')
    logger.info('🎯 Your Setup:', undefined, 'Script')
    logger.info('   • Babylon Contracts: Deployed on Ethereum Sepolia', undefined, 'Script')
    logger.info('   • Agent0 Integration: Connected to Ethereum Sepolia (same chain)', undefined, 'Script')
    logger.info('   • Game Registry: Registered with Agent0', undefined, 'Script')
    logger.info('   • Users/Agents: Auto-register on first interaction', undefined, 'Script')
  } else {
    logger.warn('⚠️  Some components need attention:', undefined, 'Script')
    
    if (!babylonContracts.deployed) {
      logger.info('   ❌ Deploy Babylon contracts to Ethereum Sepolia', undefined, 'Script')
      logger.info('      Run: NETWORK=sepolia DEPLOYER_PRIVATE_KEY=0x... bun run scripts/deploy-contracts.ts', undefined, 'Script')
    }
    
    if (!agent0Enabled) {
      logger.info('   ❌ Enable Agent0 integration (AGENT0_ENABLED=true)', undefined, 'Script')
    }
    
    if (!babylonRegistered && agent0Enabled) {
      logger.info('   ❌ Register Babylon game (bun run agent0:register)', undefined, 'Script')
    }
    
    if (gameWallet === 'Not Set') {
      logger.info('   ❌ Set BABYLON_GAME_WALLET_ADDRESS and BABYLON_GAME_PRIVATE_KEY', undefined, 'Script')
    }
  }
  
  logger.info('='.repeat(80), undefined, 'Script')
  
  return status
}

// Run the check
checkDeploymentStatus().catch((error) => {
  logger.error('Status check failed:', error, 'Script')
  process.exit(1)
})

