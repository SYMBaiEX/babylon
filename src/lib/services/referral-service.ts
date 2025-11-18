/**
 * Referral Service
 * 
 * @description Centralized service for managing user referral codes. Handles
 * referral code generation, uniqueness validation, and database updates. Ensures
 * each user has a unique referral code for tracking referrals.
 */

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

/**
 * Generate a referral code from a user ID
 * 
 * @description Generates a referral code using first 8 alphanumeric characters
 * of user ID plus 4 random characters. Format: USERPREFIX-RAND.
 * 
 * @param {string} userId - User ID to generate code from
 * @returns {string} Generated referral code
 * @private
 */
function generateReferralCode(userId: string): string {
  // Use first 8 chars of user ID (alphanumeric only) + random 4 chars
  const userPrefix = userId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `${userPrefix}-${random}`
}

/**
 * Get or create a referral code for a user
 * 
 * @description Gets existing referral code or generates a new unique one.
 * Ensures uniqueness by checking database and retrying up to 10 times if
 * collision occurs.
 * 
 * @param {string} userId - The user ID
 * @returns {Promise<string>} The user's referral code
 * @throws {Error} If user not found or unable to generate unique code after 10 attempts
 * 
 * @example
 * ```typescript
 * const code = await getOrCreateReferralCode(userId);
 * // Returns: "USER1234-ABCD"
 * ```
 */
export async function getOrCreateReferralCode(userId: string): Promise<string> {
  // Check if user already has a referral code
  let user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      referralCode: true,
    },
  })

  if (!user) {
    throw new Error(`User not found: ${userId}`)
  }

  // Return existing code if present
  if (user.referralCode) {
    return user.referralCode
  }

  // Generate a new unique referral code
  let code = generateReferralCode(userId)
  let attempts = 0
  const maxAttempts = 10

  // Ensure code is unique
  while (attempts < maxAttempts) {
    const existing = await prisma.user.findUnique({
      where: { referralCode: code },
    })

    if (!existing) {
      break
    }

    code = generateReferralCode(userId)
    attempts++
  }

  if (attempts >= maxAttempts) {
    throw new Error('Failed to generate unique referral code')
  }

  // Update user with new referral code
  user = await prisma.user.update({
    where: { id: userId },
    data: { referralCode: code },
    select: {
      id: true,
      referralCode: true,
    },
  })

  logger.info(
    `Generated referral code for user ${userId}: ${code}`,
    { userId, code },
    'ReferralService'
  )

  return code
}

