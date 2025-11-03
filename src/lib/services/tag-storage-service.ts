/**
 * Tag Storage Service
 * 
 * Handles storage and retrieval of tags in the database
 */

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import type { GeneratedTag } from './tag-generation-service'

/**
 * Store tags for a post
 * - Creates tags if they don't exist
 * - Links tags to post via PostTag join table
 */
export async function storeTagsForPost(
  postId: string,
  tags: GeneratedTag[]
): Promise<void> {
  if (tags.length === 0) {
    return
  }

  try {
    // Batch fetch all existing tags in one query
    const tagNames = tags.map(t => t.name)
    const existingTags = await prisma.tag.findMany({
      where: { name: { in: tagNames } },
    })
    
    const existingTagMap = new Map(existingTags.map(t => [t.name, t]))
    
    // Find tags that need to be created
    const tagsToCreate = tags.filter(t => !existingTagMap.has(t.name))
    
    // Batch create new tags
    if (tagsToCreate.length > 0) {
      const createdTags = await prisma.$transaction(
        tagsToCreate.map(tag =>
          prisma.tag.create({
            data: {
              name: tag.name,
              displayName: tag.displayName,
              category: tag.category || null,
            },
          })
        )
      )
      
      // Add created tags to map
      createdTags.forEach(t => existingTagMap.set(t.name, t))
      logger.debug('Created new tags', { count: createdTags.length }, 'TagStorageService')
    }
    
    // Batch create post-tag associations
    const postTagData = tags.map(tag => {
      const dbTag = existingTagMap.get(tag.name)
      if (!dbTag) throw new Error(`Tag not found: ${tag.name}`)
      return {
        postId,
        tagId: dbTag.id,
      }
    })
    
    // Use createMany with skipDuplicates for better performance
    await prisma.postTag.createMany({
      data: postTagData,
      skipDuplicates: true,
    })

    logger.debug('Stored tags for post', {
      postId,
      tagCount: tags.length,
    }, 'TagStorageService')
  } catch (error) {
    logger.error('Error storing tags for post', {
      error,
      postId,
      tags,
    }, 'TagStorageService')
  }
}

/**
 * Get tags for a post
 */
