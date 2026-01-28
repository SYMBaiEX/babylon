/**
 * Cache Service
 *
 * @description Provides intelligent caching layer for frequently accessed data.
 * Uses Redis when available, falls back to in-memory cache. Supports automatic
 * TTL management, cache invalidation patterns, and graceful degradation.
 *
 * Features:
 * - Automatic TTL management
 * - Cache invalidation patterns
 * - Fallback to database on cache miss
 * - Graceful degradation if Redis unavailable
 * - Works with any Redis server via standard protocol
 */

import { logger } from '@babylon/shared';
import { getRedisClient, isRedisAvailable } from '../redis';

/**
 * Cache options
 *
 * @description Configuration options for cache operations.
 */
export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  compress?: boolean; // Compress large objects (not currently implemented)
  namespace?: string; // Cache key prefix
}

/**
 * Cache entry structure
 *
 * @description Internal structure for in-memory cache entries.
 */
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

// In-memory fallback cache (for when Redis is unavailable)
const memoryCache = new Map<string, CacheEntry<unknown>>();

/**
 * Cache key prefixes for different data types
 *
 * @description Standardized cache key prefixes used throughout the application
 * for consistent cache key naming.
 */
export const CACHE_KEYS = {
  POST: 'post',
  POSTS_LIST: 'posts:list',
  POSTS_BY_ACTOR: 'posts:actor',
  POSTS_FOLLOWING: 'posts:following',
  USER: 'user',
  USER_BALANCE: 'user:balance',
  ACTOR: 'actor',
  ORGANIZATION: 'org',
  MARKET: 'market',
  MARKETS_LIST: 'markets:list',
  TRENDING_TAGS: 'trending:tags',
  WIDGET: 'widget',
  NFT_OWNERSHIP: 'nft:ownership',
} as const;

/**
 * Default TTLs for different data types (in seconds)
 *
 * @description Default time-to-live values for different data types based on
 * their change frequency. Optimized for 400k+ user scale with HTTP-level
 * stale-while-revalidate providing additional freshness.
 *
 * SCALE OPTIMIZATION: TTLs increased from 10s to 45s for posts to reduce
 * database load by ~70%. Combined with stale-while-revalidate at HTTP layer,
 * this provides sub-second perceived latency while dramatically reducing DB hits.
 */
export const DEFAULT_TTLS = {
  // Real-time data - optimized for scale (was 10s, now 45s with HTTP SWR)
  POSTS_LIST: 45, // 45 seconds (HTTP layer adds stale-while-revalidate=60s)
  POSTS_FOLLOWING: 45, // 45 seconds (personalized, still needs cache)

  // Semi-real-time data - short TTL
  POST: 60, // 60 seconds (individual post details)
  USER_BALANCE: 30, // 30 seconds (financial data, keep fresh)
  MARKET: 60, // 1 minute
  MARKETS_LIST: 60, // 1 minute

  // Moderate change frequency - medium TTL
  USER: 300, // 5 minutes
  TRENDING_TAGS: 300, // 5 minutes
  WIDGET: 300, // 5 minutes
  NFT_OWNERSHIP: 60, // 1 minute (NFT ownership can change, shorter TTL for security)

  // Rarely changing data - long TTL
  ACTOR: 3600, // 1 hour
  ORGANIZATION: 3600, // 1 hour
  POSTS_BY_ACTOR: 180, // 3 minutes (actors post regularly)
} as const;

/**
 * Thundering herd protection beta factor
 * Higher values = more aggressive early expiration
 * Recommended range: 0.5 to 2.0
 */
const THUNDERING_HERD_BETA = 1.0;

/**
 * Clean expired entries from memory cache
 *
 * @description Removes expired entries from the in-memory cache. Called periodically
 * to prevent memory leaks.
 *
 * @private
 */
function cleanMemoryCache(): void {
  const now = Date.now();
  const toDelete: string[] = [];

  memoryCache.forEach((entry, key) => {
    if (entry.expiresAt <= now) {
      toDelete.push(key);
    }
  });

  toDelete.forEach((key) => memoryCache.delete(key));
}

// Clean memory cache every minute
setInterval(cleanMemoryCache, 60000);

/**
 * Get value from cache
 *
 * @description Retrieves a value from cache (Redis or in-memory). Returns null
 * if not found or expired.
 *
 * @param {string} key - Cache key
 * @param {CacheOptions} [options={}] - Cache options (namespace, etc.)
 * @returns {Promise<T | null>} Cached value or null if not found
 *
 * @example
 * ```typescript
 * const user = await getCache<User>('user:123', { namespace: CACHE_KEYS.USER });
 * if (user) {
 *   // Use cached user
 * }
 * ```
 */
