/**
 * Onboarding Service
 * Handles user signup flow: on-chain registration + points award
 *
 * NOTE: This service is used client-side, so it MUST NOT import or use PrismaClient
 * All database operations must go through API endpoints
 */

import { apiFetch } from '@/lib/api/fetch'

export interface OnboardingIntentResponse {
  intentId: string
  status: string
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

export interface OnboardingProfilePayload {
  username: string
  displayName: string
  bio?: string
  profileImageUrl?: string | null
  coverImageUrl?: string | null
}

export class OnboardingService {
  static async createIntent(referralCode?: string): Promise<OnboardingIntentResponse> {
    const response = await apiFetch('/api/onboarding/intents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referralCode }),
    })

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data?.error || 'Failed to initialise onboarding')
    }

    return data as OnboardingIntentResponse
  }

  static async getIntent(intentId: string): Promise<OnboardingIntentResponse> {
    const response = await apiFetch(`/api/onboarding/intents/${encodeURIComponent(intentId)}`)
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data?.error || 'Failed to fetch onboarding intent')
    }
    return data as OnboardingIntentResponse
  }

  static async submitProfile(intentId: string, payload: OnboardingProfilePayload): Promise<OnboardingIntentResponse> {
    const response = await apiFetch(`/api/onboarding/intents/${encodeURIComponent(intentId)}/profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data?.error || 'Failed to apply profile')
    }

    return data as OnboardingIntentResponse
  }

  static async startOnchain(intentId: string, options?: { walletAddress?: string | null }): Promise<OnboardingIntentResponse> {
    const response = await apiFetch(`/api/onboarding/intents/${encodeURIComponent(intentId)}/onchain`, {
      method: 'POST',
      headers: options ? { 'Content-Type': 'application/json' } : undefined,
      body: options ? JSON.stringify(options) : undefined,
    })

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data?.error || 'Failed to start on-chain registration')
    }

    return data as OnboardingIntentResponse
  }

  /**
   * Award points to a user
   */
  static async awardPoints(
    userId: string,
    amount: number,
    reason: string
  ): Promise<boolean> {
    const accessToken = typeof window !== 'undefined' ? window.__privyAccessToken : null;

    if (!accessToken) {
      console.warn('Cannot award points: User not authenticated');
      return false;
    }

    const response = await apiFetch('/api/users/points/award', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        amount,
        reason,
      }),
    })

    return response.ok
  }
}

// Extend window type for access token
declare global {
  interface Window {
    __privyAccessToken: string | null
  }
}
