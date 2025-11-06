'use client'

import { useEffect, useState, useCallback } from 'react'
import { OnboardingStatus } from '@prisma/client'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/stores/authStore'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { OnboardingModal } from '@/components/onboarding/OnboardingModal'
import { OnboardingService, type OnboardingProfilePayload } from '@/lib/services/onboarding-service'
import { apiFetch } from '@/lib/api/fetch'
import { logger } from '@/lib/logger'

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const { authenticated, user, wallet } = useAuth()
  const { setUser } = useAuthStore()
  const { intent, setIntent, clearIntent } = useOnboardingStore()

  const [hasBootstrap, setHasBootstrap] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isPolling, setIsPolling] = useState(false)

  const shouldShowModal = Boolean(intent && intent.status !== 'COMPLETED')

  // Bootstrap or refresh onboarding intent when user changes
  useEffect(() => {
    let cancelled = false

    const bootstrapIntent = async () => {
      if (!authenticated || !user) {
        clearIntent()
        setHasBootstrap(false)
        return
      }

      try {
        const referralCode = sessionStorage.getItem('referralCode') || undefined
        const initialIntent = await OnboardingService.createIntent(referralCode)
        if (!cancelled) {
          setIntent(initialIntent)
          setHasBootstrap(true)
        }
      } catch (error) {
        logger.error('Failed to bootstrap onboarding intent', error, 'OnboardingProvider')
      }
    }

    if (!hasBootstrap && authenticated && user) {
      void bootstrapIntent()
    }

    return () => {
      cancelled = true
    }
  }, [authenticated, user, hasBootstrap, setIntent, clearIntent])

  // Poll in-progress intents to reflect backend status (placeholder for async on-chain)
  useEffect(() => {
    if (!intent) return
    if (intent.status !== 'ONCHAIN_IN_PROGRESS') {
      setIsPolling(false)
      return
    }
    if (isPolling) return

    setIsPolling(true)
    let cancelled = false

    const poll = async () => {
      while (!cancelled) {
        try {
          const latest = await OnboardingService.getIntent(intent.intentId)
          if (cancelled) return
          setIntent(latest)

          if (latest.status !== 'ONCHAIN_IN_PROGRESS') {
            setIsPolling(false)
            break
          }
        } catch (error) {
          logger.error('Polling onboarding intent failed', error, 'OnboardingProvider')
          setIsPolling(false)
          break
        }

        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    }

    void poll()

    return () => {
      cancelled = true
    }
  }, [intent, setIntent, isPolling])

  const refreshUserProfile = useCallback(async () => {
    if (!user) return
    try {
      const response = await apiFetch(`/api/users/${encodeURIComponent(user.id)}/profile`)
      const data = await response.json()
      if (response.ok && data.user) {
        setUser({
          id: data.user.id,
          walletAddress: data.user.walletAddress ?? undefined,
          displayName: data.user.displayName ?? user.id,
          email: undefined,
          username: data.user.username ?? undefined,
          bio: data.user.bio ?? undefined,
          profileImageUrl: data.user.profileImageUrl ?? undefined,
          coverImageUrl: data.user.coverImageUrl ?? undefined,
          profileComplete: data.user.profileComplete ?? false,
          nftTokenId: data.user.nftTokenId ?? null,
          reputationPoints: data.user.reputationPoints ?? undefined,
          referralCount: data.user.referralCount ?? undefined,
          referralCode: data.user.referralCode ?? undefined,
          hasFarcaster: data.user.hasFarcaster ?? undefined,
          hasTwitter: data.user.hasTwitter ?? undefined,
          farcasterUsername: data.user.farcasterUsername ?? undefined,
          twitterUsername: data.user.twitterUsername ?? undefined,
          showTwitterPublic: data.user.showTwitterPublic ?? undefined,
          showFarcasterPublic: data.user.showFarcasterPublic ?? undefined,
          showWalletPublic: data.user.showWalletPublic ?? undefined,
          usernameChangedAt: data.user.usernameChangedAt ?? undefined,
          stats: data.user.stats,
          createdAt: data.user.createdAt,
        })
      }
    } catch (error) {
      logger.error('Failed to refresh user profile after onboarding', error, 'OnboardingProvider')
    }
  }, [user, setUser])

  const handleProfileSubmit = useCallback(async (payload: OnboardingProfilePayload) => {
    if (!intent || !user) return
    if (!wallet?.address) {
      setSubmitError('Wallet connection required to complete onboarding.')
      return
    }

    setIsSubmitting(true)
    setSubmitError(null)

    const intentId = intent.intentId

    try {
      const updatedIntent = await OnboardingService.submitProfile(intentId, payload)
      setIntent(updatedIntent)

      const finalIntent = await OnboardingService.startOnchain(updatedIntent.intentId, {
        walletAddress: wallet.address,
      })

      setIntent(finalIntent)

      if (finalIntent.status === OnboardingStatus.COMPLETED) {
        sessionStorage.removeItem('referralCode')
        sessionStorage.removeItem('referralCodeTimestamp')
        await refreshUserProfile()
      }

      logger.info('Onboarding profile submitted', { userId: user.id }, 'OnboardingProvider')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to submit onboarding profile'
      setSubmitError(message)
      logger.error(message, error, 'OnboardingProvider')
      try {
        const latestIntent = await OnboardingService.getIntent(intentId)
        setIntent(latestIntent)
      } catch (refreshError) {
        logger.error(
          'Failed to refresh onboarding intent after profile submission error',
          refreshError,
          'OnboardingProvider'
        )
      }
    } finally {
      setIsSubmitting(false)
    }
  }, [intent, user, wallet, setIntent, refreshUserProfile])

  const handleRetryOnchain = useCallback(async () => {
    if (!intent) return
    if (!wallet?.address && !user?.isActor) {
      setSubmitError('Wallet connection required to restart on-chain onboarding.')
      return
    }
    setIsSubmitting(true)
    setSubmitError(null)
    const intentId = intent.intentId
    try {
      const latest = await OnboardingService.startOnchain(intentId, {
        walletAddress: wallet?.address,
      })
      setIntent(latest)
      await refreshUserProfile()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to restart on-chain onboarding'
      setSubmitError(message)
      logger.error(message, error, 'OnboardingProvider')
      try {
        const latestIntent = await OnboardingService.getIntent(intentId)
        setIntent(latestIntent)
      } catch (refreshError) {
        logger.error(
          'Failed to refresh onboarding intent after retry error',
          refreshError,
          'OnboardingProvider'
        )
      }
    } finally {
      setIsSubmitting(false)
    }
  }, [intent, wallet, user, setIntent, refreshUserProfile])

  const handleClose = useCallback(() => {
    if (!intent) return
    if (intent.status === 'COMPLETED') {
      clearIntent()
    }
  }, [intent, clearIntent])

  return (
    <>
      {children}
      {shouldShowModal && intent && (
        <OnboardingModal
          isOpen
          status={intent.status as OnboardingStatus}
          intent={intent}
          isSubmitting={isSubmitting}
          error={submitError}
          onSubmitProfile={handleProfileSubmit}
          onStartOnchain={handleRetryOnchain}
          onClose={handleClose}
        />
      )}
    </>
  )
}
