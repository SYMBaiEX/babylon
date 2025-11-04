/**
 * Check and Populate Trending Script
 * 
 * Checks the current state of the trending system and populates it if needed
 */

import { prisma } from '../src/lib/prisma'
import { logger } from '../src/lib/logger'
import { generateTagsForPosts } from '../src/lib/services/tag-generation-service'
import { storeTagsForPost } from '../src/lib/services/tag-storage-service'
import { calculateTrendingTags } from '../src/lib/services/trending-calculation-service'

async function checkAndPopulate() {
  console.log('🔍 Checking trending system state...\n')

  try {
    // 1. Check posts
    const postCount = await prisma.post.count()
    console.log(`📝 Posts: ${postCount}`)

    if (postCount === 0) {
      console.log('⚠️  No posts found. Create some posts first!')
      return
    }

    // 2. Check tags
    const tagCount = await prisma.tag.count()
    console.log(`🏷️  Tags: ${tagCount}`)

    // 3. Check post-tag associations
    const postTagCount = await prisma.postTag.count()
    console.log(`🔗 Post-Tag Links: ${postTagCount}`)

    // 4. Check trending calculations
    const trendingCount = await prisma.trendingTag.count()
    console.log(`📊 Trending Calculations: ${trendingCount}`)

    // Get posts without tags
    const postsWithoutTags = await prisma.post.findMany({
      where: {
        postTags: {
          none: {},
        },
      },
      take: 20, // Process first 20 for now
      orderBy: {
        timestamp: 'desc',
      },
      select: {
        id: true,
        content: true,
      },
    })

    console.log(`\n🔄 Posts without tags: ${postsWithoutTags.length}`)

    // 5. Generate tags for posts without them
    if (postsWithoutTags.length > 0) {
      console.log('\n📥 Generating tags for posts...')
      
      const tagMap = await generateTagsForPosts(postsWithoutTags)
      let tagged = 0

      for (const [postId, tags] of tagMap.entries()) {
        if (tags.length > 0) {
          await storeTagsForPost(postId, tags)
          tagged++
          console.log(`  ✓ Tagged post ${postId.slice(0, 8)}: ${tags.map(t => t.displayName).join(', ')}`)
        }
      }

      console.log(`\n✅ Tagged ${tagged} posts`)
    }

    // 6. Calculate trending
    console.log('\n🔥 Calculating trending tags...')
    await calculateTrendingTags()

    // 7. Check results
    const newTrendingCount = await prisma.trendingTag.count()
    console.log(`\n📊 New trending calculations: ${newTrendingCount}`)

    if (newTrendingCount > 0) {
      const topTrending = await prisma.trendingTag.findMany({
        take: 5,
        orderBy: {
          rank: 'asc',
        },
        include: {
          tag: true,
        },
      })

      console.log('\n🎯 Top 5 Trending:')
      topTrending.forEach(t => {
        console.log(`  ${t.rank}. ${t.tag.displayName} (${t.postCount} posts, score: ${t.score.toFixed(2)})`)
      })
    } else {
      console.log('\n⚠️  No trending topics calculated. This could mean:')
      console.log('  - Not enough posts (need at least 3 posts per tag)')
      console.log('  - Tags are too distributed')
      console.log('  - Posts are too old (older than 7 days)')
    }

    console.log('\n✅ Done!')
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Run the check
checkAndPopulate()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })


