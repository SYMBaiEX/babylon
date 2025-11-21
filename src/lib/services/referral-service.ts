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
 * Get or create a referral code for a user
 * 
 * @description Gets existing referral code or sets it to the user's username.
 * Since username is required during signup, we always use username as the referral code.
 * Ensures uniqueness by checking database and throwing error if username is taken as referral code.
 * 
 * @param {string} userId - The user ID
 * @returns {Promise<string>} The user's referral code (their username)
 * @throws {Error} If user not found or username is missing
 * 
 * @example
 * ```typescript
 * const code = await getOrCreateReferralCode(userId);
 * // Returns: "cidsociety"
 * ```
 */
export async function getOrCreateReferralCode(userId: string): Promise<string> {
  // Get user with username and referral code
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      referralCode: true,
    },
  })

  if (!user) {
    throw new Error(`User not found: ${userId}`)
  }

  // Username is required during signup, so it should always exist
  if (!user.username) {
    throw new Error(`User ${userId} does not have a username. Username is required for referral codes.`)
  }

  // Check if username is already used as a referral code by another user
  const existingUserWithCode = await prisma.user.findFirst({
    where: {
      referralCode: user.username,
      id: { not: userId }, // Exclude current user
    },
  })

  if (existingUserWithCode) {
    throw new Error(`Username "${user.username}" is already used as a referral code by another user`)
  }

  // Update referral code to username if it's different
  if (user.referralCode !== user.username) {
    await prisma.user.update({
      where: { id: userId },
      data: { referralCode: user.username },
    })
    logger.info(
      `Updated referral code to username for user ${userId}: ${user.username}`,
      { userId, code: user.username },
      'ReferralService'
    )
  }

  return user.username
}

