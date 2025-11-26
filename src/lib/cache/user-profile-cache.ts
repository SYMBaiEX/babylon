/**
 * User Profile Caching
 * 
 * Implements aggressive caching for user profiles to reduce database load
 * during high concurrent user scenarios.
 */

import { getCache, setCache, invalidateCache, CACHE_KEYS, DEFAULT_TTLS } from '../cache-service';
import { db, users, posts, follows, eq, inArray, count } from '@/db';
import { logger } from '../logger';

interface CachedUserProfile {
  id: string;
  username: string | null;
  displayName: string | null;
  bio: string | null;
  profileImageUrl: string | null;
  coverImageUrl: string | null;
  walletAddress: string | null;
  reputationPoints: number;
  virtualBalance: string;
  lifetimePnL: string;
  createdAt: string;
  isActor: boolean;
  // Stats
  followersCount?: number;
  followingCount?: number;
  postsCount?: number;
}

/**
 * Get user profile with caching
 */
export async function getCachedUserProfile(userId: string): Promise<CachedUserProfile | null> {
  const cacheKey = `${CACHE_KEYS.USER}:${userId}`;

  // Try cache first
  const cached = await getCache<CachedUserProfile>(cacheKey);
  if (cached) {
    logger.debug('User profile cache hit', { userId }, 'UserProfileCache');
    return cached;
  }

  // Cache miss - fetch from database
  logger.debug('User profile cache miss', { userId }, 'UserProfileCache');

  const userResult = await db.select({
    id: users.id,
    username: users.username,
    displayName: users.displayName,
    bio: users.bio,
    profileImageUrl: users.profileImageUrl,
    coverImageUrl: users.coverImageUrl,
    walletAddress: users.walletAddress,
    reputationPoints: users.reputationPoints,
    virtualBalance: users.virtualBalance,
    lifetimePnL: users.lifetimePnL,
    createdAt: users.createdAt,
    isActor: users.isActor,
  })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const user = userResult[0];

  if (!user) {
    return null;
  }

  // Get counts
  const followersCountResult = await db.select({ count: count() }).from(follows).where(eq(follows.followingId, userId));
  const followingCountResult = await db.select({ count: count() }).from(follows).where(eq(follows.followerId, userId));
  const postsCountResult = await db.select({ count: count() })
    .from(posts)
    .where(eq(posts.authorId, userId));

  const profile: CachedUserProfile = {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    bio: user.bio,
    profileImageUrl: user.profileImageUrl,
    coverImageUrl: user.coverImageUrl,
    walletAddress: user.walletAddress,
    reputationPoints: user.reputationPoints,
    virtualBalance: user.virtualBalance?.toString() || '0',
    lifetimePnL: user.lifetimePnL?.toString() || '0',
    createdAt: user.createdAt.toISOString(),
    isActor: user.isActor,
    followersCount: followersCountResult[0]?.count || 0,
    followingCount: followingCountResult[0]?.count || 0,
    postsCount: postsCountResult[0]?.count || 0,
  };

  // Cache for 5 minutes
  await setCache(cacheKey, profile, {
    ttl: DEFAULT_TTLS.USER,
    namespace: CACHE_KEYS.USER,
  });

  return profile;
}

/**
 * Get multiple user profiles with caching
 */
export async function getCachedUserProfiles(userIds: string[]): Promise<Map<string, CachedUserProfile>> {
  const profiles = new Map<string, CachedUserProfile>();
  const uncachedIds: string[] = [];

  // Try to get from cache first
  await Promise.all(
    userIds.map(async (userId) => {
      const cached = await getCache<CachedUserProfile>(`${CACHE_KEYS.USER}:${userId}`);
      if (cached) {
        profiles.set(userId, cached);
      } else {
        uncachedIds.push(userId);
      }
    })
  );

  // Fetch uncached profiles from database
  if (uncachedIds.length > 0) {
    const usersResult = await db.select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      bio: users.bio,
      profileImageUrl: users.profileImageUrl,
      coverImageUrl: users.coverImageUrl,
      walletAddress: users.walletAddress,
      reputationPoints: users.reputationPoints,
      virtualBalance: users.virtualBalance,
      lifetimePnL: users.lifetimePnL,
      createdAt: users.createdAt,
      isActor: users.isActor,
    })
      .from(users)
      .where(inArray(users.id, uncachedIds));

    // Get counts for all users
    const countsPromises = usersResult.map(async (user) => {
      const followersCountResult = await db.select({ count: count() }).from(follows).where(eq(follows.followingId, user.id));
      const followingCountResult = await db.select({ count: count() }).from(follows).where(eq(follows.followerId, user.id));
      const postsCountResult = await db.select({ count: count() })
        .from(posts)
        .where(eq(posts.authorId, user.id));
      
      return {
        userId: user.id,
        followersCount: followersCountResult[0]?.count || 0,
        followingCount: followingCountResult[0]?.count || 0,
        postsCount: postsCountResult[0]?.count || 0,
      };
    });

    const counts = await Promise.all(countsPromises);
    const countsMap = new Map(counts.map(c => [c.userId, c]));

    // Cache and add to results
    await Promise.all(
      usersResult.map(async (user) => {
        const userCounts = countsMap.get(user.id);
        const profile: CachedUserProfile = {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          bio: user.bio,
          profileImageUrl: user.profileImageUrl,
          coverImageUrl: user.coverImageUrl,
          walletAddress: user.walletAddress,
          reputationPoints: user.reputationPoints,
          virtualBalance: user.virtualBalance?.toString() || '0',
          lifetimePnL: user.lifetimePnL?.toString() || '0',
          createdAt: user.createdAt.toISOString(),
          isActor: user.isActor,
          followersCount: userCounts?.followersCount || 0,
          followingCount: userCounts?.followingCount || 0,
          postsCount: userCounts?.postsCount || 0,
        };

        profiles.set(user.id, profile);

        // Cache for future requests
        await setCache(`${CACHE_KEYS.USER}:${user.id}`, profile, {
          ttl: DEFAULT_TTLS.USER,
          namespace: CACHE_KEYS.USER,
        });
      })
    );
  }

  logger.info('User profiles fetched', {
    requested: userIds.length,
    cached: userIds.length - uncachedIds.length,
    fetched: uncachedIds.length,
  }, 'UserProfileCache');

  return profiles;
}

/**
 * Invalidate user profile cache
 */
export async function invalidateUserProfile(userId: string): Promise<void> {
  const cacheKey = `${CACHE_KEYS.USER}:${userId}`;
  await invalidateCache(cacheKey, { namespace: CACHE_KEYS.USER });
  logger.debug('User profile cache invalidated', { userId }, 'UserProfileCache');
}

/**
 * Warm user profile cache for frequently accessed users
 */
export async function warmUserProfileCache(userIds: string[]): Promise<void> {
  logger.info('Warming user profile cache', { count: userIds.length }, 'UserProfileCache');
  await getCachedUserProfiles(userIds);
}
