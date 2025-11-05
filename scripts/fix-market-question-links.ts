/**
 * Fix Market-Question Links
 * 
 * Creates missing markets for questions that don't have them,
 * ensuring each active question has a corresponding market.
 */

import { prisma } from '../src/lib/prisma'
import { logger } from '../src/lib/logger'

async function fixMarketQuestionLinks() {
  try {
    // Get all active questions
    const questions = await prisma.question.findMany({
      where: { status: 'active' },
    })

    logger.info(`Found ${questions.length} active questions`)

    let marketsCreated = 0
    let marketsAlreadyExist = 0

    for (const question of questions) {
      // Check if market exists with this ID
      const existingMarket = await prisma.market.findUnique({
        where: { id: question.id },
      })

      if (existingMarket) {
        marketsAlreadyExist++
        logger.debug(`Market already exists for question ${question.questionNumber}`)
      } else {
        // Create missing market
        try {
          await prisma.market.create({
            data: {
              id: question.id, // Use same ID as question
              question: question.text,
              description: `Prediction market for: ${question.text}`,
              liquidity: 1000,
              yesShares: 0,
              noShares: 0,
              endDate: question.resolutionDate,
              gameId: 'continuous',
              resolved: false,
            },
          })
          marketsCreated++
          logger.info(`Created market for question ${question.questionNumber}: ${question.text}`)
        } catch (error) {
          logger.error(`Failed to create market for question ${question.questionNumber}:`, error)
        }
      }
    }

    logger.info('Market-Question link fix completed:', {
      totalQuestions: questions.length,
      marketsCreated,
      marketsAlreadyExist,
    })

  } catch (error) {
    logger.error('Error fixing market-question links:', error)
  } finally {
    await prisma.$disconnect()
  }
}

fixMarketQuestionLinks()

