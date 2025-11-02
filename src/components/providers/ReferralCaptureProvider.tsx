'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { logger } from '@/lib/logger'

/**
 * ReferralCaptureProvider
 * 
 * Captures the referral code from URL query parameter (?ref=CODE)
 * and stores it in sessionStorage for use during signup/onboarding.
 * 
 * This ensures the referral code persists across navigation until
 * the user completes signup.
 */
export function ReferralCaptureProvider() {
  const searchParams = useSearchParams()

  useEffect(() => {
    try {
      // Get referral code from URL
      const refCode = searchParams.get('ref')
      
      if (refCode) {
        // Store in sessionStorage (persists until browser tab is closed)
        sessionStorage.setItem('referralCode', refCode)
        
        logger.info(
          `Captured referral code: ${refCode}`,
          { code: refCode },
          'ReferralCaptureProvider'
        )
        
        // Also store timestamp to track how old the referral is
        sessionStorage.setItem('referralCodeTimestamp', Date.now().toString())
      }
      
      // Clean up expired referral codes (older than 30 days)
      const timestamp = sessionStorage.getItem('referralCodeTimestamp')
      if (timestamp) {
        const age = Date.now() - parseInt(timestamp)
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000
        
        if (age > thirtyDaysMs) {
          sessionStorage.removeItem('referralCode')
          sessionStorage.removeItem('referralCodeTimestamp')
          logger.info('Removed expired referral code', undefined, 'ReferralCaptureProvider')
        }
      }
    } catch (error) {
      logger.error('Error capturing referral code:', error, 'ReferralCaptureProvider')
    }
  }, [searchParams])

  // This component doesn't render anything
  return null
}

/**
 * Get the stored referral code
 * 
 * Call this function during signup/onboarding to retrieve the
 * referral code that was captured from the URL.
 */
export function getReferralCode(): string | null {
  try {
    return sessionStorage.getItem('referralCode')
  } catch {
    return null
  }
}

/**
 * Clear the stored referral code
 * 
 * Call this after successful signup to prevent reuse.
 */
export function clearReferralCode(): void {
  try {
    sessionStorage.removeItem('referralCode')
    sessionStorage.removeItem('referralCodeTimestamp')
  } catch (error) {
    // Silently handle errors - sessionStorage may not be available in some contexts
    logger.debug('Error clearing referral code:', error, 'ReferralCaptureProvider')
  }
}

