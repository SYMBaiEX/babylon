/**
 * Auto-Generate Feedback API
 *
 * POST /api/feedback/auto-generate
 * Automatically generates feedback for completed games or trades
 * Calculates performance scores and updates agent metrics
 *
 * Request body should include either:
 * - Game completion: { type: 'game', agentId, gameId, metrics: GameMetrics }
 * - Trade completion: { type: 'trade', agentId, tradeId, metrics: TradeMetrics }
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { requireUserByIdentifier } from '@/lib/users/user-lookup'
import {
  generateGameCompletionFeedback,
  CompletionFormat,
} from '@/lib/reputation/reputation-service'
import { logger } from '@/lib/logger'
import { z } from 'zod'

const GameMetricsSchema = z.object({
  won: z.boolean(),
  pnl: z.number(),
  positionsClosed: z.number(),
  finalBalance: z.number(),
  startingBalance: z.number(),
  decisionsCorrect: z.number(),
  decisionsTotal: z.number(),
  timeToComplete: z.number().optional(),
  riskManagement: z.number().optional(),
})

const TradeMetricsSchema = z.object({
  profitable: z.boolean(),
  roi: z.number(),
  holdingPeriod: z.number(),
  timingScore: z.number(),
  riskScore: z.number(),
})

const GameFeedbackRequestSchema = z.object({
  type: z.literal('game'),
  agentId: z.string().min(1),
  gameId: z.string().min(1),
  metrics: GameMetricsSchema,
})

const TradeFeedbackRequestSchema = z.object({
  type: z.literal('trade'),
  agentId: z.string().min(1),
  tradeId: z.string().min(1),
  metrics: TradeMetricsSchema,
})

const AutoGenerateFeedbackRequestSchema = z.discriminatedUnion('type', [
  GameFeedbackRequestSchema,
  TradeFeedbackRequestSchema,
])

export async function POST(request: NextRequest) {
  try {
    const json = await request.json()
    const parsed = AutoGenerateFeedbackRequestSchema.safeParse(json)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request payload', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const body = parsed.data

    // Verify agent exists
    const agent = await requireUserByIdentifier(body.agentId)

    // Generate feedback based on type
    if (body.type === 'game') {
      const feedback = await generateGameCompletionFeedback(
        agent.id,
        body.gameId,
        body.metrics
      )

      return NextResponse.json({
        success: true,
        feedbackId: feedback.id,
        type: 'game',
        score: feedback.score,
        message: 'Game feedback generated successfully',
      }, { status: 201 })
    } else {
      // type === 'trade'
      const feedback = await CompletionFormat(
        agent.id,
        body.tradeId,
        body.metrics
      )

      return NextResponse.json({
        success: true,
        feedbackId: feedback.id,
        type: 'trade',
        score: feedback.score,
        message: 'Trade feedback generated successfully',
      }, { status: 201 })
    }
  } catch (error) {
    logger.error('Failed to auto-generate feedback', error)

    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
      }
    }

    return NextResponse.json({ error: 'Failed to generate feedback' }, { status: 500 })
  }
}
