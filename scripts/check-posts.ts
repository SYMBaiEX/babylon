import { prisma } from '../src/lib/database-service'

async function checkPosts() {
  const postCount = await prisma.post.count()
  console.log(`📊 Total posts in database: ${postCount}`)
  
  if (postCount > 0) {
    const sample = await prisma.post.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        content: true,
        authorId: true,
        createdAt: true,
      }
    })
    
    console.log('\n📝 Sample posts:')
    for (const post of sample) {
      console.log(`   ${post.id}: "${post.content.substring(0, 50)}..." by ${post.authorId}`)
    }
  }
}

checkPosts().then(() => process.exit(0)).catch(console.error)
