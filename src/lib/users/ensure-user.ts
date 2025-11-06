import { prisma } from '@/lib/database-service'
import type { AuthenticatedUser } from '@/lib/api/auth-middleware'
import type { Prisma } from '@prisma/client'

interface EnsureUserOptions {
  displayName?: string
  username?: string | null
  isActor?: boolean
}

export async function ensureUserForAuth(user: AuthenticatedUser, options: EnsureUserOptions = {}): Promise<void> {
  const privyId = user.privyId ?? user.userId

  const updateData: Prisma.UserUpdateInput = {}

  if (user.walletAddress) {
    updateData.walletAddress = user.walletAddress
  }
  if (options.username !== undefined) {
    updateData.username = options.username
  }

  const createData: Prisma.UserCreateInput = {
    id: user.dbUserId ?? user.userId,
    privyId,
    isActor: options.isActor ?? false,
  }

  if (user.walletAddress) {
    createData.walletAddress = user.walletAddress
  }
  if (options.displayName) {
    createData.displayName = options.displayName
  }
  if (options.username !== undefined) {
    createData.username = options.username ?? null
  }

  await prisma.user.upsert({
    where: { privyId },
    update: updateData,
    create: createData,
  })
}
