/**
 * Regenerate All Data with Real LLM
 * 
 * Clears sample data and regenerates everything using real LLM API
 */

import { prisma } from '../src/lib/prisma'
import { generateTagsForPosts } from '../src/lib/services/tag-generation-service'
import { storeTagsForPost } from '../src/lib/services/tag-storage-service'
import { calculateTrendingTags } from '../src/lib/services/trending-calculation-service'

async function regenerate() {
  console.log('🔄 Regenerating All Data with Real LLM\n')
  
  try {
    // Step 1: Clear existing sample data
    console.log('1️⃣ Clearing existing tag data...')
    await prisma.trendingTag.deleteMany({})
    await prisma.postTag.deleteMany({})
    await prisma.tag.deleteMany({})
    console.log('   ✓ Cleared sample data\n')
    
    // Step 2: Get all posts without tags
    console.log('2️⃣ Finding posts without tags...')
    const postsWithoutTags = await prisma.post.findMany({
      where: {
        postTags: {
          none: {},
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: 50, // Process 50 most recent posts
      select: {
        id: true,
        content: true,
      },
    })
    
    console.log(`   ✓ Found ${postsWithoutTags.length} posts\n`)
    
    if (postsWithoutTags.length === 0) {
      console.log('⚠️  No posts to process. Create some posts first!')
      return
    }
    
    // Step 3: Generate tags with real LLM
    console.log('3️⃣ Generating tags with real LLM (Groq)...')
    console.log('   This may take a minute...\n')
    
    const tagMap = await generateTagsForPosts(postsWithoutTags)
    
    let tagged = 0
    let totalTags = 0
    
    for (const [postId, tags] of tagMap.entries()) {
      if (tags.length > 0) {
        await storeTagsForPost(postId, tags)
        tagged++
        totalTags += tags.length
        const post = postsWithoutTags.find(p => p.id === postId)
        console.log(`   ✓ Post ${postId.slice(0, 8)}: ${tags.map(t => t.displayName).join(', ')}`)
      }
    }
    
    console.log(`\n   ✓ Tagged ${tagged} posts with ${totalTags} unique tags\n`)
    
    // Step 4: Calculate trending with real data
    console.log('4️⃣ Calculating trending scores...')
    await calculateTrendingTags()
    console.log('   ✓ Trending calculated\n')
    
    // Step 5: Show results
    const topTrending = await prisma.trendingTag.findMany({
      take: 5,
      orderBy: { rank: 'asc' },
      include: { tag: true },
    })
    
    console.log('🎯 Top 5 Trending (with real LLM data):\n')
    topTrending.forEach(t => {
      console.log(`   ${t.rank}. ${t.tag.displayName}`)
      console.log(`      Category: ${t.tag.category || 'General'}`)
      console.log(`      Posts: ${t.postCount}`)
      console.log(`      Score: ${t.score.toFixed(2)}\n`)
    })
    
    console.log('✅ Regeneration Complete!')
    console.log('\n🚀 Next Steps:')
    console.log('   1. Restart dev server: bun run dev')
    console.log('   2. Visit: http://localhost:3000/feed')
    console.log('   3. Check trending sidebar with real LLM summaries!')
    
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

regenerate()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
  })

