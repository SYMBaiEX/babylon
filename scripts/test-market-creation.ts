#!/usr/bin/env bun
/**
 * Test market creation on-chain
 */

import { logger } from '../src/lib/logger'
import { prisma } from '../src/lib/prisma'
import { ensureMarketOnChain } from '../src/lib/services/onchain-market-service'
import { generateSnowflakeId } from '../src/lib/snowflake'

async function main() {
  logger.info('Testing Market Creation On-Chain', undefined, 'Test')

  // Create a test market
  const questionId = generateSnowflakeId()
  const questionText = `Test question for on-chain market creation - ${Date.now()}`
  const endDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now

  logger.info('Creating test market in database...', undefined, 'Test')
  const market = await prisma.market.create({
    data: {
      id: questionId,
      question: questionText,
      description: 'Test market for on-chain creation',
      liquidity: 1000,
      endDate: endDate,
      gameId: 'continuous',
      updatedAt: new Date(),
    },
  })

  logger.info(`Created market: ${market.id}`, undefined, 'Test')
  logger.info(`Question: ${market.question}`, undefined, 'Test')

  // Create market on-chain
  logger.info('\nCreating market on-chain...', undefined, 'Test')
  const success = await ensureMarketOnChain(market.id)

  if (success) {
    // Verify onChainMarketId was stored
    const updated = await prisma.market.findUnique({
      where: { id: market.id },
      select: { id: true, onChainMarketId: true, oracleAddress: true },
    })

    if (updated?.onChainMarketId) {
      logger.info('✅ Market created on-chain successfully!', undefined, 'Test')
      logger.info(`   Market ID: ${updated.id}`, undefined, 'Test')
      logger.info(`   On-chain Market ID: ${updated.onChainMarketId}`, undefined, 'Test')
      logger.info(`   Oracle Address: ${updated.oracleAddress || 'Not set'}`, undefined, 'Test')
    } else {
      logger.warn('⚠️ Market creation succeeded but onChainMarketId not stored', undefined, 'Test')
    }
  } else {
    logger.error('❌ Failed to create market on-chain', undefined, 'Test')
    process.exit(1)
  }

  logger.info('\n✅ Test complete!', undefined, 'Test')
}

main().catch((error) => {
  logger.error('Test failed:', error, 'Test')
  process.exit(1)
})

