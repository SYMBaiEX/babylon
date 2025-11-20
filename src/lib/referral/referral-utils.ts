/**
 * Referral Utility Functions
 * 
 * Centralized utilities for generating and handling referral URLs.
 */

/**
 * Get the base URL for the application
 * Uses window.location.origin in browser, falls back to env variable or default
 */
export function getBaseUrl(): string {
  if (typeof window !== 'undefined') {
    return window.location.origin
  }
  return process.env.NEXT_PUBLIC_APP_URL || 'https://babylon.market'
}

/**
 * Generate a shareable referral URL for a user
 * 
 * @param userId - The user's ID (DID format)
 * @returns Full shareable referral URL (e.g., https://babylon.market/share/referral/{userId})
 * 
 * @example
 * ```typescript
 * const url = getReferralUrl('did:privy:123')
 * // Returns: "https://babylon.market/share/referral/did:privy:123"
 * ```
 */
export function getReferralUrl(userId: string): string {
  const baseUrl = getBaseUrl()
  return `${baseUrl}/share/referral/${encodeURIComponent(userId)}`
}

/**
 * Generate a short referral URL with ref code
 * 
 * @param referralCode - The user's referral code
 * @returns Short referral URL with ref parameter (e.g., https://babylon.market?ref=CODE)
 * 
 * @example
 * ```typescript
 * const url = getShortReferralUrl('ai16z-ABC123')
 * // Returns: "https://babylon.market?ref=ai16z-ABC123"
 * ```
 * 
 * @deprecated Use getReferralUrl instead for better OG tag support and social sharing
 */
export function getShortReferralUrl(referralCode: string): string {
  const baseUrl = getBaseUrl()
  return `${baseUrl}?ref=${encodeURIComponent(referralCode)}`
}

/**
 * Format referral URL for display (truncated)
 * 
 * @param userId - The user's ID
 * @param maxLength - Maximum length of user ID to display (default: 20)
 * @returns Display-friendly referral URL
 * 
 * @example
 * ```typescript
 * const display = getDisplayReferralUrl('did:privy:cmi08xz3300ifjp0cj6le151v')
 * // Returns: "localhost:3000/share/referral/did:privy:cmi08xz33..."
 * ```
 */
export function getDisplayReferralUrl(userId: string, maxLength: number = 20): string {
  const host = typeof window !== 'undefined' ? window.location.host : 'babylon.market'
  const truncatedId = userId.length > maxLength ? `${userId.slice(0, maxLength)}...` : userId
  return `${host}/share/referral/${truncatedId}`
}

/**
 * Generate referral share text for social media
 * 
 * @param userId - The user's ID
 * @param customMessage - Optional custom message (default: "Join me on Babylon! 🎮")
 * @returns Formatted text with referral URL for sharing
 * 
 * @example
 * ```typescript
 * const text = getReferralShareText('did:privy:123')
 * // Returns: "Join me on Babylon! 🎮\n\nhttps://babylon.market/share/referral/did:privy:123"
 * ```
 */
export function getReferralShareText(userId: string, customMessage?: string): string {
  const message = customMessage || 'Join me on Babylon! 🎮'
  const url = getReferralUrl(userId)
  return `${message}\n\n${url}`
}

