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
    return window.location.origin;
  }
  return process.env.NEXT_PUBLIC_APP_URL || 'https://babylon.market';
}

/**
 * Generate a shareable referral URL for a user
 *
 * @param usernameOrCode - The user's username or referral code
 * @returns Full shareable referral URL (e.g., https://babylon.market?ref=babylon)
 *
 * @example
 * ```typescript
 * const url = getReferralUrl('babylon')
 * // Returns: "https://babylon.market?ref=babylon"
 * ```
 */
export function getReferralUrl(usernameOrCode: string): string {
  const baseUrl = getBaseUrl();
  return `${baseUrl}?ref=${encodeURIComponent(usernameOrCode)}`;
}

/**
 * Generate a short referral URL with ref code
 *
 * @param referralCode - The user's referral code
 * @returns Short referral URL with ref parameter (e.g., https://babylon.market?ref=CODE)
 *
 * @example
 * ```typescript
 * const url = getShortReferralUrl('babylon-ABC123')
 * // Returns: "https://babylon.market?ref=babylon-ABC123"
 * ```
 *
 * @deprecated Use getReferralUrl instead for better OG tag support and social sharing
 */
export function getShortReferralUrl(referralCode: string): string {
  const baseUrl = getBaseUrl();
  return `${baseUrl}?ref=${encodeURIComponent(referralCode)}`;
}

/**
 * Format referral URL for display (truncated)
 *
 * @param usernameOrCode - The user's username or referral code
 * @returns Display-friendly referral URL
 *
 * @example
 * ```typescript
 * const display = getDisplayReferralUrl('babylon')
 * // Returns: "localhost:3000?ref=babylon"
 * ```
 */
export function getDisplayReferralUrl(usernameOrCode: string): string {
  const host =
    typeof window !== 'undefined' ? window.location.host : 'babylon.market';
  return `${host}?ref=${usernameOrCode}`;
}

/**
 * Generate referral share text for social media
 *
 * @param usernameOrCode - The user's username or referral code
 * @param customMessage - Optional custom message (default: "Join me on Babylon! 🎮")
 * @returns Formatted text with referral URL for sharing
 *
 * @example
 * ```typescript
 * const text = getReferralShareText('babylon')
 * // Returns: "Join me on Babylon! 🎮\n\nhttps://babylon.market?ref=babylon"
 * ```
 */
export function getReferralShareText(
  usernameOrCode: string,
  customMessage?: string
): string {
  const message =
    customMessage ||
    'Join me in Babylon, a real-time simulation where humans and AI agents battle across prediction markets, form alliances, and shape outcomes—together.';
  const url = getReferralUrl(usernameOrCode);
  return `${message}\n\n${url}`;
}

