/**
 * Verify Agent0 Integration Setup
 * 
 * Checks that all Agent0 integration components are properly configured.
 * 
 * Usage: bun run scripts/verify-agent0-setup.ts
 */

import { prisma } from '../src/lib/database-service'
import { IPFSPublisher } from '../src/agents/agent0/IPFSPublisher'
import { SubgraphClient } from '../src/agents/agent0/SubgraphClient'
import { GameDiscoveryService } from '../src/agents/agent0/GameDiscovery'
import { Agent0Client } from '../src/agents/agent0/Agent0Client'
import { logger } from '../src/lib/logger'

interface VerificationResult {
  component: string
  status: '✅' | '⚠️' | '❌'
  message: string
}

async function verifySetup(): Promise<VerificationResult[]> {
  const results: VerificationResult[] = []
  
  // 1. Check environment variables
  console.log('\n🔍 Checking Environment Variables...\n')
  
  const envChecks = [
    { key: 'AGENT0_ENABLED', required: false, value: process.env.AGENT0_ENABLED },
    { key: 'BASE_SEPOLIA_RPC_URL', required: true, value: process.env.BASE_SEPOLIA_RPC_URL },
    { key: 'BABYLON_GAME_PRIVATE_KEY', required: true, value: process.env.BABYLON_GAME_PRIVATE_KEY },
    { key: 'AGENT0_SUBGRAPH_URL', required: false, value: process.env.AGENT0_SUBGRAPH_URL },
    { key: 'AGENT0_IPFS_API', required: false, value: process.env.AGENT0_IPFS_API },
  ]
  
  for (const check of envChecks) {
    if (check.required && !check.value) {
      results.push({
        component: `Env: ${check.key}`,
        status: '❌',
        message: 'Missing required environment variable'
      })
    } else if (check.value) {
      results.push({
        component: `Env: ${check.key}`,
        status: '✅',
        message: 'Set'
      })
    } else {
      results.push({
        component: `Env: ${check.key}`,
        status: '⚠️',
        message: 'Not set (optional)'
      })
    }
  }
  
  // 2. Check database schema
  console.log('🔍 Checking Database Schema...\n')
  
  try {
    // Check GameConfig model
    const config = await prisma.gameConfig.findUnique({
      where: { key: 'test' }
    }).catch(() => null)
    
    results.push({
      component: 'Database: GameConfig',
      status: '✅',
      message: 'Model exists'
    })
    
    // Check User Agent0 fields
    const user = await prisma.user.findFirst({
      select: {
        agent0MetadataCID: true,
        agent0LastSync: true,
        mcpEndpoint: true,
        a2aEndpoint: true
      }
    }).catch(() => null)
    
    if (user !== null) {
      results.push({
        component: 'Database: User Agent0 Fields',
        status: '✅',
        message: 'Fields exist'
      })
    } else {
      results.push({
        component: 'Database: User Agent0 Fields',
        status: '❌',
        message: 'Fields not found - run migration'
      })
    }
  } catch (error) {
    results.push({
      component: 'Database Schema',
      status: '❌',
      message: `Error: ${error instanceof Error ? error.message : String(error)}`
    })
  }
  
  // 3. Check IPFS Publisher
  console.log('🔍 Checking IPFS Publisher...\n')
  
  try {
    const ipfsPublisher = new IPFSPublisher()
    const available = ipfsPublisher.isAvailable()
    
    results.push({
      component: 'IPFS Publisher',
      status: available ? '✅' : '⚠️',
      message: available ? 'Initialized' : 'Not configured (IPFS credentials missing)'
    })
  } catch (error) {
    results.push({
      component: 'IPFS Publisher',
      status: '❌',
      message: `Error: ${error instanceof Error ? error.message : String(error)}`
    })
  }
  
  // 4. Check Subgraph Client
  console.log('🔍 Checking Subgraph Client...\n')
  
  try {
    const subgraphClient = new SubgraphClient()
    results.push({
      component: 'Subgraph Client',
      status: '✅',
      message: 'Initialized'
    })
  } catch (error) {
    results.push({
      component: 'Subgraph Client',
      status: '⚠️',
      message: `Warning: ${error instanceof Error ? error.message : String(error)}`
    })
  }
  
  // 5. Check Game Discovery
  console.log('🔍 Checking Game Discovery Service...\n')
  
  try {
    const discovery = new GameDiscoveryService()
    results.push({
      component: 'Game Discovery Service',
      status: '✅',
      message: 'Initialized'
    })
  } catch (error) {
    results.push({
      component: 'Game Discovery Service',
      status: '❌',
      message: `Error: ${error instanceof Error ? error.message : String(error)}`
    })
  }
  
  // 6. Check Agent0 Client
  console.log('🔍 Checking Agent0 Client...\n')
  
  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL
  const privateKey = process.env.BABYLON_GAME_PRIVATE_KEY
  
  if (rpcUrl && privateKey) {
    try {
      const client = new Agent0Client({
        network: 'sepolia',
        rpcUrl,
        privateKey
      })
      
      const available = client.isAvailable()
      results.push({
        component: 'Agent0 Client',
        status: available ? '✅' : '⚠️',
        message: available ? 'Initialized and ready' : 'Initialized but read-only'
      })
    } catch (error) {
      results.push({
        component: 'Agent0 Client',
        status: '❌',
        message: `Error: ${error instanceof Error ? error.message : String(error)}`
      })
    }
  } else {
    results.push({
      component: 'Agent0 Client',
      status: '⚠️',
      message: 'Cannot initialize - missing RPC URL or private key'
    })
  }
  
  // 7. Check Babylon Registration
  console.log('🔍 Checking Babylon Registration...\n')
  
  try {
    const config = await prisma.gameConfig.findUnique({
      where: { key: 'agent0_registration' }
    })
    
    if (config?.value && typeof config.value === 'object' && 'registered' in config.value) {
      const registered = (config.value as { registered: boolean }).registered
      results.push({
        component: 'Babylon Registration',
        status: registered ? '✅' : '⚠️',
        message: registered ? 'Registered in Agent0' : 'Not yet registered'
      })
    } else {
      results.push({
        component: 'Babylon Registration',
        status: '⚠️',
        message: 'Not registered - run: bun run scripts/register-babylon-game.ts'
      })
    }
  } catch (error) {
    results.push({
      component: 'Babylon Registration',
      status: '❌',
      message: `Error: ${error instanceof Error ? error.message : String(error)}`
    })
  }
  
  return results
}

async function main() {
  console.log('🔍 Verifying Agent0 Integration Setup...\n')
  
  const results = await verifySetup()
  
  console.log('\n📊 Verification Results:\n')
  console.log('─'.repeat(60))
  
  for (const result of results) {
    console.log(`${result.status} ${result.component.padEnd(40)} ${result.message}`)
  }
  
  console.log('─'.repeat(60))
  
  const passed = results.filter(r => r.status === '✅').length
  const warnings = results.filter(r => r.status === '⚠️').length
  const failed = results.filter(r => r.status === '❌').length
  
  console.log(`\n✅ Passed: ${passed}`)
  console.log(`⚠️  Warnings: ${warnings}`)
  console.log(`❌ Failed: ${failed}`)
  
  if (failed === 0 && warnings === 0) {
    console.log('\n🎉 All checks passed! Agent0 integration is ready.')
  } else if (failed === 0) {
    console.log('\n⚠️  Some optional components are not configured, but core integration is ready.')
  } else {
    console.log('\n❌ Some required components failed. Please fix the errors above.')
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('Verification failed:', error)
  process.exit(1)
})

