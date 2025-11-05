/**
 * Test LLM Summaries Script
 * 
 * Tests that real LLM summaries are being generated (not templates)
 */

import { prisma } from '../src/lib/prisma'
import { generateTrendingSummary } from '../src/lib/services/trending-summary-service'

async function test() {
  console.log('🧪 Testing LLM Summary Generation\n')
  
  try {
    // Get a trending tag
    const trending = await prisma.trendingTag.findFirst({
      include: { tag: true },
      orderBy: { rank: 'asc' },
    })
    
    if (!trending) {
      console.log('⚠️  No trending tags found. Run: bun run trending:regenerate')
      return
    }
    
    // Get recent posts
    const recentPosts = await prisma.postTag.findMany({
      where: { tagId: trending.tag.id },
      include: { post: { select: { content: true } } },
      take: 3,
      orderBy: { createdAt: 'desc' },
    })
    
    const postContents = recentPosts.map(pt => pt.post.content)
    
    console.log(`Testing tag: ${trending.tag.displayName}`)
    console.log(`Category: ${trending.tag.category || 'General'}`)
    console.log(`Sample posts:`)
    postContents.slice(0, 2).forEach((content, i) => {
      console.log(`  ${i + 1}. ${content.slice(0, 80)}...`)
    })
    
    console.log('\n🤖 Generating LLM summary...\n')
    
    const summary = await generateTrendingSummary(
      trending.tag.displayName,
      trending.tag.category,
      postContents
    )
    
    console.log(`✅ Generated Summary:`)
    console.log(`   "${summary}"`)
    
    // Check if it's a template or real LLM
    const isTemplate = 
      summary.includes('Latest discussions about') ||
      summary.includes('Market movements and predictions') ||
      summary.includes('Breaking updates on')
    
    if (isTemplate) {
      console.log('\n⚠️  Warning: This looks like a template fallback.')
      console.log('   Check that API keys are properly configured.')
    } else {
      console.log('\n✅ This appears to be a real LLM-generated summary!')
      console.log('   (Not a template)')
    }
    
    console.log('\n📊 Summary Analysis:')
    console.log(`   Length: ${summary.length} characters`)
    console.log(`   Words: ${summary.split(' ').length} words`)
    console.log(`   Unique: ${!isTemplate ? 'Yes' : 'No (template)'}`)
    
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

test()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
  })

