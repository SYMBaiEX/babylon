/**
 * API Route: GET /api/users/[userId]/referral-fees
 * Get referral fee earnings for a user
 */

import type { NextRequest } from 'next/server'
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler'
import { authenticate } from '@/lib/api/auth-middleware'
import { FeeService } from '@/lib/services/fee-service'
import { logger } from '@/lib/logger'
import { requireUserByIdentifier } from '@/lib/users/user-lookup'

export const GET = withErrorHandling(async (
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) => {
  const authUser = await authenticate(request)
  const { userId } = await context.params)
  
  // Verify authorization
  const user = await requireUserByIdentifier(userId, {
    id: true,
    totalFeesEarned: true,
  })
  
  if (authUser.userId !== user.id) {
    throw new Error('Unauthorized')
  }

  // Get referral earnings
  const earnings = await FeeService.getReferralEarnings(user.id, {
    limit: 20,
  })

  logger.info('Referral fees fetched', {
    userId: user.id,
    totalEarned: earnings.totalEarned,
    totalReferrals: earnings.totalReferrals,
  }, 'GET /api/users/[userId]/referral-fees')

  return successResponse({
    totalEarned: earnings.totalEarned,
    totalReferrals: earnings.totalReferrals,
    topReferrals: earnings.topReferrals,
    recentFees: earnings.recentFees,
  })
})



