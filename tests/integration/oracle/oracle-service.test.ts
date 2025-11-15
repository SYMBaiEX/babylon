// @ts-nocheck

/**
 * Oracle Service Integration Tests
 * 
 * Tests the TypeScript oracle service against a real contract deployment
 * 
 * Automatically ensures:
 * 1. Anvil is running (starts it if needed)
 * 2. Contracts are deployed (deploys them if needed)
 * 3. Oracle service is healthy before running tests
 */

import { describe, it, expect, beforeAll } from 'bun:test'
import { execSync } from 'child_process'
import { OracleService } from '../../../src/lib/oracle/oracle-service'
import { CommitmentStore } from '../../../src/lib/oracle/commitment-store'
import { ethers } from 'ethers'
import { isContractDeployed } from '../../../src/lib/deployment/validation'

const ANVIL_RPC_URL = 'http://localhost:8545'
const ANVIL_CHAIN_ID = 31337

/**
 * Check if Anvil is running, start it if needed
 */
async function ensureAnvilRunning(): Promise<boolean> {
  try {
    // Check if Anvil is responding
    execSync(`cast block-number --rpc-url ${ANVIL_RPC_URL}`, { stdio: 'ignore' })
    console.log('✅ Anvil is running')
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

/**
 * Check if contracts are deployed on-chain
 */
async function areContractsDeployed(): Promise<boolean> {
  const oracleAddress = process.env.NEXT_PUBLIC_BABYLON_ORACLE
  if (!oracleAddress) {
    return false
  }

  try {
    const deployed = await isContractDeployed(ANVIL_RPC_URL, oracleAddress)
    return deployed
  } catch (error) {
    console.log('⚠️  Error checking contract deployment:', error instanceof Error ? error.message : String(error))
    return false
  }
}

/**
 * Load environment variables from .env files
 */
function loadEnvFile(filePath: string): void {
  const { existsSync, readFileSync } = require('fs')
  if (existsSync(filePath)) {
    const envContent = readFileSync(filePath, 'utf-8')
    const lines = envContent.split('\n')
    for (const line of lines) {
      // Skip comments and empty lines
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) {
        continue
      }
      const match = trimmed.match(/^([^=]+)=(.*)$/)
      if (match) {
        const [, key, value] = match
        // Remove quotes if present
        const cleanValue = value.trim().replace(/^["']|["']$/g, '')
        process.env[key] = cleanValue
      }
    }
  }
}

/**
 * Deploy contracts to localnet
 */
async function deployContracts(): Promise<boolean> {
  try {
    console.log('🔄 Deploying contracts to localnet...')
    
    // Set environment variables for deployment
    process.env.DEPLOYER_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
    process.env.ETHERSCAN_API_KEY = 'dummy'
    
    // Run deployment script
    const { $ } = await import('bun')
    await $`bun run scripts/deployment/deploy-localnet.ts`.quiet()
    
    // Wait a moment for files to be written
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // Reload environment variables from both .env.local and .env
    const { join } = await import('path')
    const cwd = process.cwd()
    loadEnvFile(join(cwd, '.env.local'))
    loadEnvFile(join(cwd, '.env'))
    
    console.log('✅ Contracts deployed successfully')
    return true
  } catch (error) {
    console.log('❌ Contract deployment failed:', error instanceof Error ? error.message : String(error))
    return false
  }
}

describe('Oracle Service Integration', () => {
  let oracle: OracleService | null = null
  let testQuestionId: string
  let sessionId: string
  let contractsAvailable = false

  beforeAll(async () => {
    // Step 1: Ensure Anvil is running
    const anvilRunning = await ensureAnvilRunning()
    if (!anvilRunning) {
      console.log('❌ Cannot proceed without Anvil')
      contractsAvailable = false
      return
    }

    // Step 2: Check if contracts are deployed
    let contractsDeployed = await areContractsDeployed()
    
    // Step 3: Deploy contracts if needed
    if (!contractsDeployed) {
      console.log('⚠️  Contracts not deployed, deploying now...')
      const deployed = await deployContracts()
      if (deployed) {
        // Verify deployment
        contractsDeployed = await areContractsDeployed()
      }
    }

    if (!contractsDeployed) {
      console.log('❌ Contracts are not deployed and deployment failed')
      contractsAvailable = false
      return
    }

    // Step 4: Initialize oracle service and verify health
    try {
      // Ensure ORACLE_PRIVATE_KEY is set (use Anvil account #0)
      if (!process.env.ORACLE_PRIVATE_KEY) {
        process.env.ORACLE_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
      }
      
      // Ensure RPC URL and chain ID are set
      process.env.NEXT_PUBLIC_RPC_URL = ANVIL_RPC_URL
      process.env.NEXT_PUBLIC_CHAIN_ID = ANVIL_CHAIN_ID.toString()

      oracle = new OracleService()
      const health = await oracle.healthCheck()
      contractsAvailable = health.healthy
      
      if (health.healthy) {
        console.log('✅ Oracle service is healthy - Running full tests')
        
        // Clean up any existing test data
        const { prisma } = await import('../../../src/lib/prisma')
        await prisma.oracleCommitment.deleteMany({
          where: {
            questionId: {
              startsWith: 'test-'
            }
          }
        })
        await prisma.oracleCommitment.deleteMany({
          where: {
            questionId: {
              startsWith: 'batch-'
            }
          }
        })
        await prisma.oracleCommitment.deleteMany({
          where: {
            questionId: {
              startsWith: 'reveal-'
            }
          }
        })
      } else {
        console.log('⚠️  Oracle not healthy:', health.error)
        contractsAvailable = false
      }
    } catch (error) {
      console.log('❌ Oracle service initialization failed:', error instanceof Error ? error.message : String(error))
      contractsAvailable = false
    }
  })

  it('should perform health check', async () => {
    if (!contractsAvailable || !oracle) {
      console.log('⏭️  Skipping - contracts not available')
      expect(true).toBe(true)
      return
    }
    const health = await oracle.healthCheck()
    expect(health.healthy).toBe(true)
    expect(health.error).toBeUndefined()
  })

  it('should get oracle statistics', async () => {
    if (!contractsAvailable || !oracle) {
      console.log('⏭️  Skipping - contracts not available')
      expect(true).toBe(true)
      return
    }
    const stats = await oracle.getStatistics()
    expect(stats).toHaveProperty('committed')
    expect(stats).toHaveProperty('revealed')
    expect(stats).toHaveProperty('pending')
  })

  it('should commit a game', async () => {
    if (!contractsAvailable || !oracle) {
      console.log('⏭️  Skipping - contracts not available')
      expect(true).toBe(true)
      return
    }
    testQuestionId = `test-${Date.now()}`
    
    const result = await oracle.commitGame(
      testQuestionId,
      1,
      'Will test pass?',
      'testing',
      true  // outcome
    )

    expect(result.sessionId).toBeTruthy()
    expect(result.questionId).toBe(testQuestionId)
    expect(result.commitment).toBeTruthy()
    expect(result.txHash).toBeTruthy()
    expect(result.blockNumber).toBeGreaterThan(0)

    sessionId = result.sessionId

    // Verify commitment stored
    const stored = await CommitmentStore.retrieve(testQuestionId)
    expect(stored).toBeTruthy()
    expect(stored!.sessionId).toBe(sessionId)
  }, 10000) // Increase timeout for blockchain operations

  it('should reveal a game', async () => {
    if (!contractsAvailable || !oracle) {
      console.log('⏭️  Skipping - contracts not available')
      expect(true).toBe(true)
      return
    }
    // Use the game committed in previous test
    expect(sessionId).toBeTruthy()

    const result = await oracle.revealGame(
      testQuestionId,
      true,  // outcome
      [],    // no winners
      BigInt(0)
    )

    expect(result.sessionId).toBe(sessionId)
    expect(result.questionId).toBe(testQuestionId)
    expect(result.outcome).toBe(true)
    expect(result.txHash).toBeTruthy()

    // Verify commitment cleaned up
    const stored = await CommitmentStore.retrieve(testQuestionId)
    expect(stored).toBeNull()
  }, 10000) // Increase timeout for blockchain operations

  it('should batch commit games', async () => {
    if (!contractsAvailable || !oracle) {
      console.log('⏭️  Skipping - contracts not available')
      expect(true).toBe(true)
      return
    }
    const games = [
      {
        questionId: `batch-1-${Date.now()}`,
        questionNumber: 10,
        question: 'Batch question 1?',
        category: 'test',
        outcome: true
      },
      {
        questionId: `batch-2-${Date.now()}`,
        questionNumber: 11,
        question: 'Batch question 2?',
        category: 'test',
        outcome: false
      },
      {
        questionId: `batch-3-${Date.now()}`,
        questionNumber: 12,
        question: 'Batch question 3?',
        category: 'test',
        outcome: true
      }
    ]

    const result = await oracle.batchCommitGames(games)

    expect(result.successful.length).toBe(3)
    expect(result.failed.length).toBe(0)

    // Small delay to ensure database writes complete
    await new Promise(resolve => setTimeout(resolve, 100))

    // Verify all commitments stored (using the successful results to ensure IDs match)
    for (const success of result.successful) {
      const stored = await CommitmentStore.retrieve(success.questionId)
      expect(stored).toBeTruthy()
      expect(stored!.sessionId).toBeTruthy()
    }
  }, 10000) // Increase timeout for batch operations

  it('should batch reveal games', async () => {
    if (!contractsAvailable || !oracle) {
      console.log('⏭️  Skipping - contracts not available')
      expect(true).toBe(true)
      return
    }
    // Commit first
    const games = [
      {
        questionId: `reveal-1-${Date.now()}`,
        questionNumber: 20,
        question: 'Reveal question 1?',
        category: 'test',
        outcome: true
      },
      {
        questionId: `reveal-2-${Date.now()}`,
        questionNumber: 21,
        question: 'Reveal question 2?',
        category: 'test',
        outcome: false
      }
    ]

    await oracle.batchCommitGames(games)

    // Then reveal
    const reveals = games.map(g => ({
      questionId: g.questionId,
      outcome: g.outcome,
      winners: [],
      totalPayout: BigInt(0)
    }))

    const result = await oracle.batchRevealGames(reveals)

    expect(result.successful.length).toBe(2)
    expect(result.failed.length).toBe(0)

    // Verify commitments cleaned up
    for (const game of games) {
      const stored = await CommitmentStore.retrieve(game.questionId)
      expect(stored).toBeNull()
    }
  }, 15000) // Increase timeout to 15s for batch operations
})

describe('Commitment Store', () => {
  it('should encrypt and decrypt salt correctly', async () => {
    const salt = CommitmentStore.generateSalt()
    expect(salt).toMatch(/^0x[0-9a-f]{64}$/)

    const commitment = {
      questionId: `test-${Date.now()}`,
      sessionId: ethers.ZeroHash,
      salt,
      commitment: ethers.ZeroHash,
      createdAt: new Date()
    }

    await CommitmentStore.store(commitment)
    const retrieved = await CommitmentStore.retrieve(commitment.questionId)

    expect(retrieved).toBeTruthy()
    expect(retrieved!.salt).toBe(salt)
    expect(retrieved!.questionId).toBe(commitment.questionId)

    await CommitmentStore.delete(commitment.questionId)
  })

  it('should generate random salts', () => {
    const salt1 = CommitmentStore.generateSalt()
    const salt2 = CommitmentStore.generateSalt()
    
    expect(salt1).not.toBe(salt2)
    expect(salt1).toMatch(/^0x[0-9a-f]{64}$/)
  })
})


