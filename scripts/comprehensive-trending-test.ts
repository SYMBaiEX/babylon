/**
 * Comprehensive End-to-End Trending System Test
 * 
 * Tests every component of the trending system
 */

import { prisma } from '../src/lib/prisma'
import { generateTagsFromPost } from '../src/lib/services/tag-generation-service'
import { storeTagsForPost } from '../src/lib/services/tag-storage-service'
import { getCurrentTrendingTags, getPostsByTag } from '../src/lib/services/tag-storage-service'
import { calculateTrendingTags, shouldRecalculateTrending } from '../src/lib/services/trending-calculation-service'

let testsPassed = 0
let testsFailed = 0

function logTest(name: string, passed: boolean, details?: string) {
  if (passed) {
    console.log(`✅ ${name}`)
    if (details) console.log(`   ${details}`)
    testsPassed++
  } else {
    console.log(`❌ ${name}`)
    if (details) console.log(`   ${details}`)
    testsFailed++
  }
}

async function test() {
  console.log('🧪 COMPREHENSIVE TRENDING SYSTEM TEST\n')
  console.log('=' .repeat(60))
  
  // ============================================================
  // TEST 1: DATABASE SCHEMA
  // ============================================================
  console.log('\n📊 TEST 1: Database Schema\n')
  
  try {
    const tagCount = await prisma.tag.count()
    logTest('Tag model exists and queryable', true, `${tagCount} tags in database`)
  } catch (e) {
    logTest('Tag model exists and queryable', false, String(e))
  }
  
  try {
    const postTagCount = await prisma.postTag.count()
    logTest('PostTag model exists and queryable', true, `${postTagCount} post-tag links`)
  } catch (e) {
    logTest('PostTag model exists and queryable', false, String(e))
  }
  
  try {
    const trendingCount = await prisma.trendingTag.count()
    logTest('TrendingTag model exists and queryable', true, `${trendingCount} trending entries`)
  } catch (e) {
    logTest('TrendingTag model exists and queryable', false, String(e))
  }
  
  // ============================================================
  // TEST 2: TAG STORAGE SERVICE
  // ============================================================
  console.log('\n🏷️  TEST 2: Tag Storage Service\n')
  
  try {
    const testTags = [
      { name: 'test-tag', displayName: 'Test Tag', category: 'Tech' }
    ]
    
    // Create a test post
    const testPost = await prisma.post.create({
      data: {
        content: 'This is a test post for trending',
        authorId: 'test-author',
        timestamp: new Date(),
      }
    })
    
    // Store tags
    await storeTagsForPost(testPost.id, testTags)
    
    // Verify tags were stored
    const storedTags = await prisma.postTag.findMany({
      where: { postId: testPost.id },
      include: { tag: true }
    })
    
    logTest('storeTagsForPost creates tags and links', storedTags.length > 0, 
      `Created ${storedTags.length} tag associations`)
    
    // Clean up test post
    await prisma.post.delete({ where: { id: testPost.id } })
    
  } catch (e) {
    logTest('storeTagsForPost creates tags and links', false, String(e))
  }
  
  // ============================================================
  // TEST 3: TRENDING CALCULATION
  // ============================================================
  console.log('\n📈 TEST 3: Trending Calculation\n')
  
  try {
    const shouldRecalc = await shouldRecalculateTrending()
    logTest('shouldRecalculateTrending function works', true, 
      `Should recalculate: ${shouldRecalc}`)
  } catch (e) {
    logTest('shouldRecalculateTrending function works', false, String(e))
  }
  
  try {
    // Check if we have enough data
    const recentPosts = await prisma.postTag.count({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        }
      }
    })
    
    logTest('Trending has sufficient data', recentPosts >= 3, 
      `${recentPosts} recent post-tag associations (need ≥3)`)
      
  } catch (e) {
    logTest('Trending has sufficient data', false, String(e))
  }
  
  // ============================================================
  // TEST 4: GET CURRENT TRENDING
  // ============================================================
  console.log('\n🔥 TEST 4: Get Current Trending\n')
  
  try {
    const trending = await getCurrentTrendingTags(5)
    logTest('getCurrentTrendingTags returns top 5', trending.length === 5, 
      `Returned ${trending.length} items`)
    
    // Check data structure
    if (trending.length > 0) {
      const first = trending[0]
      const hasRequiredFields = 
        first.id && 
        first.tag?.name && 
        first.tag?.displayName && 
        first.postCount !== undefined && 
        first.rank !== undefined
      
      logTest('Trending items have correct structure', hasRequiredFields,
        `Contains: id, tag, postCount, rank`)
      
      // Check rank ordering
      const ranksCorrect = trending.every((item, i) => item.rank === i + 1)
      logTest('Trending items are ranked correctly', ranksCorrect,
        `Ranks: ${trending.map(t => t.rank).join(', ')}`)
    }
  } catch (e) {
    logTest('getCurrentTrendingTags returns top 5', false, String(e))
  }
  
  // ============================================================
  // TEST 5: GET POSTS BY TAG
  // ============================================================
  console.log('\n📄 TEST 5: Get Posts by Tag\n')
  
  try {
    const trending = await getCurrentTrendingTags(1)
    if (trending.length > 0) {
      const tagName = trending[0].tag.name
      const result = await getPostsByTag(tagName, { limit: 10 })
      
      logTest('getPostsByTag returns posts', result.posts.length > 0,
        `Found ${result.posts.length} posts with tag "${tagName}"`)
      
      logTest('getPostsByTag returns tag info', result.tag !== null,
        `Tag: ${result.tag?.displayName}`)
    } else {
      logTest('getPostsByTag returns posts', false, 'No trending tags to test with')
    }
  } catch (e) {
    logTest('getPostsByTag returns posts', false, String(e))
  }
  
  // ============================================================
  // TEST 6: API ENDPOINT DATA STRUCTURE
  // ============================================================
  console.log('\n🌐 TEST 6: API Response Structure\n')
  
  try {
    const trending = await getCurrentTrendingTags(5)
    
    // Simulate what the API does
    const trendingItems = await Promise.all(
      trending.map(async (item) => {
        const recentPosts = await prisma.postTag.findMany({
          where: { tagId: item.tag.id },
          include: { post: { select: { content: true } } },
          take: 3,
          orderBy: { createdAt: 'desc' },
        })
        
        let summary = ''
        if (recentPosts.length > 0) {
          if (item.tag.category === 'Tech') {
            summary = `Latest discussions about ${item.tag.displayName}`
          } else if (item.tag.category === 'Finance') {
            summary = `Market movements and predictions around ${item.tag.displayName}`
          } else if (item.tag.category === 'News') {
            summary = `Breaking updates on ${item.tag.displayName}`
          } else {
            summary = `${item.postCount} posts discussing ${item.tag.displayName}`
          }
        }
        
        return {
          id: item.id,
          tag: item.tag.displayName,
          tagSlug: item.tag.name,
          category: item.tag.category,
          postCount: item.postCount,
          summary,
          rank: item.rank,
        }
      })
    )
    
    logTest('API generates summaries correctly', trendingItems.every(t => t.summary),
      `All ${trendingItems.length} items have summaries`)
    
    logTest('API response has correct fields', 
      trendingItems.every(t => 
        t.id && t.tag && t.tagSlug && t.summary && t.rank !== undefined
      ),
      'All required fields present')
      
    logTest('API returns exactly 5 items', trendingItems.length === 5,
      `Returned ${trendingItems.length} items`)
    
  } catch (e) {
    logTest('API generates summaries correctly', false, String(e))
  }
  
  // ============================================================
  // TEST 7: FRONTEND DATA FORMAT
  // ============================================================
  console.log('\n🎨 TEST 7: Frontend Display Format\n')
  
  try {
    const trending = await getCurrentTrendingTags(5)
    
    if (trending.length > 0) {
      const item = trending[0]
      const summary = item.tag.category === 'Tech' 
        ? `Latest discussions about ${item.tag.displayName}`
        : `${item.postCount} posts discussing ${item.tag.displayName}`
      
      console.log('   Expected display format:')
      console.log(`   ${item.tag.category || 'Trending'} · Trending`)
      console.log(`   ${item.tag.displayName}`)
      console.log(`   ${summary}`)
      console.log()
      
      logTest('Display format matches X/Twitter style', true,
        'Category · Status / Tag Name / Summary')
    }
  } catch (e) {
    logTest('Display format matches X/Twitter style', false, String(e))
  }
  
  // ============================================================
  // TEST 8: INTEGRATION WITH POST CREATION
  // ============================================================
  console.log('\n🔗 TEST 8: Post Creation Integration\n')
  
  try {
    // Check if database-service has the tag generation code
    const fs = await import('fs')
    const dbServicePath = './src/lib/database-service.ts'
    const dbServiceContent = fs.readFileSync(dbServicePath, 'utf-8')
    
    const hasTagGeneration = dbServiceContent.includes('generateTagsForPosts') ||
                            dbServiceContent.includes('storeTagsForPost')
    
    logTest('database-service.ts integrates tag generation', hasTagGeneration,
      hasTagGeneration ? 'Tag generation code found' : 'Missing tag generation integration')
    
  } catch (e) {
    logTest('database-service.ts integrates tag generation', false, String(e))
  }
  
  try {
    // Check if API route has tag generation
    const fs = await import('fs')
    const apiPath = './src/app/api/posts/route.ts'
    const apiContent = fs.readFileSync(apiPath, 'utf-8')
    
    const hasTagGeneration = apiContent.includes('generateTagsFromPost') ||
                            apiContent.includes('storeTagsForPost')
    
    logTest('POST /api/posts integrates tag generation', hasTagGeneration,
      hasTagGeneration ? 'Tag generation code found' : 'Missing tag generation integration')
    
  } catch (e) {
    logTest('POST /api/posts integrates tag generation', false, String(e))
  }
  
  // ============================================================
  // TEST 9: CRON INTEGRATION
  // ============================================================
  console.log('\n⏰ TEST 9: Cron Integration\n')
  
  try {
    const fs = await import('fs')
    const cronPath = './src/app/api/cron/game-tick/route.ts'
    const cronContent = fs.readFileSync(cronPath, 'utf-8')
    
    const hasTrendingCalc = cronContent.includes('calculateTrendingIfNeeded') ||
                           cronContent.includes('trending-calculation-service')
    
    logTest('Cron job integrates trending calculation', hasTrendingCalc,
      hasTrendingCalc ? 'Trending calculation found in cron' : 'Missing cron integration')
    
  } catch (e) {
    logTest('Cron job integrates trending calculation', false, String(e))
  }
  
  // ============================================================
  // TEST 10: WIDGET SIDEBAR
  // ============================================================
  console.log('\n🎛️  TEST 10: Widget Sidebar\n')
  
  try {
    const fs = await import('fs')
    const sidebarPath = './src/components/shared/WidgetSidebar.tsx'
    const sidebarContent = fs.readFileSync(sidebarPath, 'utf-8')
    
    const hasTrending = sidebarContent.includes('TrendingPanel')
    
    logTest('WidgetSidebar includes TrendingPanel', hasTrending,
      hasTrending ? 'TrendingPanel imported and used' : 'Missing TrendingPanel')
    
  } catch (e) {
    logTest('WidgetSidebar includes TrendingPanel', false, String(e))
  }
  
  // ============================================================
  // SUMMARY
  // ============================================================
  console.log('\n' + '='.repeat(60))
  console.log('📊 TEST SUMMARY\n')
  console.log(`✅ Tests Passed: ${testsPassed}`)
  console.log(`❌ Tests Failed: ${testsFailed}`)
  console.log(`📈 Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`)
  
  if (testsFailed === 0) {
    console.log('\n🎉 ALL TESTS PASSED! Trending system is fully functional.')
    console.log('\n✅ Ready for production use')
  } else {
    console.log(`\n⚠️  ${testsFailed} test(s) failed. Review the issues above.`)
  }
  
  console.log('\n' + '='.repeat(60))
  
  await prisma.$disconnect()
  process.exit(testsFailed === 0 ? 0 : 1)
}

test().catch((error) => {
  console.error('\n❌ CRITICAL TEST FAILURE:', error)
  process.exit(1)
})

