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
 * - Support for both Upstash (REST API) and standard Redis
 */

import type { Redis as UpstashRedis } from '@upstash/redis';
import type IORedis from 'ioredis';
import { logger } from './logger';
import { redis, redisClientType } from './redis';
// import { performanceMonitor } from './monitoring/performance-monitor';

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
} as const;

/**
 * Default TTLs for different data types (in seconds)
 *
 * @description Default time-to-live values for different data types based on
 * their change frequency. Real-time data has short TTLs, rarely changing data
 * has long TTLs.
 */
export const DEFAULT_TTLS = {
  // Real-time data - very short TTL
  POSTS_LIST: 10, // 10 seconds
  POSTS_FOLLOWING: 15, // 15 seconds

  // Semi-real-time data - short TTL
  POST: 30, // 30 seconds
  USER_BALANCE: 30, // 30 seconds
  MARKET: 60, // 1 minute
  MARKETS_LIST: 60, // 1 minute

  // Moderate change frequency - medium TTL
  USER: 300, // 5 minutes
  TRENDING_TAGS: 300, // 5 minutes
  WIDGET: 300, // 5 minutes

  // Rarely changing data - long TTL
  ACTOR: 3600, // 1 hour
  ORGANIZATION: 3600, // 1 hour
  POSTS_BY_ACTOR: 120, // 2 minutes (actors post regularly)
} as const;

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
 * if not found or expired. Handles both Upstash REST API and standard Redis protocols.
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
  // const startTime = performance.now();

  if (redis && redisClientType) {
    const cached = await redis.get(fullKey);

    if (cached) {
      try {
        // Handle cached value based on its type
        // Upstash Redis REST API may return objects directly if the value was JSON
        if (typeof cached === 'object' && cached !== null) {
          logger.debug(
            'Cache hit (Redis, object)',
            { key: fullKey },
            'CacheService'
          );
          return cached as T;
        }

        // Handle primitive values that might be returned directly by Upstash
        if (typeof cached === 'number' || typeof cached === 'boolean') {
          logger.debug(
            `Cache hit (Redis, ${typeof cached})`,
            { key: fullKey },
            'CacheService'
          );
          return cached as T;
        }

        // Handle string values (standard Redis behavior)
        if (typeof cached === 'string') {
          if (!cached || cached.trim() === '') {
            logger.warn(
              'Empty cached value in Redis',
              { key: fullKey },
              'CacheService'
            );
            return null;
          }

          logger.debug(
            'Cache hit (Redis, string)',
            { key: fullKey },
            'CacheService'
          );
          return JSON.parse(cached) as T;
        }

        // Unexpected type
        logger.warn(
          'Unexpected cached value type',
          {
            key: fullKey,
            cachedType: typeof cached,
          },
          'CacheService'
        );
        return null;
      } catch (error) {
        // Safely preview cached value for logging
        let preview = 'Unable to preview';
        if (typeof cached === 'string') {
          preview = cached.substring(0, 100);
        } else if (cached !== null && cached !== undefined) {
          preview = String(cached).substring(0, 100);
        }

        // Log warning - will fetch from DB and refresh cache
        logger.warn(
          `Failed to parse cached value: ${preview}`,
          {
            key: fullKey,
            error:
              error instanceof Error
                ? {
                    name: error.name,
                    message: error.message,
                    stack: error.stack,
                  }
                : String(error),
            cachedType: typeof cached,
            preview,
          },
          'CacheService'
        );
        // Return null to trigger a fresh fetch from DB and cache refresh
        return null;
      }
    }

    logger.debug('Cache miss (Redis)', { key: fullKey }, 'CacheService');
    // const latency = performance.now() - startTime;
    // performanceMonitor.recordCacheOperation('get', false, latency);
    return null;
  }

  const entry = memoryCache.get(fullKey);

  if (entry) {
    if (entry.expiresAt > Date.now()) {
      logger.debug('Cache hit (Memory)', { key: fullKey }, 'CacheService');
      // const latency = performance.now() - startTime;
      // const bytes = JSON.stringify(entry.value).length;
      // performanceMonitor.recordCacheOperation('get', true, latency, bytes);
      return entry.value as T;
    }
    memoryCache.delete(fullKey);
    logger.debug('Cache expired (Memory)', { key: fullKey }, 'CacheService');
  }

  logger.debug('Cache miss (Memory)', { key: fullKey }, 'CacheService');
  // const latency = performance.now() - startTime;
  // performanceMonitor.recordCacheOperation('get', false, latency);
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
  // const startTime = performance.now();

  const serialized = JSON.stringify(value);
  // const bytes = serialized.length;

  if (redis && redisClientType) {
    if (redisClientType === 'upstash') {
      await (redis as UpstashRedis).set(fullKey, serialized, { ex: ttl });
    } else {
      await (redis as IORedis).set(fullKey, serialized, 'EX', ttl);
    }
    logger.debug('Cache set (Redis)', { key: fullKey, ttl }, 'CacheService');
    // const latency = performance.now() - startTime;
    // performanceMonitor.recordCacheOperation('set', true, latency, bytes);
    return;
  }

  const expiresAt = Date.now() + ttl * 1000;
  memoryCache.set(fullKey, { value, expiresAt });
  logger.debug('Cache set (Memory)', { key: fullKey, ttl }, 'CacheService');
  // const latency = performance.now() - startTime;
  // performanceMonitor.recordCacheOperation('set', true, latency, bytes);
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

  if (redis && redisClientType) {
    await redis.del(fullKey);
    logger.debug('Cache invalidated (Redis)', { key: fullKey }, 'CacheService');
  }

  memoryCache.delete(fullKey);
  logger.debug('Cache invalidated (Memory)', { key: fullKey }, 'CacheService');
}

