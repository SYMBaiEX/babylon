/**
 * Backfill Tags Script
 * 
 * Generates and stores tags for existing posts that don't have any tags yet
 */

import { prisma } from '../src/lib/prisma'
import { logger } from '../src/lib/logger'
import { generateTagsForPosts } from '../src/lib/services/tag-generation-service'
import { storeTagsForPost } from '../src/lib/services/tag-storage-service'

const BATCH_SIZE = 10 // Process 10 posts at a time to avoid rate limits

async function backfillTags() {
  console.log('🏷️  Starting tag backfill for existing posts...\n')

  try {
    // Get all posts that don't have any tags
    const postsWithoutTags = await prisma.post.findMany({
      where: {
        postTags: {
          none: {},
        },
      },
      orderBy: {
        timestamp: 'desc', // Start with most recent
      },
      select: {
        id: true,
        content: true,
        timestamp: true,
      },
    })

    console.log(`Found ${postsWithoutTags.length} posts without tags\n`)

    if (postsWithoutTags.length === 0) {
      console.log('✅ All posts already have tags!')
      return
    }

    let processed = 0
    let tagged = 0
    let errors = 0

    // Process in batches
    for (let i = 0; i < postsWithoutTags.length; i += BATCH_SIZE) {
      const batch = postsWithoutTags.slice(i, i + BATCH_SIZE)
      
      console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(postsWithoutTags.length / BATCH_SIZE)}...`)

      try {
        // Generate tags for this batch
        const tagMap = await generateTagsForPosts(batch)

        // Store tags for each post
        for (const [postId, tags] of tagMap.entries()) {
          try {
            if (tags.length > 0) {
              await storeTagsForPost(postId, tags)
              tagged++
              console.log(`  ✓ Post ${postId.slice(0, 8)}: ${tags.map(t => t.displayName).join(', ')}`)
            } else {
              console.log(`  - Post ${postId.slice(0, 8)}: No tags generated`)
            }
            processed++
          } catch (error) {
            console.error(`  ✗ Post ${postId.slice(0, 8)}: Error storing tags`, error)
            errors++
          }
        }
      } catch (error) {
        console.error(`  ✗ Batch error:`, error)
        errors += batch.length
      }

      // Small delay between batches to avoid rate limits
      if (i + BATCH_SIZE < postsWithoutTags.length) {
        console.log('  Waiting 2s before next batch...\n')
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    }

    console.log('\n📊 Backfill Summary:')
    console.log(`  Total posts: ${postsWithoutTags.length}`)
    console.log(`  Processed: ${processed}`)
    console.log(`  Tagged: ${tagged}`)
    console.log(`  Errors: ${errors}`)
    console.log('\n✅ Backfill complete!')
  } catch (error) {
    console.error('❌ Backfill failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Run the backfill
backfillTags()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })

