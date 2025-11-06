import { prisma } from '@/lib/database-service'
import { NotFoundError } from '@/lib/errors'
import { Prisma } from '@prisma/client'

type SelectArg = Parameters<typeof prisma.user.findUnique>[0]['select']

export async function findUserByIdentifier<T extends SelectArg | undefined = undefined>(
  identifier: string,
  select?: T
) {
  const baseArgs = select ? { select } : undefined

  const byId = await prisma.user.findUnique({
    where: { id: identifier },
    ...baseArgs,
  } as any)

  if (byId) {
    return byId
  }

  try {
    return await prisma.user.findUnique({
      where: { privyId: identifier },
      ...baseArgs,
    } as any)
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2022' &&
      error.meta?.column === 'User.privyId'
    ) {
      return null
    }
    throw error
  }
}

export async function requireUserByIdentifier<T extends SelectArg | undefined = undefined>(
  identifier: string,
  select?: T
) {
  const user = await findUserByIdentifier(identifier, select)
  if (!user) {
    throw new NotFoundError('User', identifier)
  }
  return user
}
