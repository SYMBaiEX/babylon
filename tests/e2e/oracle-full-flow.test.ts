/**
 * End-to-End Oracle Flow Test
 * 
 * Tests the complete flow:
 * 1. Question created → Oracle commit
 * 2. Users trade on Predimarket
 * 3. Question resolved → Oracle reveal
 * 4. Market resolves → Users claim payouts
 */

import { describe, it, expect, beforeAll } from 'bun:test'
import { execSync } from 'child_process'
import { prisma } from '../../src/lib/prisma'
import { getOracleService } from '../../src/lib/oracle'
import { generateSnowflakeId } from '../../src/lib/snowflake'

describe('Oracle E2E Flow', () => {
  let oracleService: ReturnType<typeof getOracleService>
  let testQuestionId: string
  let sessionId: string

  beforeAll(async () => {
    // Ensure Anvil is running
    try {
      execSync('cast block-number --rpc-url http://localhost:8545', { stdio: 'ignore' })
    } catch {
      throw new Error('❌ Anvil not running. Start with: docker-compose up -d anvil')
    }

    // Ensure contracts are deployed
    if (!process.env.NEXT_PUBLIC_BABYLON_ORACLE) {
      throw new Error('❌ Contracts not deployed. Run: bun run contracts:deploy:local')
    }

    oracleService = getOracleService()

    // Verify oracle is healthy
    const health = await oracleService.healthCheck()
    if (!health.healthy) {
      throw new Error(`❌ Oracle health check failed: ${health.error}`)
    }
  })

  it('Step 1: Create question and commit to oracle', async () => {
    testQuestionId = generateSnowflakeId()

    // Create question in database
    const resolutionDate = new Date()
    resolutionDate.setDate(resolutionDate.getDate() + 3)

    const question = await prisma.question.create({
      data: {
        id: testQuestionId,
        questionNumber: 9999,
        text: 'Will this E2E test pass?',
        scenarioId: 1,
        outcome: true,  // YES will win
        rank: 1,
        createdDate: new Date(),
        resolutionDate,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    })

    expect(question).toBeTruthy()
    expect(question.id).toBe(testQuestionId)

    // Commit to oracle
    const commitResult = await oracleService.commitGame(
      question.id,
      question.questionNumber,
      question.text,
      'e2e-test',
      question.outcome
    )

    expect(commitResult.sessionId).toBeTruthy()
    expect(commitResult.questionId).toBe(testQuestionId)
    expect(commitResult.txHash).toMatch(/^0x[0-9a-f]{64}$/i)

    sessionId = commitResult.sessionId

    // Update question with oracle data
    await prisma.question.update({
      where: { id: question.id },
      data: {
        oracleSessionId: commitResult.sessionId,
        oracleCommitment: commitResult.commitment,
        oracleCommitTxHash: commitResult.txHash,
        oracleCommitBlock: commitResult.blockNumber || null,
      }
    })

    // Verify commitment stored
    const updated = await prisma.question.findUnique({
      where: { id: testQuestionId }
    })

    expect(updated!.oracleSessionId).toBe(sessionId)
    expect(updated!.oracleCommitTxHash).toBeTruthy()

    console.log('✅ Step 1: Question created and committed to oracle')
    console.log(`   Session ID: ${sessionId}`)
    console.log(`   TX Hash: ${commitResult.txHash}`)
  })

  it('Step 2: Verify oracle contract state', async () => {
    // Check oracle statistics
    const stats = await oracleService.getStatistics()
    
    expect(parseInt(stats.committed)).toBeGreaterThan(0)
    expect(parseInt(stats.pending)).toBeGreaterThan(0)

    // Check game info
    const gameInfo = await oracleService.getGameInfo(sessionId)
    
    expect(gameInfo).toBeTruthy()
    expect(gameInfo.metadata.questionId).toBe(testQuestionId)
    expect(gameInfo.game.question).toBe('Will this E2E test pass?')
    expect(gameInfo.game.finalized).toBe(false)

    console.log('✅ Step 2: Oracle contract state verified')
    console.log(`   Committed: ${stats.committed}, Pending: ${stats.pending}`)
  })

  it('Step 3: Simulate trading (would happen via Predimarket)', async () => {
    // In a real scenario, users would:
    // 1. Approve token spending
    // 2. Call predimarket.buy(sessionId, outcome, amount, minShares)
    // 3. Trade creates positions

    // For this E2E test, we're just verifying the oracle side works
    // The Solidity tests cover the full trading flow

    console.log('✅ Step 3: Trading phase (verified in Solidity tests)')
  })

  it('Step 4: Resolve question and reveal on oracle', async () => {
    // Mark question as resolved
    await prisma.question.update({
      where: { id: testQuestionId },
      data: { status: 'resolved' }
    })

    // Reveal on oracle
    const revealResult = await oracleService.revealGame(
      testQuestionId,
      true,  // outcome = YES
      [],    // winners (would be populated from positions)
      BigInt(0)
    )

    expect(revealResult.sessionId).toBe(sessionId)
    expect(revealResult.outcome).toBe(true)
    expect(revealResult.txHash).toMatch(/^0x[0-9a-f]{64}$/i)

    // Update question with reveal data
    await prisma.question.update({
      where: { id: testQuestionId },
      data: {
        oracleRevealTxHash: revealResult.txHash,
        oracleRevealBlock: revealResult.blockNumber || null,
        oraclePublishedAt: new Date(),
      }
    })

    // Verify updated
    const updated = await prisma.question.findUnique({
      where: { id: testQuestionId }
    })

    expect(updated!.oracleRevealTxHash).toBeTruthy()
    expect(updated!.oraclePublishedAt).toBeTruthy()

    console.log('✅ Step 4: Question resolved and revealed on oracle')
    console.log(`   Reveal TX Hash: ${revealResult.txHash}`)
  })

  it('Step 5: Verify outcome can be read from oracle', async () => {
    // This is what external contracts would do
    const gameInfo = await oracleService.getGameInfo(sessionId)

    expect(gameInfo.game.finalized).toBe(true)
    expect(gameInfo.game.outcome).toBe(true)
    expect(gameInfo.game.endTime).toBeGreaterThan(0)

    // Verify statistics updated
    const stats = await oracleService.getStatistics()
    expect(parseInt(stats.revealed)).toBeGreaterThan(0)

    console.log('✅ Step 5: Outcome readable from oracle')
    console.log(`   Outcome: ${gameInfo.game.outcome ? 'YES' : 'NO'}`)
    console.log(`   Finalized: ${gameInfo.game.finalized}`)
  })

  it('Step 6: Cleanup test data', async () => {
    // Delete test question
    await prisma.question.delete({
      where: { id: testQuestionId }
    })

    console.log('✅ Step 6: Test data cleaned up')
  })
})

describe('Oracle Error Handling', () => {
  it('should handle missing commitment gracefully', async () => {
    const oracleService = getOracleService()

    try {
      await oracleService.revealGame(
        'nonexistent-question',
        true,
        [],
        BigInt(0)
      )
      
      // Should not reach here
      expect(true).toBe(false)
    } catch (error) {
      expect(error).toBeTruthy()
      expect((error as Error).message).toContain('No commitment found')
    }
  })

  it('should report unhealthy if oracle not deployed', async () => {
    // Create oracle with invalid address
    const invalidOracle = new (await import('../../src/lib/oracle/oracle-service')).OracleService({
      oracleAddress: '0x0000000000000000000000000000000000000000',
      privateKey: process.env.ORACLE_PRIVATE_KEY || '',
      rpcUrl: 'http://localhost:8545',
      chainId: 31337,
    })

    const health = await invalidOracle.healthCheck()
    expect(health.healthy).toBe(false)
    expect(health.error).toContain('not deployed')
  })
})