export async function getCache<T>(
  key: string,
  options: CacheOptions = {}
): Promise<T | null> {
  const fullKey = options.namespace ? `${options.namespace}:${key}` : key;

  const client = getRedisClient();
  if (client) {
    const cached = await client.get(fullKey);

    if (cached !== null && cached !== undefined) {
      if (!cached || cached.trim() === '') {
        logger.warn(
          'Empty cached value in Redis',
          { key: fullKey },
          'CacheService'
        );
        return null;
      }

      logger.debug('Cache hit (Redis)', { key: fullKey }, 'CacheService');
      return JSON.parse(cached) as T;
    }

    logger.debug('Cache miss (Redis)', { key: fullKey }, 'CacheService');
    return null;
  }

  const entry = memoryCache.get(fullKey);

  if (entry) {
    if (entry.expiresAt > Date.now()) {
      logger.debug('Cache hit (Memory)', { key: fullKey }, 'CacheService');
      return entry.value as T;
    }
    memoryCache.delete(fullKey);
    logger.debug('Cache expired (Memory)', { key: fullKey }, 'CacheService');
  }

  logger.debug('Cache miss (Memory)', { key: fullKey }, 'CacheService');
  return null;
}

/**
 * Set value in cache
 *
 * @description Stores a value in cache (Redis or in-memory) with optional TTL.
 * Serializes the value to JSON before storing.
 *
 * @param {string} key - Cache key
 * @param {T} value - Value to cache
 * @param {CacheOptions} [options={}] - Cache options (ttl, namespace, etc.)
 * @returns {Promise<void>}
 *
 * @example
 * ```typescript
 * await setCache('user:123', userData, {
 *   namespace: CACHE_KEYS.USER,
 *   ttl: DEFAULT_TTLS.USER
 * });
 * ```
 */
export async function setCache<T>(
  key: string,
  value: T,
  options: CacheOptions = {}
): Promise<void> {
  const fullKey = options.namespace ? `${options.namespace}:${key}` : key;
  const ttl = options.ttl || 300;

  const serialized = JSON.stringify(value);
  const client = getRedisClient();

  if (client) {
    await client.set(fullKey, serialized, 'EX', ttl);
    logger.debug('Cache set (Redis)', { key: fullKey, ttl }, 'CacheService');
    return;
  }

  const expiresAt = Date.now() + ttl * 1000;
  memoryCache.set(fullKey, { value, expiresAt });
  logger.debug('Cache set (Memory)', { key: fullKey, ttl }, 'CacheService');
}

/**
 * Invalidate cache entry
 *
 * @description Removes a specific cache entry from both Redis and in-memory cache.
 *
 * @param {string} key - Cache key to invalidate
 * @param {CacheOptions} [options={}] - Cache options (namespace, etc.)
 * @returns {Promise<void>}
 *
 * @example
 * ```typescript
 * await invalidateCache('user:123', { namespace: CACHE_KEYS.USER });
 * ```
 */
export async function invalidateCache(
  key: string,
  options: CacheOptions = {}
): Promise<void> {
  const fullKey = options.namespace ? `${options.namespace}:${key}` : key;

  const client = getRedisClient();
  if (client) {
    await client.del(fullKey);
    logger.debug('Cache invalidated (Redis)', { key: fullKey }, 'CacheService');
  }

  memoryCache.delete(fullKey);
  logger.debug('Cache invalidated (Memory)', { key: fullKey }, 'CacheService');
}

/**
 * Invalidate cache entries matching a pattern
 *
 * @description Removes all cache entries matching a pattern. Uses SCAN for
 * Redis to efficiently find matching keys.
 *
 * @param {string} pattern - Pattern to match (e.g., 'user:*')
 * @param {CacheOptions} [options={}] - Cache options (namespace, etc.)
 * @returns {Promise<void>}
 *
 * @example
 * ```typescript
 * await invalidateCachePattern('user:*', { namespace: CACHE_KEYS.USER });
 * ```
 */
