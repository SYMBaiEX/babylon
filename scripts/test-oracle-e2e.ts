#!/usr/bin/env bun
/**
 * Oracle E2E Test Script
 * 
 * Tests complete oracle integration:
 * 1. Deploys contracts to Anvil
 * 2. Creates test question
 * 3. Commits to oracle
 * 4. Resolves and reveals
 * 5. Verifies external contracts can read outcome
 */

import { $ } from 'bun'
import { ethers } from 'ethers'
import { logger } from '../src/lib/logger'
import { getOracleService } from '../src/lib/oracle'
import { prisma } from '../src/lib/prisma'
import { generateSnowflakeId } from '../src/lib/snowflake'

async function main() {
  logger.info('🧪 Starting Oracle E2E Test', undefined, 'Test')
  logger.info('='.repeat(60), undefined, 'Test')

  // Step 1: Check Anvil
  logger.info('\n📍 Step 1: Checking Anvil...', undefined, 'Test')
  try {
    await $`cast block-number --rpc-url http://localhost:8545`.quiet()
    logger.info('✅ Anvil is running', undefined, 'Test')
  } catch {
    logger.error('❌ Anvil not running', undefined, 'Test')
    logger.info('Start with: docker-compose up -d anvil', undefined, 'Test')
    process.exit(1)
  }

  // Step 2: Check contracts deployed
  logger.info('\n📍 Step 2: Checking contracts...', undefined, 'Test')
  if (!process.env.NEXT_PUBLIC_BABYLON_ORACLE) {
    logger.error('❌ Oracle not deployed', undefined, 'Test')
    logger.info('Deploy with: bun run contracts:deploy:local', undefined, 'Test')
    process.exit(1)
  }
  logger.info(`✅ Oracle: ${process.env.NEXT_PUBLIC_BABYLON_ORACLE}`, undefined, 'Test')

  // Step 3: Initialize oracle service
  logger.info('\n📍 Step 3: Initializing oracle service...', undefined, 'Test')
  const oracle = getOracleService()
  const health = await oracle.healthCheck()
  
  if (!health.healthy) {
    logger.error(`❌ Oracle unhealthy: ${health.error}`, undefined, 'Test')
    process.exit(1)
  }
  logger.info('✅ Oracle healthy', undefined, 'Test')

  // Step 4: Create test question
  logger.info('\n📍 Step 4: Creating test question...', undefined, 'Test')
  const questionId = generateSnowflakeId()
  const resolutionDate = new Date()
  resolutionDate.setDate(resolutionDate.getDate() + 3)

  const question = await prisma.question.create({
    data: {
      id: questionId,
      questionNumber: 99999,
      text: 'Will Babylon oracle integration be successful?',
      scenarioId: 1,
      outcome: true,  // Predetermined: YES
      rank: 1,
      createdDate: new Date(),
      resolutionDate,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  })

  logger.info(`✅ Question created: ${question.text}`, undefined, 'Test')
  logger.info(`   ID: ${questionId}`, undefined, 'Test')

  // Step 5: Commit to oracle
  logger.info('\n📍 Step 5: Committing to oracle...', undefined, 'Test')
  const commitResult = await oracle.commitGame(
    question.id,
    question.questionNumber,
    question.text,
    'e2e-test',
    question.outcome
  )

  logger.info('✅ Committed to oracle', undefined, 'Test')
  logger.info(`   Session ID: ${commitResult.sessionId}`, undefined, 'Test')
  logger.info(`   TX Hash: ${commitResult.txHash}`, undefined, 'Test')
  logger.info(`   Block: ${commitResult.blockNumber}`, undefined, 'Test')

  const sessionId = commitResult.sessionId

  // Update question
  await prisma.question.update({
    where: { id: questionId },
    data: {
      oracleSessionId: sessionId,
      oracleCommitment: commitResult.commitment,
      oracleCommitTxHash: commitResult.txHash,
      oracleCommitBlock: commitResult.blockNumber || null,
    }
  })

  // Step 6: Verify commitment on-chain
  logger.info('\n📍 Step 6: Verifying commitment on-chain...', undefined, 'Test')
  const gameInfo = await oracle.getGameInfo(sessionId)
  
  if (!gameInfo.game.commitment) {
    logger.error('❌ Commitment not found on-chain', undefined, 'Test')
    process.exit(1)
  }
  
  logger.info('✅ Commitment verified on-chain', undefined, 'Test')
  logger.info(`   Commitment: ${gameInfo.game.commitment}`, undefined, 'Test')

  // Step 7: Simulate resolution (after some time)
  logger.info('\n📍 Step 7: Waiting 2 seconds (simulate time passing)...', undefined, 'Test')
  await new Promise(resolve => setTimeout(resolve, 2000))
  logger.info('✅ Time passed', undefined, 'Test')

  // Step 8: Reveal outcome
  logger.info('\n📍 Step 8: Revealing outcome...', undefined, 'Test')
  const revealResult = await oracle.revealGame(
    questionId,
    question.outcome,
    [],
    BigInt(0)
  )

  logger.info('✅ Outcome revealed', undefined, 'Test')
  logger.info(`   TX Hash: ${revealResult.txHash}`, undefined, 'Test')
  logger.info(`   Outcome: ${revealResult.outcome ? 'YES' : 'NO'}`, undefined, 'Test')

  // Update question
  await prisma.question.update({
    where: { id: questionId },
    data: {
      oracleRevealTxHash: revealResult.txHash,
      oracleRevealBlock: revealResult.blockNumber || null,
      oraclePublishedAt: new Date(),
    }
  })

  // Step 9: Verify outcome readable
  logger.info('\n📍 Step 9: Verifying outcome readable...', undefined, 'Test')
  const finalGameInfo = await oracle.getGameInfo(sessionId)

  if (!finalGameInfo.game.finalized) {
    logger.error('❌ Game not finalized', undefined, 'Test')
    process.exit(1)
  }

  if (finalGameInfo.game.outcome !== true) {
    logger.error('❌ Outcome mismatch', undefined, 'Test')
    process.exit(1)
  }

  logger.info('✅ Outcome verified', undefined, 'Test')
  logger.info(`   Finalized: ${finalGameInfo.game.finalized}`, undefined, 'Test')
  logger.info(`   Outcome: ${finalGameInfo.game.outcome}`, undefined, 'Test')

  // Step 10: Check statistics
  logger.info('\n📍 Step 10: Checking oracle statistics...', undefined, 'Test')
  const stats = await oracle.getStatistics()
  
  logger.info('✅ Statistics:', undefined, 'Test')
  logger.info(`   Total Committed: ${stats.committed}`, undefined, 'Test')
  logger.info(`   Total Revealed: ${stats.revealed}`, undefined, 'Test')
  logger.info(`   Pending: ${stats.pending}`, undefined, 'Test')

  // Step 11: Test direct contract call (like external betting contract would)
  logger.info('\n📍 Step 11: Testing external contract integration...', undefined, 'Test')
  
  const provider = new ethers.JsonRpcProvider('http://localhost:8545')
  const oracleContract = new ethers.Contract(
    process.env.NEXT_PUBLIC_BABYLON_ORACLE!,
    ['function getOutcome(bytes32) external view returns (bool outcome, bool finalized)'],
    provider
  )

  const [outcome, finalized] = await oracleContract.getOutcome(sessionId)
  
  if (!finalized || outcome !== true) {
    logger.error('❌ External contract cannot read outcome correctly', undefined, 'Test')
    process.exit(1)
  }

  logger.info('✅ External contracts can read outcome', undefined, 'Test')
  logger.info(`   Outcome: ${outcome}`, undefined, 'Test')
  logger.info(`   Finalized: ${finalized}`, undefined, 'Test')

  // Step 12: Cleanup
  logger.info('\n📍 Step 12: Cleaning up...', undefined, 'Test')
  await prisma.question.delete({
    where: { id: questionId }
  }).catch(() => {})
  logger.info('✅ Cleanup complete', undefined, 'Test')

  // Success!
  logger.info('\n' + '='.repeat(60), undefined, 'Test')
  logger.info('🎉 All tests passed!', undefined, 'Test')
  logger.info('='.repeat(60), undefined, 'Test')
  
  logger.info('\n✨ Oracle integration is fully functional!', undefined, 'Test')
  logger.info('\nNext steps:', undefined, 'Test')
  logger.info('  1. Start dev server: bun run dev', undefined, 'Test')
  logger.info('  2. Visit betting page: http://localhost:3000/betting', undefined, 'Test')
  logger.info('  3. Trigger game tick to create real questions', undefined, 'Test')
  logger.info('  4. Watch as questions appear as tradeable markets!', undefined, 'Test')
}

main().catch((error) => {
  logger.error('❌ E2E test failed:', error, 'Test')
  process.exit(1)
})

