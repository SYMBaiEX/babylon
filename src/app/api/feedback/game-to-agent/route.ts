/**
 * Game-to-Agent Feedback API
 *
 * Allows games to submit performance feedback for agents.
 * This is the primary mechanism for rating agent performance in games.
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/database-service'
import { updateGameMetrics, updateFeedbackMetrics } from '@/lib/reputation/reputation-service'
import { requireUserByIdentifier } from '@/lib/users/user-lookup'
import { logger } from '@/lib/logger'
import { generateSnowflakeId } from '@/lib/snowflake'
import { z } from 'zod'

const GameFeedbackSchema = z.object({
  agentId: z.string().min(1, 'agentId is required'),
  gameId: z.string().min(1, 'gameId is required'),
  score: z.number().min(0).max(100),
  won: z.boolean(),
  comment: z.string().max(5000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const json = await request.json()
    const parsed = GameFeedbackSchema.safeParse(json)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request payload', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const body = parsed.data

    // Verify agent exists
    const agent = await requireUserByIdentifier(body.agentId)

    // Check if feedback already exists for this game
    const existingFeedback = await prisma.feedback.findFirst({
      where: {
        toUserId: agent.id,
        gameId: body.gameId,
        interactionType: 'game_to_agent',
      },
    })

    if (existingFeedback) {
      logger.warn('Feedback already exists for this game', { agentId: agent.id, gameId: body.gameId })
      return NextResponse.json(
        {
          error: 'Feedback already submitted for this game',
          feedbackId: existingFeedback.id,
        },
        { status: 409 }
      )
    }

    // Create feedback record
    const now = new Date();
    const feedback = await prisma.feedback.create({
      data: {
        id: generateSnowflakeId(),
        toUserId: agent.id,
        score: body.score,
        comment: body.comment,
        gameId: body.gameId,
        interactionType: 'game_to_agent',
        metadata: body.metadata as Prisma.InputJsonValue | undefined,
        createdAt: now,
        updatedAt: now,
      },
    })

    logger.info('Game feedback created', {
      feedbackId: feedback.id,
      agentId: agent.id,
      gameId: body.gameId,
      score: body.score,
      won: body.won,
    })

    // Update game metrics (which also recalculates reputation)
    await updateGameMetrics(agent.id, body.score, body.won)

    // Update feedback metrics (also recalculates reputation)
    await updateFeedbackMetrics(agent.id, body.score)

    // Get updated reputation
    const metrics = await prisma.agentPerformanceMetrics.findUnique({
      where: { userId: agent.id },
      select: {
        reputationScore: true,
        trustLevel: true,
        confidenceScore: true,
        gamesPlayed: true,
        gamesWon: true,
        averageGameScore: true,
        averageFeedbackScore: true,
      },
    })

    return NextResponse.json(
      {
        success: true,
        feedbackId: feedback.id,
        reputation: metrics,
      },
      { status: 201 }
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const errorStack = error instanceof Error ? error.stack : undefined
    logger.error('Failed to create game feedback', { 
      error: errorMessage,
      stack: errorStack 
    }, 'GameToAgentFeedback')

    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    return NextResponse.json({ error: 'Failed to create feedback' }, { status: 500 })
  }
}
