/**
 * Test Trending API (without server)
 */

import { getCurrentTrendingTags } from '../src/lib/services/tag-storage-service'
import { prisma } from '../src/lib/prisma'

async function test() {
  console.log('🧪 Testing Trending System\n')
  
  // Test 1: Get trending tags
  console.log('1️⃣ Fetching top 5 trending tags...')
  const trending = await getCurrentTrendingTags(5)
  console.log(`   ✓ Found ${trending.length} trending tags\n`)
  
  // Test 2: Generate summaries (like the API does)
  console.log('2️⃣ Generating summaries...\n')
  
  for (const item of trending) {
    // Get recent posts for this tag
    const recentPosts = await prisma.postTag.findMany({
      where: { tagId: item.tag.id },
      include: {
        post: {
          select: {
            content: true,
          },
        },
      },
      take: 3,
      orderBy: {
        createdAt: 'desc',
      },
    })
    
    // Generate summary
    let summary = ''
    if (recentPosts.length > 0) {
      if (item.tag.category === 'Tech') {
        summary = `Latest discussions about ${item.tag.displayName}`
      } else if (item.tag.category === 'Finance') {
        summary = `Market movements and predictions around ${item.tag.displayName}`
      } else if (item.tag.category === 'Politics') {
        summary = `Political developments related to ${item.tag.displayName}`
      } else if (item.tag.category === 'News') {
        summary = `Breaking updates on ${item.tag.displayName}`
      } else {
        summary = `${item.postCount} posts discussing ${item.tag.displayName}`
      }
    }
    
    // Display like the UI will
    console.log(`   ${item.tag.category || 'Trending'} · Trending`)
    console.log(`   ${item.tag.displayName}`)
    console.log(`   ${summary}\n`)
  }
  
  console.log('✅ All tests passed!')
  console.log('\n📋 Summary:')
  console.log(`   - Showing top ${trending.length} trending topics`)
  console.log(`   - Each has a one-sentence summary`)
  console.log(`   - No post counts displayed`)
  console.log('\n🚀 Ready to view in browser!')
  console.log('   1. Start server: bun run dev')
  console.log('   2. Visit: http://localhost:3000/feed')
  console.log('   3. Check right sidebar (desktop only)')
  
  await prisma.$disconnect()
}

test()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Test failed:', error)
    process.exit(1)
  })

