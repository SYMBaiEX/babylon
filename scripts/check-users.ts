import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function checkUsers() {
  const totalUsers = await prisma.user.count()
  const waitlistedUsers = await prisma.user.count({ 
    where: { isWaitlistActive: true } 
  })
  const usersWithoutCodes = await prisma.user.count({
    where: {
      isWaitlistActive: true,
      referralCode: null
    }
  })

  console.log('Total users:', totalUsers)
  console.log('Waitlisted users:', waitlistedUsers)
  console.log('Users without invite codes:', usersWithoutCodes)

  if (waitlistedUsers > 0) {
    const sample = await prisma.user.findFirst({
      where: { isWaitlistActive: true },
      select: {
        id: true,
        username: true,
        referralCode: true,
        reputationPoints: true,
        invitePoints: true,
        referralCount: true
      }
    })
    console.log('\nSample waitlisted user:', JSON.stringify(sample, null, 2))
  }

  await prisma.$disconnect()
}

checkUsers()

