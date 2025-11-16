/**
 * Waitlist Email Bonus API
 * 
 * @route POST /api/waitlist/bonus/email - Award email bonus
 * @access Public
 * 
 * @description
 * Awards waitlist bonus points (25 points) for providing an email address. One-time
 * bonus per user. Returns whether bonus was awarded or already claimed.
 * 
 * @openapi
 * /api/waitlist/bonus/email:
 *   post:
 *     tags:
 *       - Waitlist
 *     summary: Award email bonus
 *     description: Awards 25 waitlist points for providing email address (one-time bonus)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - email
 *             properties:
 *               userId:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Bonus processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 awarded:
 *                   type: boolean
 *                 bonusAmount:
 *                   type: integer
 *                   example: 25
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid input or user not found
 * 
 * @example
 * ```typescript
 * await fetch('/api/waitlist/bonus/email', {
 *   method: 'POST',
 *   body: JSON.stringify({
 *     userId: 'user-id',
 *     email: 'user@example.com'
 *   })
 * });
 * ```
 * 
 * @see {@link /lib/services/waitlist-service} Waitlist service
 */

import type { NextRequest } from 'next/server'
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler'
import { WaitlistService } from '@/lib/services/waitlist-service'
import { logger } from '@/lib/logger'
import { z } from 'zod'

const EmailBonusSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  email: z.string().email('Valid email is required'),
})

export const POST = withErrorHandling(async (request: NextRequest) => {
  const body = await request.json()
  const { userId, email } = EmailBonusSchema.parse(body)

  logger.info('Email bonus request', { userId, email }, 'POST /api/waitlist/bonus/email')

  const awarded = await WaitlistService.awardEmailBonus(userId, email)

  return successResponse({
    awarded,
    bonusAmount: awarded ? 25 : 0,
    message: awarded ? 'Email bonus awarded' : 'Email bonus already awarded or user not found',
  })
})

