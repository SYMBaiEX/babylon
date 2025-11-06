import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/database-service'
import { logger } from '@/lib/logger'
import { ConflictError, NotFoundError } from '@/lib/errors'
import type { OnboardingIntent, OnboardingStatus } from '@prisma/client'
import type { OnboardingProfilePayload } from './types'

export class OnboardingIntentService {
  static async getOrCreate(userId: string, referralCode?: string): Promise<OnboardingIntent> {
    const intent = await prisma.onboardingIntent.findUnique({ where: { userId } })
    if (intent) {
      // Update referral code if it was previously missing
      if (!intent.referralCode && referralCode) {
        return prisma.onboardingIntent.update({
          where: { id: intent.id },
          data: { referralCode },
        })
      }
      return intent
    }

    return prisma.onboardingIntent.create({
      data: {
        userId,
        referralCode,
        status: 'PENDING_PROFILE',
        profileApplied: false,
      },
    })
  }

  static async getById(intentId: string): Promise<OnboardingIntent | null> {
    return prisma.onboardingIntent.findUnique({ where: { id: intentId } })
  }

  static async requireOwnership(intentId: string, userId: string): Promise<OnboardingIntent> {
    const intent = await prisma.onboardingIntent.findUnique({ where: { id: intentId } })
    if (!intent || intent.userId !== userId) {
      throw new NotFoundError('Onboarding intent', intentId)
    }
    return intent
  }

  static async saveProfilePayload(intentId: string, payload: OnboardingProfilePayload): Promise<OnboardingIntent> {
    const profileJson: Prisma.InputJsonValue = {
      profile: {
        username: payload.username,
        displayName: payload.displayName,
        bio: payload.bio ?? null,
        profileImageUrl: payload.profileImageUrl ?? null,
        coverImageUrl: payload.coverImageUrl ?? null,
      },
    }

    return prisma.onboardingIntent.update({
      where: { id: intentId },
      data: {
        payload: profileJson,
        profileApplied: true,
        profileCompletedAt: new Date(),
        updatedAt: new Date(),
      },
    })
  }

  static async transition(
    intentId: string,
    status: OnboardingStatus,
    extra: Prisma.OnboardingIntentUpdateInput = {},
    options?: { allowFrom?: OnboardingStatus[] }
  ): Promise<OnboardingIntent> {
    logger.info('Onboarding intent status transition', { intentId, status }, 'OnboardingIntentService')
    const updateData: Prisma.OnboardingIntentUpdateInput = {
      status,
      ...extra,
      updatedAt: new Date(),
    }

    if (options?.allowFrom?.length) {
      const result = await prisma.onboardingIntent.updateMany({
        where: { id: intentId, status: { in: options.allowFrom } },
        data: updateData,
      })

      if (result.count === 0) {
        const current = await prisma.onboardingIntent.findUnique({ where: { id: intentId } })
        throw new ConflictError(
          `Onboarding intent state transition not permitted (current: ${current?.status ?? 'unknown'})`,
          'OnboardingIntent'
        )
      }
      const updated = await prisma.onboardingIntent.findUnique({ where: { id: intentId } })
      if (!updated) {
        throw new NotFoundError('Onboarding intent', intentId)
      }
      return updated
    }

    return prisma.onboardingIntent.update({
      where: { id: intentId },
      data: updateData,
    })
  }

  static async recordFailure(intentId: string, error: unknown): Promise<OnboardingIntent> {
    logger.error('Onboarding intent failure recorded', { intentId, error }, 'OnboardingIntentService')
    const serializedError = error instanceof Error
      ? { message: error.message, stack: error.stack }
      : error ?? null
    const result = await prisma.onboardingIntent.updateMany({
      where: { id: intentId, status: 'ONCHAIN_IN_PROGRESS' },
      data: {
        status: 'ONCHAIN_FAILED',
        lastError: serializedError as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
    })

    if (result.count === 0) {
      const current = await prisma.onboardingIntent.findUnique({ where: { id: intentId } })
      throw new ConflictError(
        `Cannot record failure when onboarding intent is not in progress (current: ${current?.status ?? 'unknown'})`,
        'OnboardingIntent'
      )
    }

    const updated = await prisma.onboardingIntent.findUnique({ where: { id: intentId } })
    if (!updated) {
      throw new NotFoundError('Onboarding intent', intentId)
    }
    return updated
  }
}
