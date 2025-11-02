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
      try {
        // Check if user exists in database and has username
        const token = typeof window !== 'undefined' ? window.__privyAccessToken : null
        if (!token) return

        const response = await fetch(`/api/users/${user.id}/is-new`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        })

        if (!response.ok) return

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
      } catch (error) {
        logger.warn('Error checking username:', error, 'OnboardingProvider')
        setHasCheckedOnboarding(true)
      }
    }

    checkUsernameAndOnboarding()
  }, [authenticated, user, wallet, storeUser, hasCheckedOnboarding])

  const handleOnboardingComplete = async (username: string) => {
    if (!user || !wallet?.address) return

    setShowOnboardingModal(false)

    try {
      // Get referral code from sessionStorage
      let referralCode: string | null = null
      try {
        referralCode = sessionStorage.getItem('referralCode')
      } catch (error) {
        logger.warn('Could not access referral code', error, 'OnboardingProvider')
      }

      // Complete onboarding with the username
      const result = await OnboardingService.completeOnboarding(
        user.id,
        wallet.address,
        username,
        undefined, // bio
        referralCode || undefined
      )

      if (result.success) {
        logger.info('Onboarding complete with username:', username, 'OnboardingProvider')
        // Reload user profile to get updated username
        if (typeof window !== 'undefined') {
          window.location.reload()
        }
      } else {
        logger.error('Onboarding failed:', result.error, 'OnboardingProvider')
      }
    } catch (error) {
      logger.error('Error completing onboarding:', error, 'OnboardingProvider')
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

