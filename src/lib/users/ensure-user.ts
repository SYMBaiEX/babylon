import { prisma } from '@/lib/database-service'
import type { AuthenticatedUser } from '@/lib/api/auth-middleware'
import type { Prisma, User } from '@prisma/client'

interface EnsureUserOptions {
  displayName?: string
  username?: string | null
  isActor?: boolean
}

type CanonicalUser = Pick<User, 'id' | 'privyId' | 'username' | 'displayName' | 'walletAddress' | 'isActor' | 'profileImageUrl'>

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

  const canonicalUser = await prisma.user.upsert({
    where: { privyId },
    update: updateData,
    create: createData,
    select: {
      id: true,
      privyId: true,
      username: true,
      displayName: true,
      walletAddress: true,
      isActor: true,
      profileImageUrl: true,
    },
  })

  user.dbUserId = canonicalUser.id

  return { user: canonicalUser }
}

export function getCanonicalUserId(user: Pick<AuthenticatedUser, 'userId' | 'dbUserId'>): string {
  return user.dbUserId ?? user.userId
}
