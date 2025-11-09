import { prisma } from '../src/lib/database-service'

async function testIsNewLogic() {
  const users = await prisma.user.findMany({
    where: { onChainRegistered: true },
    select: {
      id: true,
      username: true,
      profileComplete: true,
      hasUsername: true,
      hasBio: true,
      onChainRegistered: true,
      nftTokenId: true,
    }
  })

  console.log('🧪 Testing is-new logic:\n')
  
  for (const user of users) {
    // Replicate the logic from /api/users/[userId]/is-new
    const needsSetup = !user.profileComplete && (
      !user.username ||
      !user.hasUsername ||
      !user.hasBio ||
      !user.onChainRegistered
    )
    
    console.log(`User: ${user.username || user.id}`)
    console.log(`  profileComplete: ${user.profileComplete}`)
    console.log(`  hasUsername: ${user.hasUsername}`)
    console.log(`  onChainRegistered: ${user.onChainRegistered}`)
    console.log(`  needsSetup: ${needsSetup} ${needsSetup ? '❌ (will show onboarding)' : '✅ (skip onboarding)'}`)
    console.log()
  }
}

testIsNewLogic()
  .then(() => process.exit(0))
  .catch(console.error)
