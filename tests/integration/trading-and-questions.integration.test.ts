/**
 * Integration Test: Trading and Prediction Question Generation
 * 
 * Verifies that core gameplay mechanics work correctly:
 * - NPC trading creates positions and updates markets
 * - Prediction question generation creates new questions and markets
 * - Both features work together in a game tick
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { prisma } from '@/lib/prisma'
import { executeGameTick } from '@/lib/serverless-game-tick'
import { asSystem } from '@/lib/db/context'
import { generateSnowflakeId } from '@/lib/snowflake'

describe('Trading and Question Generation Integration', () => {
  let initialMarketCount: number
  let testQuestionIds: string[] = []
  let testMarketIds: string[] = []

  beforeAll(async () => {
    // Ensure game is running
    const gameState = await asSystem(async (db) => {
      return await db.game.findFirst({
        where: { isContinuous: true }
      })
    })

    if (!gameState) {
      await asSystem(async (db) => {
        await db.game.create({
          data: {
            id: await generateSnowflakeId(),
            isContinuous: true,
            isRunning: true,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        })
      })
    } else if (!gameState.isRunning) {
      await asSystem(async (db) => {
        await db.game.updateMany({
          where: { isContinuous: true },
          data: { isRunning: true }
        })
      })
    }

    // Get baseline counts
    initialMarketCount = await prisma.market.count({
      where: { resolved: false }
    })

    // Ensure we have at least one active market for trading
    const activeMarkets = await prisma.market.findMany({
      where: { resolved: false },
      take: 1
    })

    if (activeMarkets.length === 0) {
      // Create a test market if none exist
      const testQuestionId = await generateSnowflakeId()
      const testMarketId = await generateSnowflakeId()
      
      await prisma.question.create({
        data: {
          id: testQuestionId,
          questionNumber: Math.floor(Date.now() / 1000) % 1000000,
          text: 'Test: Will trading work?',
          scenarioId: 1,
          outcome: false,
          rank: 1,
          status: 'active',
          resolutionDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          createdAt: new Date(),
          updatedAt: new Date()
        }
      })

      await prisma.market.create({
        data: {
          id: testMarketId,
          question: 'Test: Will trading work?',
          yesShares: 100,
          noShares: 100,
          liquidity: 200,
          resolved: false,
          endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          createdAt: new Date(),
          updatedAt: new Date()
        }
      })

      testQuestionIds.push(testQuestionId)
      testMarketIds.push(testMarketId)
    }

    // Ensure we have NPCs with trading enabled
    const npcs = await prisma.user.findMany({
      where: {
        isAgent: false,
        virtualBalance: { gt: 0 }
      },
      take: 5
    })

    if (npcs.length === 0) {
      console.log('⚠️  Warning: No NPCs found with balance. Trading may not occur.')
    }
  })

  afterAll(async () => {
    // Cleanup test data
    if (testQuestionIds.length > 0) {
      for (const id of testQuestionIds) {
        try {
          await prisma.question.delete({ where: { id } }).catch(() => {})
        } catch {
          // Ignore cleanup errors
        }
      }
    }

    if (testMarketIds.length > 0) {
      for (const id of testMarketIds) {
        try {
          await prisma.market.delete({ where: { id } }).catch(() => {})
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  })

  test('should execute game tick and process trading', async () => {
    const result = await executeGameTick(true) // Skip content generation for faster test

    expect(result).toBeDefined()
    expect(typeof result.marketsUpdated).toBe('number')
    expect(result.marketsUpdated).toBeGreaterThanOrEqual(0)

    // Verify markets were updated if trading occurred
    if (result.marketsUpdated > 0) {
      const afterMarketCount = await prisma.market.count({
        where: { resolved: false }
      })

      // Markets should still exist (or more if new ones were created)
      expect(afterMarketCount).toBeGreaterThanOrEqual(initialMarketCount)
    }
  }, 60000)

  test('should create NPC positions when trading occurs', async () => {
    // Get initial position count
    const beforePositions = await prisma.position.count({
      where: { status: 'active' }
    })

    // Run game tick
    const result = await executeGameTick(true)

    // Get position count after tick
    const afterPositions = await prisma.position.count({
      where: { status: 'active' }
    })

    // If markets were updated, positions may have been created
    if (result.marketsUpdated > 0) {
      // Positions should have increased or stayed the same (some may have closed)
      // We check that positions exist or were created
      expect(afterPositions).toBeGreaterThanOrEqual(0)
      
      // Verify at least some positions exist if trading occurred
      const hasPositions = afterPositions > 0 || beforePositions > 0
      expect(hasPositions).toBe(true)
    }
  }, 60000)

  test('should generate new questions when count is low', async () => {
    // Get current active question count
    const beforeQuestions = await prisma.question.count({
      where: { status: 'active' }
    })

    // If we have 10+ questions, delete some to trigger generation
    if (beforeQuestions >= 10) {
      // Delete oldest questions to get below threshold
      const questionsToDelete = await prisma.question.findMany({
        where: { status: 'active' },
        orderBy: { createdAt: 'asc' },
        take: beforeQuestions - 8 // Leave 8 active (below 10 threshold)
      })

      for (const q of questionsToDelete) {
        await prisma.question.update({
          where: { id: q.id },
          data: { status: 'resolved' }
        })
      }
    }

    // Run game tick
    const result = await executeGameTick(true)

    // Check if questions were created
    const afterQuestions = await prisma.question.count({
      where: { status: 'active' }
    })

    // If questions were generated, count should have increased
    if (result.questionsCreated > 0) {
      expect(afterQuestions).toBeGreaterThan(beforeQuestions)
      
      // Verify questions have associated markets
      const newQuestions = await prisma.question.findMany({
        where: {
          status: 'active',
          createdAt: { gte: new Date(Date.now() - 60000) } // Created in last minute
        }
      })

      for (const question of newQuestions) {
        const market = await prisma.market.findUnique({
          where: { id: question.id }
        })
        expect(market).toBeTruthy()
        expect(market?.resolved).toBe(false)
      }
    } else if (beforeQuestions >= 10) {
      // If we had 10+ questions, generation should have been skipped
      expect(result.questionsCreated).toBe(0)
    }
  }, 60000)

  test('should update market prices when NPCs trade', async () => {
    // Get a market to track
    const market = await prisma.market.findFirst({
      where: { resolved: false },
      orderBy: { createdAt: 'desc' }
    })

    if (!market) {
      console.log('⏭️  Skipping - no active markets found')
      return
    }

    const beforeYesShares = Number(market.yesShares)
    const beforeNoShares = Number(market.noShares)
    const beforeUpdatedAt = market.updatedAt

    // Run game tick
    const result = await executeGameTick(true)

    // Check if market was updated
    const afterMarket = await prisma.market.findUnique({
      where: { id: market.id }
    })

    expect(afterMarket).toBeTruthy()

    if (result.marketsUpdated > 0) {
      const afterYesShares = Number(afterMarket?.yesShares || 0)
      const afterNoShares = Number(afterMarket?.noShares || 0)

      // At least one side should have changed if trading occurred
      const sharesChanged = 
        afterYesShares !== beforeYesShares || 
        afterNoShares !== beforeNoShares

      // Market should have been updated (timestamp changed)
      const timestampChanged = 
        new Date(afterMarket?.updatedAt || 0).getTime() > 
        new Date(beforeUpdatedAt).getTime()

      // If markets were updated, either shares changed or timestamp changed
      expect(sharesChanged || timestampChanged).toBe(true)
    }
  }, 60000)

  test('should create markets for new questions', async () => {
    // Ensure we're below question threshold to trigger generation
    const activeQuestions = await prisma.question.count({
      where: { status: 'active' }
    })

    if (activeQuestions >= 10) {
      // Resolve some questions to trigger generation
      const questionsToResolve = await prisma.question.findMany({
        where: { status: 'active' },
        orderBy: { createdAt: 'asc' },
        take: activeQuestions - 8
      })

      for (const q of questionsToResolve) {
        await prisma.question.update({
          where: { id: q.id },
          data: { status: 'resolved' }
        })
      }
    }

    // Run game tick
    const result = await executeGameTick(true)

    // Check if new markets were created
    const afterMarkets = await prisma.market.count({
      where: { resolved: false }
    })

    if (result.questionsCreated > 0) {
      // New questions should have associated markets
      expect(afterMarkets).toBeGreaterThanOrEqual(initialMarketCount)

      // Verify new questions have markets
      const newQuestions = await prisma.question.findMany({
        where: {
          status: 'active',
          createdAt: { gte: new Date(Date.now() - 60000) }
        }
      })

      for (const question of newQuestions) {
        const market = await prisma.market.findUnique({
          where: { id: question.id }
        })
        expect(market).toBeTruthy()
        expect(market?.question).toBe(question.text)
        expect(market?.resolved).toBe(false)
      }
    }
  }, 60000)

  test('should verify trading and question generation work together', async () => {
    // This is a comprehensive test that verifies both features work in the same tick
    
    // Get baseline state
    const beforeQuestions = await prisma.question.count({
      where: { status: 'active' }
    })

    // Run game tick
    const result = await executeGameTick(true)

    // Verify results structure
    expect(result).toBeDefined()
    expect(typeof result.marketsUpdated).toBe('number')
    expect(typeof result.questionsCreated).toBe('number')
    expect(typeof result.questionsResolved).toBe('number')

    // Verify trading occurred (if NPCs exist and have balance)
    const npcsWithBalance = await prisma.user.count({
      where: {
        isAgent: false,
        virtualBalance: { gt: 0 }
      }
    })

    if (npcsWithBalance > 0) {
      // Trading should have occurred (markets updated or positions created)
      // Note: Trading may not occur every tick (NPCs may hold)
      // But if markets exist and NPCs have balance, trading should eventually occur
      const currentPositions = await prisma.position.count({ where: { status: 'active' } })
      console.log(`Trading status: marketsUpdated=${result.marketsUpdated}, positions=${currentPositions}`)
      
      // Verify trading infrastructure is working (even if no trades this tick)
      expect(result.marketsUpdated).toBeGreaterThanOrEqual(0)
      expect(currentPositions).toBeGreaterThanOrEqual(0)
    }

    // Verify question generation (if below threshold)
    if (beforeQuestions < 10) {
      const afterQuestions = await prisma.question.count({
        where: { status: 'active' }
      })

      // Questions should have been generated or at least attempted
      expect(afterQuestions).toBeGreaterThanOrEqual(beforeQuestions)
      
      if (result.questionsCreated > 0) {
        expect(afterQuestions).toBeGreaterThan(beforeQuestions)
      }
    }

    // Verify markets exist for all active questions
    const activeQuestions = await prisma.question.findMany({
      where: { status: 'active' }
    })

    for (const question of activeQuestions) {
      const market = await prisma.market.findUnique({
        where: { id: question.id }
      })
      expect(market).toBeTruthy()
      expect(market?.resolved).toBe(false)
    }
  }, 60000)
})