export async function invalidateCachePattern(
  pattern: string,
  options: CacheOptions = {}
): Promise<void> {
  const fullPattern = options.namespace
    ? `${options.namespace}:${pattern}`
    : pattern;

  // Invalidate in Redis
  const client = getRedisClient();
  if (client) {
    // Use SCAN to find matching keys
    const stream = client.scanStream({ match: fullPattern });
    const keys: string[] = [];

    stream.on('data', (resultKeys: string[]) => {
      keys.push(...resultKeys);
    });

    await new Promise<void>((resolve, reject) => {
      stream.on('end', () => resolve());
      stream.on('error', reject);
    });

    if (keys.length > 0) {
      await client.del(...keys);
      logger.info(
        'Cache pattern invalidated (Redis)',
        { pattern: fullPattern, count: keys.length },
        'CacheService'
      );
    }
  }

  // Invalidate in memory cache
  const memoryKeys = Array.from(memoryCache.keys()).filter((key) =>
    key.includes(pattern)
  );
  memoryKeys.forEach((key) => memoryCache.delete(key));

  if (memoryKeys.length > 0) {
    logger.debug(
      'Cache pattern invalidated (Memory)',
      { pattern: fullPattern, count: memoryKeys.length },
      'CacheService'
    );
  }
}

/**
 * Get or set pattern - fetch from cache or execute function and cache result
 *
 * @description Implements the cache-aside pattern with thundering herd protection.
 * Checks cache first, and if not found (or probabilistically expired early),
 * executes the fetch function and caches the result.
 *
 * THUNDERING HERD PROTECTION:
 * Uses probabilistic early expiration to prevent all cache entries from expiring
 * at the same time and causing a database stampede. As cache approaches expiration,
 * there's an increasing probability that a request will refresh early.
 *
 * @param {string} key - Cache key
 * @param {() => Promise<T>} fetchFn - Function to fetch data if cache miss
 * @param {CacheOptions} [options={}] - Cache options (ttl, namespace, etc.)
 * @returns {Promise<T>} Cached or freshly fetched value
 *
 * @example
 * ```typescript
 * const posts = await getCacheOrFetch(
 *   'posts:recent',
 *   () => db().getRecentPosts(100),
 *   { namespace: CACHE_KEYS.POSTS_LIST, ttl: DEFAULT_TTLS.POSTS_LIST }
 * );
 * ```
 */
export async function getCacheOrFetch<T>(
  key: string,
  fetchFn: () => Promise<T>,
  options: CacheOptions = {}
): Promise<T> {
  const fullKey = options.namespace ? `${options.namespace}:${key}` : key;
  const ttl = options.ttl || 300;

  // Try to get from cache with TTL info for thundering herd protection
  const client = getRedisClient();
  let cached: T | null = null;
  let remainingTtl = 0;

  if (client) {
    // Get both value and TTL in pipeline for efficiency
    const [valueResult, ttlResult] = await Promise.all([
      client.get(fullKey),
      client.ttl(fullKey),
    ]);

    if (valueResult !== null && valueResult !== undefined && valueResult.trim() !== '') {
      cached = JSON.parse(valueResult) as T;
      remainingTtl = ttlResult > 0 ? ttlResult : 0;
    }
  } else {
    // In-memory fallback
    const entry = memoryCache.get(fullKey);
    if (entry && entry.expiresAt > Date.now()) {
      cached = entry.value as T;
      remainingTtl = Math.floor((entry.expiresAt - Date.now()) / 1000);
    }
  }

  // If we have cached data, apply thundering herd protection
  if (cached !== null && remainingTtl > 0) {
    // Probabilistic early expiration formula:
    // probability = beta * ln(random) * -1 > remainingTtl / ttl
    // This gives increasing probability of refresh as expiration approaches
    const random = Math.random();
    const earlyExpirationThreshold = remainingTtl / ttl;
    const shouldRefreshEarly =
      THUNDERING_HERD_BETA * Math.log(random) * -1 > earlyExpirationThreshold * 5;

    if (shouldRefreshEarly) {
      logger.debug(
        'Thundering herd: early refresh triggered',
        { key: fullKey, remainingTtl, ttl },
        'CacheService'
      );
      // Refresh in background, return cached data immediately
      void (async () => {
        try {
          const freshData = await fetchFn();
          await setCache(key, freshData, options);
        } catch (error) {
          logger.warn(
            'Background cache refresh failed',
            { key: fullKey, error },
            'CacheService'
          );
        }
      })();
    }

    return cached;
  }

  // Cache miss or expired - fetch from source
  logger.debug('Fetching data for cache', { key }, 'CacheService');
  const data = await fetchFn();

  // Cache the result
  await setCache(key, data, options);

  return data;
}

