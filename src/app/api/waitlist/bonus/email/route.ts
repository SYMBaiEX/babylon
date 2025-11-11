/**
 * Email Bonus API
 * POST /api/waitlist/bonus/email
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

