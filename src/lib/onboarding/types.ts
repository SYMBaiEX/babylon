import type { OnboardingIntent, OnboardingStatus } from '@prisma/client'

export interface OnboardingProfilePayload {
  username: string
  displayName?: string
  bio?: string
  profileImageUrl?: string | null
  coverImageUrl?: string | null
}

export interface OnboardingPayload {
  profile?: OnboardingProfilePayload
  [key: string]: unknown
}

export interface SerializedOnboardingIntent {
  intentId: string
  status: OnboardingStatus
  referralCode?: string | null
  profileApplied: boolean
  timestamps: {
    createdAt: string
    updatedAt: string
    profileCompletedAt?: string | null
    onchainStartedAt?: string | null
    onchainCompletedAt?: string | null
  }
  profile?: OnboardingProfilePayload | null
  lastError?: unknown
}

export const parsePayload = (payload: OnboardingIntent['payload']): OnboardingPayload => {
  if (!payload) return {}
  if (typeof payload === 'object') return payload as OnboardingPayload
  try {
    return JSON.parse(String(payload)) as OnboardingPayload
  } catch {
    return {}
  }
}

export const serializeIntent = (intent: OnboardingIntent): SerializedOnboardingIntent => {
  const parsed = parsePayload(intent.payload)
  return {
    intentId: intent.id,
    status: intent.status,
    referralCode: intent.referralCode,
    profileApplied: intent.profileApplied,
    timestamps: {
      createdAt: intent.createdAt.toISOString(),
      updatedAt: intent.updatedAt.toISOString(),
      profileCompletedAt: intent.profileCompletedAt?.toISOString() ?? null,
      onchainStartedAt: intent.onchainStartedAt?.toISOString() ?? null,
      onchainCompletedAt: intent.onchainCompletedAt?.toISOString() ?? null,
    },
    profile: (parsed.profile ?? null) as OnboardingProfilePayload | null,
    lastError: intent.lastError ?? undefined,
  }
}