/**
 * Warm up cache with data
 *
 * @description Pre-populates cache with data. Alias for setCache for semantic clarity.
 *
 * @param {string} key - Cache key
 * @param {T} value - Value to cache
 * @param {CacheOptions} [options={}] - Cache options
 * @returns {Promise<void>}
 */
export async function warmCache<T>(
  key: string,
  value: T,
  options: CacheOptions = {}
): Promise<void> {
  await setCache(key, value, options);
}

// ============================================================================
// Batch Operations for Scale Optimization
// ============================================================================

/**
 * Get multiple values from cache in a single operation
 *
 * @description Retrieves multiple values from cache efficiently using Redis MGET
 * or batch memory lookups. Returns a Map of key -> value for found entries.
 *
 * PERFORMANCE: At 400k+ users, this is significantly faster than N individual
 * cache lookups. Reduces Redis round-trips from N to 1.
 *
 * @param {string[]} keys - Array of cache keys
 * @param {CacheOptions} [options={}] - Cache options (namespace, etc.)
 * @returns {Promise<Map<string, T>>} Map of key to cached value (missing keys not included)
 *
 * @example
 * ```typescript
 * const userIds = ['user1', 'user2', 'user3'];
 * const cachedUsers = await getCacheBatch<User>(userIds, { namespace: 'user' });
 * const missingIds = userIds.filter(id => !cachedUsers.has(id));
 * ```
 */
export async function getCacheBatch<T>(
  keys: string[],
  options: CacheOptions = {}
): Promise<Map<string, T>> {
  if (keys.length === 0) {
    return new Map();
  }

  const result = new Map<string, T>();
  const fullKeys = keys.map((key) =>
    options.namespace ? `${options.namespace}:${key}` : key
  );
  const keyToOriginal = new Map(fullKeys.map((fk, i) => [fk, keys[i]]));

  const client = getRedisClient();
  if (client) {
    try {
      // Use MGET for batch retrieval
      const values = await client.mget(...fullKeys);

      for (let i = 0; i < fullKeys.length; i++) {
        const value = values[i];
        const originalKey = keys[i];

        if (
          originalKey !== undefined &&
          value !== null &&
          value !== undefined &&
          value.trim() !== ''
        ) {
          try {
            result.set(originalKey, JSON.parse(value) as T);
          } catch {
            logger.warn(
              'Failed to parse cached value',
              { key: fullKeys[i] },
              'CacheService'
            );
          }
        }
      }

      logger.debug(
        'Batch cache get (Redis)',
        { requested: keys.length, found: result.size },
        'CacheService'
      );
      return result;
    } catch (error) {
      logger.warn(
        'Batch cache get failed, falling back to memory',
        { error },
        'CacheService'
      );
    }
  }

  // In-memory fallback
  const now = Date.now();
  for (const fullKey of fullKeys) {
    const originalKey = keyToOriginal.get(fullKey)!;
    const entry = memoryCache.get(fullKey);

    if (entry && entry.expiresAt > now) {
      result.set(originalKey, entry.value as T);
    }
  }

  logger.debug(
    'Batch cache get (Memory)',
    { requested: keys.length, found: result.size },
    'CacheService'
  );
  return result;
}

/**
 * Set multiple values in cache in a single operation
 *
 * @description Stores multiple values in cache efficiently using Redis pipeline
 * or batch memory updates.
 *
 * PERFORMANCE: Reduces Redis round-trips from N to 1 for bulk cache population.
 *
 * @param {Map<string, T> | Array<[string, T]>} entries - Map or array of [key, value] pairs
 * @param {CacheOptions} [options={}] - Cache options (ttl, namespace, etc.)
 * @returns {Promise<void>}
 *
 * @example
 * ```typescript
 * const users = new Map([['user1', userData1], ['user2', userData2]]);
 * await setCacheBatch(users, { namespace: 'user', ttl: 300 });
 * ```
 */
export async function setCacheBatch<T>(
  entries: Map<string, T> | Array<[string, T]>,
  options: CacheOptions = {}
): Promise<void> {
  const entriesArray = entries instanceof Map ? Array.from(entries) : entries;

  if (entriesArray.length === 0) {
    return;
  }

  const ttl = options.ttl || 300;

  const client = getRedisClient();
  if (client) {
    try {
      // Use pipeline for batch set
      const pipeline = client.pipeline();

      for (const [key, value] of entriesArray) {
        const fullKey = options.namespace ? `${options.namespace}:${key}` : key;
        const serialized = JSON.stringify(value);
        pipeline.set(fullKey, serialized, 'EX', ttl);
      }

      await pipeline.exec();

      logger.debug(
        'Batch cache set (Redis)',
        { count: entriesArray.length, ttl },
        'CacheService'
      );
      return;
    } catch (error) {
      logger.warn(
        'Batch cache set failed, falling back to memory',
        { error },
        'CacheService'
      );
    }
  }

  // In-memory fallback
  const expiresAt = Date.now() + ttl * 1000;

  for (const [key, value] of entriesArray) {
    const fullKey = options.namespace ? `${options.namespace}:${key}` : key;
    memoryCache.set(fullKey, { value, expiresAt });
  }

  logger.debug(
    'Batch cache set (Memory)',
    { count: entriesArray.length, ttl },
    'CacheService'
  );
}