/**
 * Invalidate cache entries matching a pattern
 *
 * @description Removes all cache entries matching a pattern. Uses SCAN for standard
 * Redis, but pattern matching is limited with Upstash REST API.
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
  if (redis && redisClientType === 'upstash') {
    // Upstash Redis doesn't support SCAN, so we'll need to track keys manually
    // For now, log a warning
    logger.warn(
      'Pattern invalidation not fully supported with Upstash Redis',
      { pattern: fullPattern },
      'CacheService'
    );
  } else if (redis && redisClientType === 'standard') {
    // For standard Redis, use SCAN to find matching keys
    const ioRedis = redis as {
      scanStream: (opts: { match: string }) => NodeJS.ReadableStream;
      del: (...keys: string[]) => Promise<unknown>;
    };
    const stream = ioRedis.scanStream({ match: fullPattern });
    const keys: string[] = [];

    stream.on('data', (resultKeys: string[]) => {
      keys.push(...resultKeys);
    });

    await new Promise<void>((resolve, reject) => {
      stream.on('end', () => resolve());
      stream.on('error', reject);
    });

    if (keys.length > 0) {
      await ioRedis.del(...keys);
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
 * @description Implements the cache-aside pattern. Checks cache first, and if
 * not found, executes the fetch function and caches the result.
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
  // Try to get from cache
  const cached = await getCache<T>(key, options);

  if (cached !== null) {
    return cached;
  }

  // Cache miss - fetch from source
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

/**
 * Get cache statistics (memory cache only)
 *
 * @description Returns statistics about the in-memory cache, including entry counts
 * and Redis availability. Useful for monitoring and debugging.
 *
 * @returns {object} Cache statistics including totalEntries, activeEntries, expiredEntries,
 * redisAvailable, and redisType
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
    redisAvailable: !!redis,
    redisType: redisClientType,
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
  if (redis && redisClientType === 'standard') {
    // Only clear our namespaced keys, not the entire Redis instance
    logger.warn(
      'Redis cache clear requested but not implemented for safety',
      undefined,
      'CacheService'
    );
  }
}
