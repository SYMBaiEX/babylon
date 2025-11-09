import { prisma } from '../src/lib/database-service'

async function checkPostTiming() {
  const oldest = await prisma.post.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true, authorId: true }
  })
  
  const newest = await prisma.post.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, authorId: true }
  })
  
  const total = await prisma.post.count()
  
  console.log('📊 Post Timeline:')
  console.log(`   Total: ${total} posts`)
  console.log(`   Oldest: ${oldest?.createdAt} by ${oldest?.authorId}`)
  console.log(`   Newest: ${newest?.createdAt} by ${newest?.authorId}`)
  
  if (oldest && newest) {
    const duration = newest.createdAt.getTime() - oldest.createdAt.getTime()
    const minutes = Math.floor(duration / 60000)
    console.log(`   Duration: ${minutes} minutes`)
  }
}

checkPostTiming().then(() => process.exit(0)).catch(console.error)
