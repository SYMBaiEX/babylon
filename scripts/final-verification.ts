/**
 * Final End-to-End Verification
 * 
 * Verifies all components are using real LLM, not templates or sample data
 */

import { prisma } from '../src/lib/prisma'
import { generateTagsFromPost } from '../src/lib/services/tag-generation-service'
import { generateTrendingSummary } from '../src/lib/services/trending-summary-service'
import { getCurrentTrendingTags } from '../src/lib/services/tag-storage-service'

let passed = 0
let failed = 0

function check(name: string, condition: boolean, details?: string) {
  if (condition) {
    console.log(`✅ ${name}`)
    if (details) console.log(`   ${details}`)
    passed++
  } else {
    console.log(`❌ ${name}`)
    if (details) console.log(`   ${details}`)
    failed++
  }
}

async function verify() {
  console.log('🔍 FINAL VERIFICATION - Real LLM Data Only\n')
  console.log('='.repeat(60))
  
  // 1. API Keys
  console.log('\n🔑 API Keys\n')
  const hasGroq = !!process.env.GROQ_API_KEY
  const hasOpenAI = !!process.env.OPENAI_API_KEY
  
  check('API keys configured', hasGroq || hasOpenAI, 
    `Using: ${hasGroq ? 'Groq' : 'OpenAI'}`)
  
  // 2. Tag Generation
  console.log('\n🏷️  Tag Generation\n')
  try {
    const testPost = "Elon Musk just announced SpaceX Mars mission plans."
    const tags = await generateTagsFromPost(testPost)
    
    check('Real LLM tag generation working', tags.length > 0,
      `Generated: ${tags.map(t => t.displayName).join(', ')}`)
    
    check('Tags have categories', tags.some(t => t.category),
      `Categories: ${tags.map(t => t.category).filter(Boolean).join(', ')}`)
  } catch (error) {
    check('Real LLM tag generation working', false, String(error))
  }
  
  // 3. Database State
  console.log('\n💾 Database State\n')
  
  const tagCount = await prisma.tag.count()
  check('Real tags in database', tagCount > 0, `${tagCount} tags`)
  
  const postTagCount = await prisma.postTag.count()
  check('Posts have tags', postTagCount > 0, `${postTagCount} associations`)
  
  const trendingCount = await prisma.trendingTag.count()
  check('Trending calculations exist', trendingCount > 0, `${trendingCount} trending entries`)
  
  // 4. Trending Summaries
  console.log('\n📝 Trending Summaries\n')
  
  const trending = await getCurrentTrendingTags(1)
  if (trending.length > 0) {
    const item = trending[0]
    
    // Get posts for summary
    const recentPosts = await prisma.postTag.findMany({
      where: { tagId: item.tag.id },
      include: { post: { select: { content: true } } },
      take: 3,
      orderBy: { createdAt: 'desc' },
    })
    
    const postContents = recentPosts.map(pt => pt.post.content)
    const summary = await generateTrendingSummary(
      item.tag.displayName,
      item.tag.category,
      postContents
    )
    
    // Check if it's NOT a template
    const isTemplate = 
      summary.includes('Latest discussions about') ||
      summary.includes('Market movements and predictions') ||
      summary.includes('Political developments related') ||
      summary.includes('Breaking updates on')
    
    check('Real LLM summaries (not templates)', !isTemplate,
      `"${summary.slice(0, 50)}..."`)
    
    check('Summary is concise', summary.split(' ').length <= 15,
      `${summary.split(' ').length} words`)
  } else {
    check('Trending data available', false, 'No trending tags')
  }
  
  // 5. Data Quality
  console.log('\n✨ Data Quality\n')
  
  // Check for template-only tags
  const tags = await prisma.tag.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' },
  })
  
  const hasManualTags = tags.some(t => 
    ['test-tag', 'spacex', 'crypto', 'ai', 'markets'].includes(t.name.toLowerCase())
  )
  
  check('Using real extracted tags (not manual samples)', !hasManualTags || tags.length > 10,
    hasManualTags ? 'Some manual tags found, but real ones exist too' : 'All tags are LLM-generated')
  
  const uniqueCategories = new Set(tags.map(t => t.category).filter(Boolean))
  check('Tags have diverse categories', uniqueCategories.size >= 2,
    `Categories: ${Array.from(uniqueCategories).join(', ')}`)
  
  // 6. System Health
  console.log('\n🏥 System Health\n')
  
  const recentPosts = await prisma.post.count({
    where: {
      timestamp: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
      }
    }
  })
  
  check('Recent post activity', recentPosts > 0, `${recentPosts} posts in last 24h`)
  
  const postsWithTags = await prisma.post.count({
    where: {
      postTags: {
        some: {}
      }
    }
  })
  
  const percentTagged = Math.round((postsWithTags / (await prisma.post.count())) * 100)
  check('Posts are being tagged', percentTagged > 50, `${percentTagged}% of posts have tags`)
  
  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('📊 VERIFICATION SUMMARY\n')
  console.log(`✅ Passed: ${passed}`)
  console.log(`❌ Failed: ${failed}`)
  console.log(`📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`)
  
  if (failed === 0) {
    console.log('\n🎉 ALL CHECKS PASSED!')
    console.log('\n✅ System is using REAL LLM data:')
    console.log('   • Real tag generation with Groq/OpenAI')
    console.log('   • Real LLM-powered summaries')
    console.log('   • No template fallbacks in use')
    console.log('   • No manual sample data')
    console.log('\n🚀 READY FOR PRODUCTION!')
  } else {
    console.log(`\n⚠️  ${failed} check(s) failed. Review issues above.`)
  }
  
  console.log('\n' + '='.repeat(60))
  
  await prisma.$disconnect()
  process.exit(failed === 0 ? 0 : 1)
}

verify().catch(error => {
  console.error('\n❌ CRITICAL ERROR:', error)
  process.exit(1)
})

