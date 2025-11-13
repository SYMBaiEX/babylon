#!/usr/bin/env bun
/**
 * Test question resolution on-chain
 */

import { $ } from 'bun'
import { logger } from '../src/lib/logger'
import { prisma } from '../src/lib/prisma'

const DIAMOND = process.env.NEXT_PUBLIC_DIAMOND_ADDRESS || '0xdc64a140aa3e981100a9beca4e685f962f0cf6c9'
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'http://localhost:8545'
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

async function main() {
  logger.info('Testing Question Resolution On-Chain', undefined, 'Test')
  
  // Check for resolved questions
  const resolvedQuestion = await prisma.question.findFirst({
    where: { status: 'resolved' },
  })

  if (!resolvedQuestion) {
    logger.info('No resolved questions found', undefined, 'Test')
    logger.info('Questions will be resolved on-chain when:', undefined, 'Test')
    logger.info('  1. Question resolves (status = resolved)', undefined, 'Test')
    logger.info('  2. Market exists with matching question text', undefined, 'Test')
    logger.info('  3. Market has onChainMarketId set', undefined, 'Test')
    logger.info('  4. resolveQuestionPayouts() is called during game tick', undefined, 'Test')
  } else {
    logger.info(`Found resolved question: ${resolvedQuestion.questionNumber}`, undefined, 'Test')
    logger.info(`  Text: ${resolvedQuestion.text}`, undefined, 'Test')
    logger.info(`  Outcome: ${resolvedQuestion.outcome}`, undefined, 'Test')
    
    // Find market by question text
    const market = await prisma.market.findFirst({
      where: { question: resolvedQuestion.text },
    })
    
    if (market) {
      logger.info(`  Found market: ${market.id}`, undefined, 'Test')
      logger.info(`  Market resolved: ${market.resolved}`, undefined, 'Test')
      
      if (market.onChainMarketId) {
        logger.info(`  On-chain Market ID: ${market.onChainMarketId}`, undefined, 'Test')
        logger.info(`  On-chain Resolved: ${market.onChainResolved}`, undefined, 'Test')
        
        if (!market.onChainResolved) {
          logger.info('  ⚠️ Market not resolved on-chain yet', undefined, 'Test')
          logger.info('  This will be resolved by resolveQuestionPayouts() during game tick', undefined, 'Test')
        } else {
          logger.info('  ✅ Market is resolved on-chain!', undefined, 'Test')
          if (market.onChainResolutionTxHash) {
            logger.info(`  Transaction: ${market.onChainResolutionTxHash}`, undefined, 'Test')
          }
        }
      } else {
        logger.info('  ⚠️ Market has no onChainMarketId', undefined, 'Test')
        logger.info('  Markets need to be created on-chain first', undefined, 'Test')
      }
    } else {
      logger.info('  ⚠️ No market found for this question', undefined, 'Test')
    }
  }

  logger.info('\n✅ Question resolution check complete!', undefined, 'Test')
}

main().catch((error) => {
  logger.error('Test failed:', error, 'Test')
  process.exit(1)
})

