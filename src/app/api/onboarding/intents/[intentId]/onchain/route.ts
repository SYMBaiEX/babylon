import { Prisma } from '@prisma/client'
import { authenticate, successResponse } from '@/lib/api/auth-middleware'
import { ConflictError, BadRequestError } from '@/lib/errors'
import { withErrorHandling } from '@/lib/errors/error-handler'
import { OnboardingIntentService } from '@/lib/onboarding/intent-service'
import { processOnchainRegistration } from '@/lib/onboarding/onchain-service'
import { serializeIntent } from '@/lib/onboarding/types'
import { OnboardingIntentIdSchema } from '@/lib/validation/schemas'
import type { NextRequest } from 'next/server'

export const POST = withErrorHandling(async (
  request: NextRequest,
  context?: { params: Promise<{ intentId: string }> }
) => {
  const user = await authenticate(request)
  const params = await (context?.params || Promise.reject(new BadRequestError('Missing route context')))
  const { intentId } = OnboardingIntentIdSchema.parse(params)

  const intent = await OnboardingIntentService.requireOwnership(intentId, user.userId)

  if (intent.status === 'COMPLETED') {
    return successResponse(serializeIntent(intent))
  }

  if (!intent.profileApplied) {
    throw new ConflictError('Profile must be completed before starting on-chain registration', 'OnboardingIntent')
  }

  const payload = intent.payload && typeof intent.payload === 'object' ? intent.payload : null
  const profile = payload && 'profile' in payload ? (payload as Record<string, unknown>).profile as Record<string, unknown> | undefined : undefined

  if (!profile || typeof profile.username !== 'string' || typeof profile.displayName !== 'string') {
    throw new ConflictError('Onboarding intent does not contain a valid profile payload', 'OnboardingIntent')
  }

  const body = await request.json().catch(() => ({})) as { walletAddress?: string | null }
  const walletAddress = body.walletAddress ?? null

  const inProgressIntent = await OnboardingIntentService.transition(
    intent.id,
    'ONCHAIN_IN_PROGRESS',
    {
      onchainStartedAt: new Date(),
      lastError: Prisma.JsonNull,
    },
    { allowFrom: ['PENDING_ONCHAIN', 'ONCHAIN_FAILED'] }
  )

  try {
    const result = await processOnchainRegistration({
      user,
      walletAddress,
      username: profile.username,
      displayName: typeof profile.displayName === 'string' ? profile.displayName : undefined,
      bio: typeof profile.bio === 'string' ? profile.bio : undefined,
      profileImageUrl: typeof profile.profileImageUrl === 'string' ? profile.profileImageUrl : undefined,
      coverImageUrl: typeof profile.coverImageUrl === 'string' ? profile.coverImageUrl : undefined,
      referralCode: inProgressIntent.referralCode ?? undefined,
    })

    const completedIntent = await OnboardingIntentService.transition(
      inProgressIntent.id,
      'COMPLETED',
      {
        onchainCompletedAt: new Date(),
        lastError: Prisma.JsonNull,
      },
      { allowFrom: ['ONCHAIN_IN_PROGRESS'] }
    )

    return successResponse({
      ...serializeIntent(completedIntent),
      onchain: result,
    })
  } catch (error) {
    await OnboardingIntentService.recordFailure(inProgressIntent.id, error)
    throw error
  }
})
