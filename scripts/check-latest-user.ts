import { prisma } from '../src/lib/database-service'

async function checkLatestUser() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    take: 3,
    select: {
      id: true,
      username: true,
      walletAddress: true,
      onChainRegistered: true,
      nftTokenId: true,
      createdAt: true,
    }
  })
  
  console.log('\n📋 Latest Users:')
  for (const user of users) {
    console.log(`\n   User ID: ${user.id}`)
    console.log(`   Username: ${user.username || 'N/A'}`)
    console.log(`   Wallet: ${user.walletAddress || 'N/A'}`)
    console.log(`   On-Chain: ${user.onChainRegistered ? '✅ Yes' : '❌ No'}`)
    console.log(`   Token ID: ${user.nftTokenId || 'N/A'}`)
    console.log(`   Created: ${user.createdAt}`)
  }
  console.log()
}

checkLatestUser().then(() => process.exit(0)).catch(console.error)
