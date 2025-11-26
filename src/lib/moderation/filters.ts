/**
 * Moderation Filters
 * 
 * Helper functions to filter content based on user blocks and mutes
 */

import { db, userBlocks, userMutes, eq, and } from '@/db';

/**
 * Get list of user IDs that the current user has blocked
 */
export async function getBlockedUserIds(userId: string): Promise<string[]> {
  const blocks = await db.select({ blockedId: userBlocks.blockedId })
    .from(userBlocks)
    .where(eq(userBlocks.blockerId, userId));
  
  return blocks.map(b => b.blockedId);
}

/**
 * Get list of user IDs that have blocked the current user
 */
export async function getBlockedByUserIds(userId: string): Promise<string[]> {
  const blocks = await db.select({ blockerId: userBlocks.blockerId })
    .from(userBlocks)
    .where(eq(userBlocks.blockedId, userId));
  
  return blocks.map(b => b.blockerId);
}

/**
 * Get list of user IDs that the current user has muted
 */
export async function getMutedUserIds(userId: string): Promise<string[]> {
  const mutes = await db.select({ mutedId: userMutes.mutedId })
    .from(userMutes)
    .where(eq(userMutes.muterId, userId));
  
  return mutes.map(m => m.mutedId);
}

/**
 * Get all user IDs that should be filtered from the current user's feed
 * Includes: users blocked by current user + users who blocked current user
 */
export async function getFilteredUserIds(userId: string): Promise<string[]> {
  const [blockedByMe, blockedMe] = await Promise.all([
    getBlockedUserIds(userId),
    getBlockedByUserIds(userId),
  ]);
  
  // Combine and deduplicate
  return [...new Set([...blockedByMe, ...blockedMe])];
}

/**
 * Check if user A has blocked user B
 */
export async function hasBlocked(
  blockerId: string,
  blockedId: string
): Promise<boolean> {
  const block = await db.select({ blockerId: userBlocks.blockerId })
    .from(userBlocks)
    .where(
      and(
        eq(userBlocks.blockerId, blockerId),
        eq(userBlocks.blockedId, blockedId)
      )
    )
    .limit(1);
  
  return block.length > 0;
}

/**
 * Check if user A has muted user B
 */
export async function hasMuted(
  muterId: string,
  mutedId: string
): Promise<boolean> {
  const mute = await db.select({ muterId: userMutes.muterId })
    .from(userMutes)
    .where(
      and(
        eq(userMutes.muterId, muterId),
        eq(userMutes.mutedId, mutedId)
      )
    )
    .limit(1);
  
  return mute.length > 0;
}

/**
 * Filter posts to exclude blocked/muted users
 */
export function filterPostsByModeration<T extends { authorId?: string }>(
  posts: T[],
  blockedUserIds: string[],
  mutedUserIds: string[] = []
): T[] {
  const excludedIds = new Set([...blockedUserIds, ...mutedUserIds]);
  
  return posts.filter(post => {
    if (!post.authorId) return true;
    return !excludedIds.has(post.authorId);
  });
}

/**
 * Build where clause to exclude blocked users (returns list of IDs to exclude)
 */
export function buildBlockedUsersWhereClause(blockedUserIds: string[]) {
  if (blockedUserIds.length === 0) {
    return {};
  }
  
  return {
    authorId: {
      notIn: blockedUserIds,
    },
  };
}
