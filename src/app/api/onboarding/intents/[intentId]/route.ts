import { authenticate } from '@/lib/api/auth-middleware'
import { successResponse } from '@/lib/api/auth-middleware'
import { withErrorHandling } from '@/lib/errors/error-handler'
import { BusinessLogicError } from '@/lib/errors'
import { OnboardingIntentService } from '@/lib/onboarding/intent-service'
import { serializeIntent } from '@/lib/onboarding/types'
import { OnboardingIntentIdSchema } from '@/lib/validation/schemas'
import type { NextRequest } from 'next/server'

export const GET = withErrorHandling(async (
  request: NextRequest,
  context?: { params: Promise<{ intentId: string }> }
) => {
  const user = await authenticate(request)
  const params = await (context?.params || Promise.reject(new BusinessLogicError('Missing route context', 'MISSING_CONTEXT')))
  const { intentId } = OnboardingIntentIdSchema.parse(params)

  const intent = await OnboardingIntentService.requireOwnership(intentId, user.userId)

  return successResponse(serializeIntent(intent))
})
