/**
 * Onboarding Service
 * Handles user signup flow: on-chain registration + points award
 * 
 * NOTE: This service is used client-side, so it MUST NOT import or use PrismaClient
 * All database operations must go through API endpoints
 */


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
    _userId: string,
    walletAddress: string,
    username?: string,
    bio?: string,
    referralCode?: string,
    displayName?: string,
    profileImageUrl?: string,
    coverImageUrl?: string
  ): Promise<OnboardingResult> {
    const accessToken = typeof window !== 'undefined' ? window.__privyAccessToken : null;

    if (!accessToken) {
      return { 
        success: false, 
        error: 'Not authenticated. Please sign in first.' 
      };
    }

    const response = await fetch('/api/auth/onboard', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        walletAddress,
        username: username,
        bio: bio || '',
        displayName: displayName || username,
        profileImageUrl: profileImageUrl,
        coverImageUrl: coverImageUrl,
        referralCode: referralCode || undefined,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      if (data.tokenId) {
        return {
          success: true,
          tokenId: data.tokenId,
          points: 1000,
        }
      }
      return { success: false, error: data.error }
    }

    return {
      success: true,
      tokenId: data.tokenId,
      points: 1000,
      transactionHash: data.txHash,
    }
  }

  /**
   * Check if user is already onboarded
   * MUST be called from client-side only - uses API endpoint
   */
  static async checkOnboardingStatus(_userId: string): Promise<{
    isOnboarded: boolean
    tokenId?: number
  }> {
    const accessToken = typeof window !== 'undefined' ? window.__privyAccessToken : null;

    if (!accessToken) {
      return { isOnboarded: false };
    }

    const response = await fetch('/api/auth/onboard', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    })

    const data = await response.json()

    if (response.ok && data.isRegistered) {
      return {
        isOnboarded: true,
        tokenId: data.tokenId,
      }
    }

    return { isOnboarded: false }
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
  }
}

// Extend window type for access token
declare global {
  interface Window {
    __privyAccessToken: string | null
  }
}
