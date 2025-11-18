/**
 * User Management Utilities
 * 
 * @description Utilities for ensuring users exist in the database and managing
 * canonical user IDs. Handles user creation and updates based on authentication
 * information.
 */

import { prisma } from '@/lib/prisma'
import type { AuthenticatedUser } from '@/lib/api/auth-middleware'
import type { Prisma } from '@prisma/client'

/**
 * Options for ensuring user exists
 * 
 * @description Configuration options for user creation/update.
 */
interface EnsureUserOptions {
  displayName?: string
  username?: string | null
  isActor?: boolean
}

const selectWithPrivyId = {
  id: true,
  privyId: true,
  username: true,
  displayName: true,
  walletAddress: true,
  isActor: true,
  profileImageUrl: true,
} as const

type CanonicalUserWithPrivy = Prisma.UserGetPayload<{ select: typeof selectWithPrivyId }>

type CanonicalUser = CanonicalUserWithPrivy

/**
 * Ensure user exists in database for authenticated user
 * 
 * @description Creates or updates a user record based on authenticated user
 * information. Uses upsert to handle both new and existing users. Updates
 * dbUserId on the authenticated user object.
 * 
 * @param {AuthenticatedUser} user - Authenticated user information
 * @param {EnsureUserOptions} [options={}] - Options for user creation/update
 * @returns {Promise<{user: CanonicalUser}>} Canonical user object
 * 
 * @example
 * ```typescript
 * const { user } = await ensureUserForAuth(authUser, {
 *   username: 'alice',
 *   displayName: 'Alice'
 * });
 * ```
 */
export async function ensureUserForAuth(
  user: AuthenticatedUser,
  options: EnsureUserOptions = {}
): Promise<{ user: CanonicalUser }> {
  const privyId = user.privyId ?? user.userId

  const updateData: Prisma.UserUpdateInput = {}

  if (user.walletAddress) {
    updateData.walletAddress = user.walletAddress
  }
  if (options.username !== undefined) {
    updateData.username = options.username
  }
  if (options.isActor !== undefined) {
    updateData.isActor = options.isActor
  }

  const createData: Prisma.UserCreateInput = {
    id: user.dbUserId ?? user.userId,
    privyId,
    isActor: options.isActor ?? false,
    updatedAt: new Date(),
  }

  if (user.walletAddress) {
    createData.walletAddress = user.walletAddress
  }
  if (options.username !== undefined) {
    createData.username = options.username ?? null
  }

  if (options.displayName !== undefined) {
    createData.displayName = options.displayName
    if (user.dbUserId) {
      const existing = await prisma.user.findUnique({
        where: { id: user.dbUserId },
        select: { displayName: true },
      })
      if (!existing?.displayName) {
        updateData.displayName = options.displayName
      }
    }
  }

  const canonicalUser: CanonicalUser = await prisma.user.upsert({
    where: { privyId },
    update: updateData,
    create: createData,
    select: selectWithPrivyId,
  })

  user.dbUserId = canonicalUser.id

  return { user: canonicalUser }
}

/**
 * Get canonical user ID
 * 
 * @description Returns the database user ID if available, otherwise falls
 * back to the authentication user ID. Ensures a consistent user ID format.
 * 
 * @param {Pick<AuthenticatedUser, 'userId' | 'dbUserId'>} user - User object with IDs
 * @returns {string} Canonical user ID
 * 
 * @example
 * ```typescript
 * const userId = getCanonicalUserId(authUser);
 * // Returns dbUserId if set, otherwise userId
 * ```
 */
export function getCanonicalUserId(user: Pick<AuthenticatedUser, 'userId' | 'dbUserId'>): string {
  return user.dbUserId ?? user.userId
}
