/**
 * Tag Storage Service
 *
 * Handles storage and retrieval of tags in the database
 */

import {
  and,
  asc,
  count,
  db,
  desc,
  eq,
  gte,
  inArray,
  ne,
  postTags,
  tags,
  trendingTags,
  withTransaction,
} from '@babylon/db';
import { logger } from '@babylon/shared';
import { generateSnowflakeId } from '@babylon/shared';

/**
 * Generated tag structure
 */
export interface GeneratedTag {
  name: string;
  displayName: string;
  category?: string;
}

/**
 * Store tags for a post
 * - Creates tags if they don't exist
 * - Links tags to post via PostTag join table
 */
export async function storeTagsForPost(
  postId: string,
  generatedTags: GeneratedTag[]
): Promise<void> {
  if (generatedTags.length === 0) {
    return;
  }

  const tagNames = generatedTags.map((t) => t.name);
  const existingTagsList = await db
    .select()
    .from(tags)
    .where(inArray(tags.name, tagNames));

  const existingTagMap = new Map(existingTagsList.map((t) => [t.name, t]));

  const tagsToCreate = generatedTags.filter((t) => !existingTagMap.has(t.name));

  if (tagsToCreate.length > 0) {
    const tagIds = await Promise.all(
      tagsToCreate.map(() => generateSnowflakeId())
    );

    // Insert tags one by one with conflict handling
    for (let index = 0; index < tagsToCreate.length; index++) {
      const tag = tagsToCreate[index];
      if (!tag) continue;
      const tagId = tagIds[index];
      if (!tagId) {
        throw new Error(`Failed to generate tag ID for index ${index}`);
      }

      await db
        .insert(tags)
        .values({
          id: tagId,
          name: tag.name,
          displayName: tag.displayName,
          category: tag.category || null,
          updatedAt: new Date(),
        })
        .onConflictDoNothing();
    }

    // Now fetch all tags that should exist (either just created or already existed)
    const createdTags = await db
      .select()
      .from(tags)
      .where(
        inArray(
          tags.name,
          tagsToCreate.map((t) => t.name)
        )
      );

    createdTags.forEach((t) => existingTagMap.set(t.name, t));
    logger.debug(
      'Created/fetched new tags',
      { count: createdTags.length },
      'TagStorageService'
    );
  }

  // Pre-generate IDs for post tags
  const postTagIds = await Promise.all(
    generatedTags.map(() => generateSnowflakeId())
  );

  // Insert post tags one by one with conflict handling
  for (let idx = 0; idx < generatedTags.length; idx++) {
    const tag = generatedTags[idx];
    if (!tag) continue;
    const dbTag = existingTagMap.get(tag.name);
    if (!dbTag) {
      throw new Error(`Tag ${tag.name} not found in existing tags`);
    }
    const postTagId = postTagIds[idx];
    if (!postTagId) {
      throw new Error(`Failed to generate post tag ID for index ${idx}`);
    }

    await db
      .insert(postTags)
      .values({
        id: postTagId,
        postId,
        tagId: dbTag.id,
      })
      .onConflictDoNothing();
  }

  logger.debug(
    'Stored tags for post',
    {
      postId,
      tagCount: generatedTags.length,
    },
    'TagStorageService'
  );
}

/**
 * Get tags for a post
 */
export async function getTagsForPost(postId: string) {
  return await db.query.postTags.findMany({
    where: eq(postTags.postId, postId),
    with: {
      tag: true,
    },
    orderBy: asc(postTags.createdAt),
  });
}

/**
 * Get posts by tag name
 */
export async function getPostsByTag(
  tagName: string,
  options: {
    limit?: number;
    offset?: number;
  } = {}
) {
  const { limit = 20, offset = 0 } = options;

  // Find tag by normalized name
  const [tag] = await db
    .select()
    .from(tags)
    .where(eq(tags.name, tagName.toLowerCase()))
    .limit(1);

  if (!tag) {
    return {
      tag: null,
      posts: [],
      total: 0,
    };
  }

  // Get posts with this tag
  const [postTagsList, totalResult] = await Promise.all([
    db.query.postTags.findMany({
      where: eq(postTags.tagId, tag.id),
      with: {
        post: true,
      },
      orderBy: desc(postTags.createdAt),
      offset,
      limit,
    }),
    db
      .select({ count: count() })
      .from(postTags)
      .where(eq(postTags.tagId, tag.id)),
  ]);

  const total = totalResult[0]?.count ?? 0;

  return {
    tag,
    posts: postTagsList
      .map((pt) => pt.post)
      .filter((post): post is NonNullable<typeof post> => post !== null),
    total,
  };
}

/**
 * Get tag statistics (for trending calculation)
 */
export async function getTagStatistics(
  windowStart: Date,
  windowEnd: Date
): Promise<
  Array<{
    tagId: string;
    tagName: string;
    tagDisplayName: string;
    tagCategory: string | null;
    postCount: number;
    recentPostCount: number; // Last 24 hours
    oldestPostDate: Date;
    newestPostDate: Date;
  }>
