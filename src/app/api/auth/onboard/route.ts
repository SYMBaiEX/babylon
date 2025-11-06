/**
 * On-Chain Registration API Route
 *
 * Legacy endpoint used by existing clients to trigger on-chain registration.
 * Internally delegates to the shared onboarding on-chain service.
 */

import type { NextRequest } from 'next/server'
import { authenticate } from '@/lib/api/auth-middleware'
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler'
import { OnChainRegistrationSchema } from '@/lib/validation/schemas/user'
import { processOnchainRegistration } from '@/lib/onboarding/onchain-service'
import { logger } from '@/lib/logger'

export const POST = withErrorHandling(async (request: NextRequest) => {
  const user = await authenticate(request)
  const body = await request.json()
  const payload = OnChainRegistrationSchema.parse(body)

  const result = await processOnchainRegistration({
    user,
    walletAddress: payload.walletAddress,
    username: payload.username,
    displayName: payload.displayName,
    bio: payload.bio,
    profileImageUrl: payload.profileImageUrl,
    coverImageUrl: payload.coverImageUrl,
    endpoint: payload.endpoint,
    referralCode: payload.referralCode,
  })

  logger.info('On-chain registration completed', {
    userId: user.userId,
    tokenId: result.tokenId,
    alreadyRegistered: result.alreadyRegistered,
    isAgent: user.isAgent,
  }, 'POST /api/auth/onboard')

  return successResponse(result)
})
