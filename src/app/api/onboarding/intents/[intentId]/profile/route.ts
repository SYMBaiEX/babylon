import { authenticate, successResponse } from '@/lib/api/auth-middleware'
import { ConflictError, BadRequestError } from '@/lib/errors'
import { withErrorHandling } from '@/lib/errors/error-handler'
import { OnboardingIntentService } from '@/lib/onboarding/intent-service'
import { OnboardingProfileService } from '@/lib/onboarding/profile-service'
import { serializeIntent } from '@/lib/onboarding/types'
import { OnboardingIntentIdSchema, OnboardingProfileSchema } from '@/lib/validation/schemas'
import type { NextRequest } from 'next/server'

export const PATCH = withErrorHandling(async (
  request: NextRequest,
  context?: { params: Promise<{ intentId: string }> }
) => {
  const user = await authenticate(request)
  const params = await (context?.params || Promise.reject(new BadRequestError('Missing route context')))
  const { intentId } = OnboardingIntentIdSchema.parse(params)
  const payload = OnboardingProfileSchema.parse(await request.json())

  const intent = await OnboardingIntentService.requireOwnership(intentId, user.userId)

  if (intent.status === 'ONCHAIN_IN_PROGRESS') {
    throw new ConflictError('Profile cannot be updated while on-chain processing is in progress', 'OnboardingIntent')
  }
  if (intent.status === 'COMPLETED') {
    throw new ConflictError('Onboarding already completed', 'OnboardingIntent')
  }

  const { intent: updatedIntent, profile } = await OnboardingProfileService.applyProfile(intent, payload)

  return successResponse({
    ...serializeIntent(updatedIntent),
    profile,
  })
})