export async function getTagsForPost(postId: string) {
  return await prisma.postTag.findMany({
    where: { postId },
    include: {
      tag: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  })
}

/**
 * Get posts by tag name
 */
export async function getPostsByTag(
  tagName: string,
  options: {
    limit?: number
    offset?: number
  } = {}
) {
  const { limit = 20, offset = 0 } = options

  // Find tag by normalized name
  const tag = await prisma.tag.findUnique({
    where: { name: tagName.toLowerCase() },
  })

  if (!tag) {
    return {
      tag: null,
      posts: [],
      total: 0,
    }
  }

  // Get posts with this tag
  const [postTags, total] = await Promise.all([
    prisma.postTag.findMany({
      where: { tagId: tag.id },
      include: {
        post: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip: offset,
      take: limit,
    }),
    prisma.postTag.count({
      where: { tagId: tag.id },
    }),
  ])

  return {
    tag,
    posts: postTags.map(pt => pt.post),
    total,
  }
}

/**
 * Get tag statistics (for trending calculation)
 */
export async function getTagStatistics(
  windowStart: Date,
  windowEnd: Date
): Promise<Array<{
  tagId: string
  tagName: string
  tagDisplayName: string
  tagCategory: string | null
  postCount: number
  recentPostCount: number // Last 24 hours
  oldestPostDate: Date
  newestPostDate: Date
}>> {
  // Calculate 24 hours ago from window end
  const last24Hours = new Date(windowEnd.getTime() - 24 * 60 * 60 * 1000)

  // Get tag counts within the window
  const result = await prisma.$queryRaw<Array<{
    tagId: string
    tagName: string
    tagDisplayName: string
    tagCategory: string | null
    postCount: bigint
    recentPostCount: bigint
    oldestPostDate: Date
    newestPostDate: Date
  }>>`
    SELECT 
      t.id as "tagId",
      t.name as "tagName",
      t."displayName" as "tagDisplayName",
      t.category as "tagCategory",
      COUNT(pt.id) as "postCount",
      COUNT(CASE WHEN pt."createdAt" >= ${last24Hours} THEN 1 END) as "recentPostCount",
      MIN(pt."createdAt") as "oldestPostDate",
      MAX(pt."createdAt") as "newestPostDate"
    FROM "Tag" t
    INNER JOIN "PostTag" pt ON pt."tagId" = t.id
    WHERE pt."createdAt" >= ${windowStart}
      AND pt."createdAt" <= ${windowEnd}
    GROUP BY t.id, t.name, t."displayName", t.category
    HAVING COUNT(pt.id) >= 3
    ORDER BY "postCount" DESC
  `

  return result.map(row => ({
    ...row,
    postCount: Number(row.postCount),
    recentPostCount: Number(row.recentPostCount),
  }))
}

/**
 * Store trending tags calculation results
 */
export async function storeTrendingTags(
  tags: Array<{
    tagId: string
    score: number
    postCount: number
    rank: number
    relatedContext?: string
  }>,
  windowStart: Date,
  windowEnd: Date
): Promise<void> {
  try {
    // Store all trending tags in a transaction
    await prisma.$transaction(
      tags.map(tag =>
        prisma.trendingTag.create({
          data: {
            tagId: tag.tagId,
            score: tag.score,
            postCount: tag.postCount,
            rank: tag.rank,
            windowStart,
            windowEnd,
            relatedContext: tag.relatedContext || null,
          },
        })
      )
    )

    logger.info('Stored trending tags', {
      count: tags.length,
      windowStart,
      windowEnd,
    }, 'TagStorageService')
  } catch (error) {
    logger.error('Error storing trending tags', {
      error,
      tags,
    }, 'TagStorageService')
  }
}

/**
 * Get current trending tags (most recent calculation)
 */
export async function getCurrentTrendingTags(limit = 10) {
  // Get the most recent calculation timestamp
  const latestCalculation = await prisma.trendingTag.findFirst({
    orderBy: { calculatedAt: 'desc' },
    select: { calculatedAt: true },
  })

  if (!latestCalculation) {
    return []
  }

  // Get all trending tags from the latest calculation
  return await prisma.trendingTag.findMany({
    where: {
      calculatedAt: latestCalculation.calculatedAt,
    },
    include: {
      tag: true,
    },
    orderBy: {
      rank: 'asc',
    },
    take: limit,
  })
}

/**
 * Get related/co-occurring tags for a given tag
 * (for "Trending with X" context)
 */
export async function getRelatedTags(
  tagId: string,
  limit = 3
): Promise<string[]> {
  // Find posts with this tag
  const postsWithTag = await prisma.postTag.findMany({
    where: { tagId },
    select: { postId: true },
    take: 100, // Sample recent posts
    orderBy: { createdAt: 'desc' },
  })

  const postIds = postsWithTag.map(pt => pt.postId)

  if (postIds.length === 0) {
    return []
  }

  // Find other tags that appear in the same posts
  const coOccurringTags = await prisma.$queryRaw<Array<{
    tagId: string
    displayName: string
    count: bigint
  }>>`
    SELECT 
      t.id as "tagId",
      t."displayName" as "displayName",
      COUNT(*) as count
    FROM "PostTag" pt
    INNER JOIN "Tag" t ON t.id = pt."tagId"
    WHERE pt."postId" = ANY(ARRAY[${postIds.map(id => `'${id}'`).join(',')}]::uuid[])
      AND pt."tagId" != ${tagId}
    GROUP BY t.id, t."displayName"
    ORDER BY count DESC
    LIMIT ${limit}
  `

  return coOccurringTags.map(tag => tag.displayName)
}

