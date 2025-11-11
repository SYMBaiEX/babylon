/**
 * Wallet Bonus API
 * POST /api/waitlist/bonus/wallet
 */

import type { NextRequest } from 'next/server'
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler'
import { WaitlistService } from '@/lib/services/waitlist-service'
import { logger } from '@/lib/logger'
import { z } from 'zod'

const WalletBonusSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  walletAddress: z.string().min(1, 'Wallet address is required'),
})

export const POST = withErrorHandling(async (request: NextRequest) => {
  const body = await request.json()
  const { userId, walletAddress } = WalletBonusSchema.parse(body)

  logger.info('Wallet bonus request', { userId, walletAddress }, 'POST /api/waitlist/bonus/wallet')

  const awarded = await WaitlistService.awardWalletBonus(userId, walletAddress)

  return successResponse({
    awarded,
    bonusAmount: awarded ? 25 : 0,
    message: awarded ? 'Wallet bonus awarded' : 'Wallet bonus already awarded or user not found',
  })
})

