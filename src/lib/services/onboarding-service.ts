/**
 * Onboarding Service
 * Handles user signup flow: on-chain registration + points award
 * 
 * NOTE: This service is used client-side, so it MUST NOT import or use PrismaClient
 * All database operations must go through API endpoints
 */

import { logger } from '@/lib/logger';

interface OnboardingResult {
  success: boolean
  tokenId?: number
  points?: number
  transactionHash?: string
  error?: string
}

export class OnboardingService {
  /**
   * Complete onboarding for a new user
   * - Register on-chain via ERC-8004
   * - Award 1,000 initial points
   * - Update user profile
   * - Process referral code if provided
   */
  static async completeOnboarding(
    userId: string,
    walletAddress: string,
    username?: string,
    bio?: string,
    referralCode?: string
  ): Promise<OnboardingResult> {
    try {
      // Get access token from global state
      const accessToken = typeof window !== 'undefined' ? window.__privyAccessToken : null
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' }
      }

      // Call on-chain registration API
      const response = await fetch('/api/auth/onboard', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress,
          username: username || `user_${userId.slice(0, 8)}`,
          bio: bio || '',
          referralCode: referralCode || undefined, // Include referral code if provided
        }),
      })

      // Check if response is JSON before parsing
      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text()
        logger.warn('Non-JSON response from onboard endpoint:', text.substring(0, 100), 'OnboardingService')
        return { success: false, error: 'Invalid response from server' }
      }

      const data = await response.json()

      if (!response.ok) {
        // If already registered, that's OK
        if (data.tokenId) {
          return {
            success: true,
            tokenId: data.tokenId,
            points: 1000, // Assume already awarded
          }
        }
        return { success: false, error: data.error || 'Onboarding failed' }
      }

      return {
        success: true,
        tokenId: data.tokenId,
        points: 1000,
        transactionHash: data.txHash,
      }
    } catch (error) {
      // Better error logging - extract error details properly
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      const errorDetails = {
        message: errorMessage,
        stack: errorStack,
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
        } : error,
        userId,
      };
      logger.error('Onboarding error:', errorDetails, 'OnboardingService')
      return {
        success: false,
        error: errorMessage,
      }
    }
  }

  /**
   * Check if user is already onboarded
   * MUST be called from client-side only - uses API endpoint
   */
  static async checkOnboardingStatus(userId: string): Promise<{
    isOnboarded: boolean
    tokenId?: number
  }> {
    try {
      // Get access token from browser
      const accessToken = typeof window !== 'undefined' ? window.__privyAccessToken : null
      if (!accessToken) {
        return { isOnboarded: false }
      }

      // Call API endpoint to check status (Prisma runs server-side in the API)
      const response = await fetch('/api/auth/onboard', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      })

      // Check if response is JSON before parsing
      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        logger.warn('Non-JSON response from onboard status check', undefined, 'OnboardingService')
        return { isOnboarded: false }
      }

      const data = await response.json()

      if (response.ok && data.isRegistered) {
        return {
          isOnboarded: true,
          tokenId: data.tokenId,
        }
      }

      return { isOnboarded: false }
    } catch (error) {
      // Better error logging - extract error details properly
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      const errorDetails = {
        message: errorMessage,
        stack: errorStack,
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
        } : error,
        userId,
      };
      logger.error('Error checking onboarding status:', errorDetails, 'OnboardingService')
      return { isOnboarded: false }
    }
  }

  /**
   * Award points to a user
   */
  static async awardPoints(
    userId: string,
    amount: number,
    reason: string
  ): Promise<boolean> {
    try {
      const accessToken = typeof window !== 'undefined' ? window.__privyAccessToken : null
      if (!accessToken) {
        return false
      }

      const response = await fetch('/api/users/points/award', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          amount,
          reason,
        }),
      })

      return response.ok
    } catch (error) {
      // Better error logging - extract error details properly
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      const errorDetails = {
        message: errorMessage,
        stack: errorStack,
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
        } : error,
        userId,
        amount,
        reason,
      };
      logger.error('Error awarding points:', errorDetails, 'OnboardingService')
      return false
    }
  }
}

// Extend window type for access token
declare global {
  interface Window {
    __privyAccessToken: string | null
  }
}
