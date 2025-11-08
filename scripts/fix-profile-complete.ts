import { prisma } from '../src/lib/database-service'

async function fixProfileComplete() {
  // Update all users who are registered but don't have profileComplete set
  const result = await prisma.user.updateMany({
    where: {
      onChainRegistered: true,
      profileComplete: false,
    },
    data: {
      profileComplete: true,
    }
  })

  console.log(`✅ Updated ${result.count} users to profileComplete: true`)
  
  // Show updated users
  const users = await prisma.user.findMany({
    where: { onChainRegistered: true },
    select: {
      id: true,
      username: true,
      onChainRegistered: true,
      profileComplete: true,
      nftTokenId: true,
    }
  })
  
  console.log('\n📋 Registered Users:')
  for (const user of users) {
    console.log(`   ${user.username || user.id}: profileComplete=${user.profileComplete}, tokenId=${user.nftTokenId}`)
  }
}

fixProfileComplete()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error)
    process.exit(1)
  })
