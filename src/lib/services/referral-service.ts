/**
 * Referral Service
 * 
 * Centralized service for managing user referral codes.
 * Handles referral code generation, uniqueness validation, and database updates.
 */

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

/**
 * Generate a referral code from a user ID
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
 * @param userId - The user ID
 * @returns The user's referral code
 * @throws Error if unable to generate a unique code
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

