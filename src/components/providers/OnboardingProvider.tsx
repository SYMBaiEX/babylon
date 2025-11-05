'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/stores/authStore'
import { OnboardingModal } from '@/components/onboarding/OnboardingModal'
import { OnboardingService } from '@/lib/services/onboarding-service'
import { logger } from '@/lib/logger'

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const { authenticated, user, wallet } = useAuth()
  const { user: storeUser } = useAuthStore()
  const [showOnboardingModal, setShowOnboardingModal] = useState(false)
  const [hasCheckedOnboarding, setHasCheckedOnboarding] = useState(false)

  useEffect(() => {
    if (!authenticated || !user || hasCheckedOnboarding) return

    const checkUsernameAndOnboarding = async () => {
      // Check if user exists in database and has username
      const token = typeof window !== 'undefined' ? window.__privyAccessToken : null
      if (!token) return

      const response = await fetch(`/api/users/${encodeURIComponent(user.id)}/is-new`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        setHasCheckedOnboarding(true)
        return
      }

      const data = await response.json()

      // If user doesn't have a username, show onboarding modal
      if (data.needsSetup && !data.hasUsername && !storeUser?.username) {
        // Wait for wallet if needed
        if (!wallet?.address) {
          // Retry after wallet is available
          setTimeout(() => {
            if (wallet?.address) {
              setShowOnboardingModal(true)
              setHasCheckedOnboarding(true)
            }
          }, 2000)
          return
        }
        setShowOnboardingModal(true)
        setHasCheckedOnboarding(true)
      } else {
        setHasCheckedOnboarding(true)
      }
    }

    checkUsernameAndOnboarding()
  }, [authenticated, user, wallet, storeUser, hasCheckedOnboarding])

  const handleOnboardingComplete = async (data: {
    username: string
    displayName: string
    bio: string
    profileImageUrl?: string
    coverImageUrl?: string
  }) => {
    setShowOnboardingModal(false)

    const referralCode = sessionStorage.getItem('referralCode')

    const result = await OnboardingService.completeOnboarding(
      user!.id,
      wallet!.address,
      data.username,
      data.bio,
      referralCode || undefined,
      data.displayName,
      data.profileImageUrl,
      data.coverImageUrl
    )

    if (result.success) {
      logger.info('Onboarding complete:', { username: data.username, displayName: data.displayName }, 'OnboardingProvider')
      if (typeof window !== 'undefined') {
        window.location.reload()
      }
    }
  }

  const handleOnboardingSkip = () => {
    // Skip will still call handleOnboardingComplete with generated username
    // This is handled in the modal itself
  }

  return (
    <>
      {children}
      {showOnboardingModal && (
        <OnboardingModal
          isOpen={showOnboardingModal}
          onComplete={handleOnboardingComplete}
          onSkip={handleOnboardingSkip}
        />
      )}
    </>
  )
}








