import { Prisma } from '@prisma/client'
import type { OnboardingIntent } from '@prisma/client'
import { prisma } from '@/lib/database-service'
import { ConflictError, NotFoundError } from '@/lib/errors'
import { OnboardingProfileSchema } from '@/lib/validation/schemas'
import type { OnboardingProfilePayload } from './types'

export interface ApplyProfileResult {
  user: {
    id: string
    username: string | null
    displayName: string | null
    bio: string | null
    profileImageUrl: string | null
    coverImageUrl: string | null
    profileComplete: boolean
    hasUsername: boolean
    hasBio: boolean
    hasProfileImage: boolean
  }
  intent: OnboardingIntent
  profile: OnboardingProfilePayload
}

export class OnboardingProfileService {
  static async applyProfile(intent: OnboardingIntent, rawPayload: unknown): Promise<ApplyProfileResult> {
    const parsed = OnboardingProfileSchema.parse(rawPayload)

    const username = parsed.username.trim().toLowerCase()
    const displayName = parsed.displayName.trim()
    const bio = parsed.bio?.trim() ?? ''
    const profileImageUrl = parsed.profileImageUrl ?? null
    const coverImageUrl = parsed.coverImageUrl ?? null
    const allowedStatuses: OnboardingIntent['status'][] = ['PENDING_PROFILE', 'PENDING_ONCHAIN', 'ONCHAIN_FAILED']

    return prisma.$transaction(async (tx) => {
      const currentIntent = await tx.onboardingIntent.findUnique({
        where: { id: intent.id },
        select: {
          id: true,
          userId: true,
          status: true,
          referralCode: true,
          payload: true,
          profileApplied: true,
        },
      })

      if (!currentIntent) {
        throw new NotFoundError('Onboarding intent', intent.id)
      }

      if (!allowedStatuses.includes(currentIntent.status)) {
        throw new ConflictError(
          `Onboarding profile cannot be updated while intent is ${currentIntent.status.toLowerCase()}`,
          'OnboardingIntent'
        )
      }

      const user = await tx.user.findUnique({
        where: { id: currentIntent.userId },
        select: {
          id: true,
          username: true,
        },
      })

      if (!user) {
        throw new NotFoundError('User', currentIntent.userId)
      }

      if (username !== user.username) {
        const existingUsername = await tx.user.findFirst({
          where: {
            username,
            id: { not: user.id },
          },
          select: { id: true },
        })

        if (existingUsername) {
          throw new ConflictError('Username already taken', 'User.username')
        }
      }

      const profilePayload: OnboardingProfilePayload = {
        username,
        displayName,
        bio: bio || undefined,
        profileImageUrl,
        coverImageUrl,
      }

      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: {
          username,
          displayName,
          bio,
          profileImageUrl,
          coverImageUrl,
          hasUsername: true,
          hasBio: bio.length > 0,
          hasProfileImage: !!profileImageUrl,
          profileComplete: !!username && bio.length > 0 && !!profileImageUrl,
        },
        select: {
          id: true,
          username: true,
          displayName: true,
          bio: true,
          profileImageUrl: true,
          coverImageUrl: true,
          profileComplete: true,
          hasUsername: true,
          hasBio: true,
          hasProfileImage: true,
        },
      })

      const payloadJson: Prisma.InputJsonValue = {
        profile: {
          username,
          displayName,
          bio: bio || null,
          profileImageUrl: profileImageUrl ?? null,
          coverImageUrl: coverImageUrl ?? null,
        },
      }

      const updateResult = await tx.onboardingIntent.updateMany({
        where: {
          id: currentIntent.id,
          status: { in: allowedStatuses },
        },
        data: {
          status: 'PENDING_ONCHAIN',
          payload: payloadJson,
          profileApplied: true,
          profileCompletedAt: new Date(),
          updatedAt: new Date(),
        },
      })

      if (updateResult.count === 0) {
        throw new ConflictError('Onboarding profile update raced with another transition', 'OnboardingIntent')
      }

      const updatedIntent = await tx.onboardingIntent.findUniqueOrThrow({
        where: { id: currentIntent.id },
      })

      return {
        user: updatedUser,
        intent: updatedIntent,
        profile: profilePayload,
      }
    })
  }
}
