/**
 * Manual Feedback Submission API
 * 
 * @route POST /api/feedback/submit - Submit feedback
 * @access Public
 * 
 * @description
 * Allows users to submit feedback manually with star ratings or scores.
 * Supports various feedback categories and optional comments.
 * 
 * @openapi
 * /api/feedback/submit:
 *   post:
 *     tags:
 *       - Feedback
 *     summary: Submit feedback
 *     description: Submits manual feedback with star ratings or scores
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fromUserId
 *               - toUserId
 *             properties:
 *               fromUserId:
 *                 type: string
 *               toUserId:
 *                 type: string
 *               score:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 100
 *                 description: Score (0-100) or converted from stars
 *               stars:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *                 description: Star rating (1-5, alternative to score)
 *               comment:
 *                 type: string
 *               category:
 *                 type: string
 *                 enum: [trade_performance, game_performance, general]
 *     responses:
 *       200:
 *         description: Feedback submitted successfully
 *       400:
 *         description: Invalid input
 * 
 * @example
 * ```typescript
 * await fetch('/api/feedback/submit', {
 *   method: 'POST',
 *   body: JSON.stringify({
 *     fromUserId: 'user-1',
 *     toUserId: 'user-2',
 *     stars: 5,
 *     comment: 'Great trader!'
 *   })
 * });
 * ```
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUserByIdentifier } from '@/lib/users/user-lookup'
import { logger } from '@/lib/logger'
import { generateSnowflakeId } from '@/lib/snowflake'
import { submitFeedbackToAgent0 } from '@/lib/reputation/agent0-reputation-sync'
import { updateFeedbackMetrics } from '@/lib/reputation/reputation-service'
import { z } from 'zod'

const FeedbackSubmitSchema = z.object({
  fromUserId: z.string().min(1, 'fromUserId is required'),
  toUserId: z.string().min(1, 'toUserId is required'),
  score: z.number().min(0).max(100).optional(),
  stars: z.number().int().min(1).max(5).optional(),
  comment: z.string().max(5000).optional(),
  category: z.string().min(1).optional(),
}).refine(
  ({ score, stars }) => score !== undefined || stars !== undefined,
  {
    message: 'Either score or stars must be provided',
    path: ['score'],
  }
)

export async function POST(request: NextRequest) {
  const json = await request.json()
  const parsed = FeedbackSubmitSchema.parse(json)

  const body = parsed

  const score = body.stars !== undefined ? body.stars * 20 : body.score!

  const fromUser = await requireUserByIdentifier(body.fromUserId)
  const toUser = await requireUserByIdentifier(body.toUserId)

  const now = new Date()
  const feedback = await prisma.feedback.create({
    data: {
      id: await generateSnowflakeId(),
      fromUserId: fromUser.id,
      toUserId: toUser.id,
      score,
      comment: body.comment ?? null,
      category: body.category ?? 'general',
      interactionType: 'user_to_agent',
      createdAt: now,
      updatedAt: now,
    },
  })

  logger.info('Feedback submitted successfully', {
    feedbackId: feedback.id,
    fromUserId: fromUser.id,
    toUserId: toUser.id,
    score,
  })

  // Update feedback metrics
  await updateFeedbackMetrics(toUser.id, score)

  // Submit to Agent0 network if recipient is an agent (fire-and-forget with error handling)
  // Only submit if recipient has Agent0 token ID (checked inside submitFeedbackToAgent0)
  submitFeedbackToAgent0(feedback.id).catch((error) => {
    logger.error('Failed to submit feedback to Agent0', {
      feedbackId: feedback.id,
      error,
    })
  })

  return NextResponse.json({
    success: true,
    feedbackId: feedback.id,
    score,
    message: 'Feedback submitted successfully',
  }, { status: 201 })
}
