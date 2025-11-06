import { authenticate } from '@/lib/api/auth-middleware'
import { successResponse } from '@/lib/api/auth-middleware'
import { withErrorHandling } from '@/lib/errors/error-handler'
import { logger } from '@/lib/logger'
import type { NextRequest } from 'next/server'
import { OnboardingIntentService } from '@/lib/onboarding/intent-service'
import { serializeIntent } from '@/lib/onboarding/types'

export const POST = withErrorHandling(async (request: NextRequest) => {
  const user = await authenticate(request)

  const body = await request.json().catch(() => ({})) as { referralCode?: string | null }
  const referralCode = body?.referralCode ?? undefined

  const intent = await OnboardingIntentService.getOrCreate(user.userId, referralCode)

  logger.info('Onboarding intent created/fetched', { userId: user.userId, intentId: intent.id, status: intent.status }, 'POST /api/onboarding/intents')

  return successResponse(serializeIntent(intent))
})