> {
  // Calculate 24 hours ago from window end
  const last24Hours = new Date(windowEnd.getTime() - 24 * 60 * 60 * 1000);

  // Get all post tags within the window with their tag info
  // Using database queries instead of raw SQL for database compatibility
  const postTagsList = await db.query.postTags.findMany({
    where: (pt, { and: andOp, gte: whereGte, lte: whereLte }) =>
      andOp(
        whereGte(pt.createdAt, windowStart),
        whereLte(pt.createdAt, windowEnd)
      ),
    with: {
      tag: true,
    },
    orderBy: asc(postTags.createdAt),
  });

  // Aggregate manually (database doesn't support complex raw SQL)
  const tagStats = new Map<
    string,
    {
      tag: {
        id: string;
        name: string;
        displayName: string;
        category: string | null;
      };
      postCount: number;
      recentPostCount: number;
      oldestPostDate: Date;
      newestPostDate: Date;
    }
  >();

  postTagsList.forEach((pt) => {
    const existing = tagStats.get(pt.tagId);
    const isRecent = pt.createdAt >= last24Hours;

    if (existing) {
      existing.postCount++;
      if (isRecent) existing.recentPostCount++;
      if (pt.createdAt < existing.oldestPostDate)
        existing.oldestPostDate = pt.createdAt;
      if (pt.createdAt > existing.newestPostDate)
        existing.newestPostDate = pt.createdAt;
    } else {
      tagStats.set(pt.tagId, {
        tag: pt.tag,
        postCount: 1,
        recentPostCount: isRecent ? 1 : 0,
        oldestPostDate: pt.createdAt,
        newestPostDate: pt.createdAt,
      });
    }
  });

  // Filter tags with at least 3 posts and convert to result format
  return Array.from(tagStats.values())
    .filter((stats) => stats.postCount >= 3)
    .map((stats) => ({
      tagId: stats.tag.id,
      tagName: stats.tag.name,
      tagDisplayName: stats.tag.displayName,
      tagCategory: stats.tag.category,
      postCount: stats.postCount,
      recentPostCount: stats.recentPostCount,
      oldestPostDate: stats.oldestPostDate,
      newestPostDate: stats.newestPostDate,
    }))
    .sort((a, b) => b.postCount - a.postCount);
}

/**
 * Store trending tags calculation results
 */
export async function storeTrendingTags(
  tagsList: Array<{
    tagId: string;
    score: number;
    postCount: number;
    rank: number;
    relatedContext?: string;
  }>,
  windowStart: Date,
  windowEnd: Date
): Promise<void> {
  // Pre-generate IDs for trending tags
  const trendingTagIds = await Promise.all(
    tagsList.map(() => generateSnowflakeId())
  );

  // Store all trending tags in a transaction
  await withTransaction(async (tx) => {
    for (let idx = 0; idx < tagsList.length; idx++) {
      const tag = tagsList[idx];
      if (!tag) continue;
      const trendingTagId = trendingTagIds[idx];
      if (!trendingTagId) {
        throw new Error(`Failed to generate trending tag ID for index ${idx}`);
      }
      await tx.insert(trendingTags).values({
        id: trendingTagId,
        tagId: tag.tagId,
        score: tag.score,
        postCount: tag.postCount,
        rank: tag.rank,
        windowStart,
        windowEnd,
        relatedContext: tag.relatedContext || null,
      });
    }
  });

  logger.info(
    'Stored trending tags',
    {
      count: tagsList.length,
      windowStart,
      windowEnd,
    },
    'TagStorageService'
  );
}

/**
 * Get current trending tags (most recent calculation)
 */
export async function getCurrentTrendingTags(limit = 10) {
  // Get the most recent calculation timestamp
  const [latestCalculation] = await db
    .select({ calculatedAt: trendingTags.calculatedAt })
    .from(trendingTags)
    .orderBy(desc(trendingTags.calculatedAt))
    .limit(1);

  if (!latestCalculation) {
    return [];
  }

  // Get all trending tags from the latest calculation
  // Use >= comparison to handle potential timestamp precision issues
  const cutoffTime = new Date(latestCalculation.calculatedAt.getTime() - 1000); // 1 second buffer

  return await db.query.trendingTags.findMany({
    where: gte(trendingTags.calculatedAt, cutoffTime),
    with: {
      tag: true,
    },
    orderBy: asc(trendingTags.rank),
    limit,
  });
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
  const postsWithTagResult = await db
    .select({ postId: postTags.postId })
    .from(postTags)
    .where(eq(postTags.tagId, tagId))
    .orderBy(desc(postTags.createdAt))
    .limit(100); // Sample recent posts

  const postIds = postsWithTagResult.map((pt) => pt.postId);

  if (postIds.length === 0) {
    return [];
  }

  // Find other tags that appear in the same posts and count them
  const coOccurringPostTags = await db
    .select({ tagId: postTags.tagId })
    .from(postTags)
    .where(and(inArray(postTags.postId, postIds), ne(postTags.tagId, tagId)));

  // Count occurrences manually
  const tagCounts = new Map<string, number>();
  coOccurringPostTags.forEach((pt) => {
    tagCounts.set(pt.tagId, (tagCounts.get(pt.tagId) || 0) + 1);
  });

  // Sort by count and take top N
  const sortedTagIds = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);

  if (sortedTagIds.length === 0) {
    return [];
  }

  // Get tag display names
  const tagsList = await db
    .select({ id: tags.id, displayName: tags.displayName })
    .from(tags)
    .where(inArray(tags.id, sortedTagIds));

  // Map back to preserve order
  const tagMap = new Map(tagsList.map((t) => [t.id, t.displayName]));
  return sortedTagIds
    .map((id) => tagMap.get(id))
    .filter((name): name is string => name !== undefined);
}