/**
 * Batch get or fetch pattern - efficiently fetches multiple items with caching
 *
 * @description Combines getCacheBatch with a batch fetch function for cache misses.
 * This is the recommended pattern for bulk data retrieval at scale.
 *
 * Algorithm:
 * 1. Check cache for all keys (single Redis MGET)
 * 2. For missing keys, call fetchFn with all missing keys at once
 * 3. Cache fetched values (single Redis pipeline)
 * 4. Return combined results
 *
 * @param {string[]} keys - Array of keys to fetch
 * @param {(keys: string[]) => Promise<Map<string, T>>} fetchFn - Batch fetch function for cache misses
 * @param {CacheOptions} [options={}] - Cache options
 * @returns {Promise<Map<string, T>>} Map of key to value for all found items
 *
 * @example
 * ```typescript
 * const users = await getCacheBatchOrFetch(
 *   userIds,
 *   async (missingIds) => {
 *     const rows = await db.select().from(users).where(inArray(users.id, missingIds));
 *     return new Map(rows.map(r => [r.id, r]));
 *   },
 *   { namespace: 'user', ttl: 300 }
 * );
 * ```
 */
export async function getCacheBatchOrFetch<T>(
  keys: string[],
  fetchFn: (keys: string[]) => Promise<Map<string, T>>,
  options: CacheOptions = {}
): Promise<Map<string, T>> {
  if (keys.length === 0) {
    return new Map();
  }

  // Step 1: Check cache for all keys
  const cachedValues = await getCacheBatch<T>(keys, options);

  // Step 2: Find missing keys
  const missingKeys = keys.filter((key) => !cachedValues.has(key));

  if (missingKeys.length === 0) {
    logger.debug(
      'Batch cache hit (all)',
      { count: keys.length },
      'CacheService'
    );
    return cachedValues;
  }

  // Step 3: Fetch missing values
  logger.debug(
    'Batch cache miss',
    { cached: cachedValues.size, missing: missingKeys.length },
    'CacheService'
  );

  const fetchedValues = await fetchFn(missingKeys);

  // Step 4: Cache fetched values
  if (fetchedValues.size > 0) {
    await setCacheBatch(fetchedValues, options);
  }

  // Step 5: Combine and return
  for (const [key, value] of fetchedValues) {
    cachedValues.set(key, value);
  }

  return cachedValues;
}

/**
 * Get cache statistics (memory cache only)
 *
 * @description Returns statistics about the in-memory cache, including entry counts
 * and Redis availability. Useful for monitoring and debugging.
 *
 * @returns {object} Cache statistics including totalEntries, activeEntries, expiredEntries,
 * redisAvailable
 */
export function getCacheStats() {
  const now = Date.now();
  let activeEntries = 0;
  let expiredEntries = 0;

  memoryCache.forEach((entry) => {
    if (entry.expiresAt > now) {
      activeEntries++;
    } else {
      expiredEntries++;
    }
  });

  return {
    totalEntries: memoryCache.size,
    activeEntries,
    expiredEntries,
    redisAvailable: isRedisAvailable(),
  };
}

/**
 * Clear all cache (use with caution!)
 *
 * @description Clears all in-memory cache entries. Redis cache clearing is not
 * implemented for safety reasons (to avoid clearing other application data).
 *
 * @returns {Promise<void>}
 *
 * @warning Use with extreme caution! This will clear all cached data and may
 * impact application performance.
 */
export async function clearAllCache(): Promise<void> {
  logger.warn('Clearing all cache', undefined, 'CacheService');

  // Clear memory cache
  memoryCache.clear();

  // Clear Redis cache (if available and safe to do)
  if (isRedisAvailable()) {
    // Only clear our namespaced keys, not the entire Redis instance
    logger.warn(
      'Redis cache clear requested but not implemented for safety',
      undefined,
      'CacheService'
    );
  }
}
