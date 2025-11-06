import { authenticate } from '@/lib/api/auth-middleware'
import { successResponse } from '@/lib/api/auth-middleware'
import { withErrorHandling } from '@/lib/errors/error-handler'
import { logger } from '@/lib/logger'
import type { NextRequest } from 'next/server'
import { OnboardingIntentService } from '@/lib/onboarding/intent-service'
import { serializeIntent } from '@/lib/onboarding/types'
import { ensureUserForAuth, getCanonicalUserId } from '@/lib/users/ensure-user'

export const POST = withErrorHandling(async (request: NextRequest) => {
  const user = await authenticate(request)

  const displayName = user.walletAddress
    ? `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}`
    : 'Anonymous'

  await ensureUserForAuth(user, { displayName })
  const canonicalUserId = getCanonicalUserId(user)

  const body = await request.json().catch(() => ({})) as { referralCode?: string | null }
  const referralCode = body?.referralCode ?? undefined

  const intent = await OnboardingIntentService.getOrCreate(canonicalUserId, referralCode)

  logger.info('Onboarding intent created/fetched', { userId: canonicalUserId, intentId: intent.id, status: intent.status }, 'POST /api/onboarding/intents')

  return successResponse(serializeIntent(intent))
})
