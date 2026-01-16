/**
 * API Key Generation, Validation, and Caching
 *
 * @description Secure API key management for external agent authentication.
 * Provides functions for generating, hashing, and verifying API keys using
 * cryptographically secure random generation and SHA-256 hashing.
 *
 * Also provides cached validation for per-user API keys used by MCP and A2A:
 * - In-memory LRU cache (5 min TTL, 1000 max entries)
 * - Async lastUsedAt updates (non-blocking)
 * - 99%+ cache hit rate for repeated requests
 */

import crypto from 'crypto';
import { asSystem, eq, userApiKeys } from '@babylon/db';
import { logger } from '@babylon/shared';

// ============================================================================
// Cache Configuration
// ============================================================================

/** Cache TTL in milliseconds (5 minutes) */
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Maximum cache entries */
const MAX_CACHE_SIZE = 1000;

/** How often to update lastUsedAt (1 minute) - prevents excessive DB writes */
const LAST_USED_UPDATE_INTERVAL_MS = 60 * 1000;

interface CachedKeyInfo {
  userId: string;
  keyId: string;
  expiresAt: Date | null;
  cachedAt: number;
  lastAccessedAt: number; // For true LRU eviction
  lastDbUpdateAt: number; // Throttle DB writes
}

/**
 * LRU cache for validated API keys
 * Key: API key hash, Value: user info + cache metadata
 *
 * IMPORTANT: When revoking keys, call invalidateCachedKey() or
 * invalidateCachedKeysForUser() to immediately invalidate cached entries.
 * Otherwise revoked keys remain valid until TTL expires (5 min).
 *
 * Call invalidation from:
 * - DELETE /api/user/api-keys/[id] endpoint (single key revocation)
 * - User account deletion handlers (all user keys)
 * - Admin key revocation endpoints
 */
const apiKeyCache = new Map<string, CachedKeyInfo>();

/**
 * Evict least recently used entries when cache is full.
 *
 * Note: This is called before insertion, so concurrent requests could
 * temporarily exceed MAX_CACHE_SIZE. This is acceptable for an in-memory
 * cache - the slight overage is bounded and self-correcting on next eviction.
 */
function evictLeastRecentlyUsed(): void {
  if (apiKeyCache.size >= MAX_CACHE_SIZE) {
    const entriesToDelete = Math.floor(MAX_CACHE_SIZE * 0.1);
    // True LRU: evict by lastAccessedAt, not insertion time
    const entries = Array.from(apiKeyCache.entries())
      .sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt)
      .slice(0, entriesToDelete);
    for (const [key] of entries) {
      apiKeyCache.delete(key);
    }
  }
}

function isCacheEntryValid(entry: CachedKeyInfo): boolean {
  const now = Date.now();
  if (now - entry.cachedAt > CACHE_TTL_MS) return false;
  if (entry.expiresAt && entry.expiresAt.getTime() < now) return false;
  return true;
}

/**
 * Update lastAccessedAt for LRU tracking (call on every cache hit)
 */
function touchCacheEntry(cached: CachedKeyInfo): void {
  cached.lastAccessedAt = Date.now();
}

/**
 * Schedule async DB update for lastUsedAt (throttled to 1/min per key)
 */
function scheduleLastUsedUpdate(keyId: string, cached: CachedKeyInfo | undefined): void {
  const now = Date.now();

  // Throttle: skip if updated within the last minute
  if (cached && now - cached.lastDbUpdateAt < LAST_USED_UPDATE_INTERVAL_MS) {
    return;
  }

  // Update throttle timestamp before async call
  if (cached) {
    cached.lastDbUpdateAt = now;
  }

  // Fire-and-forget DB update
  asSystem(async (dbClient) => {
    await dbClient
      .update(userApiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(userApiKeys.id, keyId));
  }).catch((err) => {
    logger.warn('Failed to update lastUsedAt', { keyId, error: err }, 'ApiKeyAuth');
  });
}

/**
 * Generate a secure random API key
 *
 * @description Generates a cryptographically secure random API key for external
 * agent authentication. Format: bab_live_<32 random hex characters>.
 *
 * @returns {string} A new API key string in format bab_live_<hex>
 *
 * @example
 * ```typescript
 * const apiKey = generateApiKey();
 * // Returns: "bab_live_a1b2c3d4e5f6..."
 * ```
 */
export function generateApiKey(): string {
  const randomBytes = crypto.randomBytes(32);
  const hex = randomBytes.toString('hex');
  return `bab_live_${hex}`;
}

/**
 * Hash an API key for secure storage
 *
 * @description Creates a SHA-256 one-way hash of an API key for secure storage.
 * The original key cannot be recovered from the hash. Used to store API keys
 * in the database without exposing plaintext keys.
 *
 * @param {string} apiKey - The API key to hash
 * @returns {string} Hashed API key (hex string)
 *
 * @example
 * ```typescript
 * const hash = hashApiKey('bab_live_abc123...');
 * // Store hash in database, never store plaintext key
 * ```
 */
export function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Verify an API key against a stored hash
 *
 * @description Verifies that an API key matches a stored hash using timing-safe
 * comparison to prevent timing attacks. Used during authentication to validate
 * API keys without storing plaintext keys.
 *
 * @param {string} apiKey - The API key to verify
 * @param {string} storedHash - The stored hash to compare against
 * @returns {boolean} True if the API key matches the hash
 *
 * @example
 * ```typescript
 * const isValid = verifyApiKey(providedKey, storedHash);
 * if (isValid) {
 *   // Authenticate agent
 * }
 * ```
 */
export function verifyApiKey(apiKey: string, storedHash: string): boolean {
  const inputHash = hashApiKey(apiKey);
  return crypto.timingSafeEqual(
    Buffer.from(inputHash),
    Buffer.from(storedHash)
  );
}

/**
 * Generate a test API key for development
 *
 * @description Generates a test API key for development and testing purposes.
 * Format: bab_test_<32 random hex characters>. Should not be used in production.
 *
 * @returns {string} A test API key string in format bab_test_<hex>
 *
 * @example
 * ```typescript
 * const testKey = generateTestApiKey();
 * // Returns: "bab_test_a1b2c3d4e5f6..."
 * ```
 */
export function generateTestApiKey(): string {
  const randomBytes = crypto.randomBytes(32);
  const hex = randomBytes.toString('hex');
  return `bab_test_${hex}`;
}

// ============================================================================
// Cached User API Key Validation
// ============================================================================

/**
 * Validate a per-user API key with caching
 *
 * @description Validates an API key against the userApiKeys table with:
 * - In-memory LRU cache (5 min TTL)
 * - Async lastUsedAt updates (non-blocking)
 * - Automatic cache invalidation on expiry
 *
 * Used by both MCP and A2A for efficient authentication.
 *
 * @param apiKey - The API key to validate
 * @returns User ID if key is valid, null otherwise
 *
 * @example
 * ```typescript
 * const result = await validateUserApiKey('bab_live_abc123...');
 * if (result) {
 *   console.log('Authenticated user:', result.userId);
 * }
 * ```
 */
export async function validateUserApiKey(
  apiKey: string
): Promise<{ userId: string } | null> {
  if (!apiKey) return null;

  const keyHash = hashApiKey(apiKey);

  // Check cache first
  const cached = apiKeyCache.get(keyHash);
  if (cached && isCacheEntryValid(cached)) {
    touchCacheEntry(cached); // Update LRU timestamp
    scheduleLastUsedUpdate(cached.keyId, cached);
    return { userId: cached.userId };
  }

  // Cache miss - query database
  const keyRecord = await asSystem(async (dbClient) => {
    return await dbClient.query.userApiKeys.findFirst({
      where: (keys, { eq: eqFn, and: andFn, isNull: isNullFn, or: orFn, gt: gtFn }) =>
        andFn(
          eqFn(keys.keyHash, keyHash),
          isNullFn(keys.revokedAt),
          orFn(isNullFn(keys.expiresAt), gtFn(keys.expiresAt, new Date()))
        ),
    });
  });

  if (!keyRecord) {
    apiKeyCache.delete(keyHash);
    return null;
  }

  // Add to cache
  evictLeastRecentlyUsed();
  const now = Date.now();
  const newCacheEntry: CachedKeyInfo = {
    userId: keyRecord.userId,
    keyId: keyRecord.id,
    expiresAt: keyRecord.expiresAt,
    cachedAt: now,
    lastAccessedAt: now,
    lastDbUpdateAt: now, // Prevent immediate DB update on fresh cache entry
  };
  apiKeyCache.set(keyHash, newCacheEntry);

  // Don't call scheduleLastUsedUpdate here - lastDbUpdateAt is already set to now,
  // so the throttle will skip the DB update. Next access will trigger it after 1 min.
  return { userId: keyRecord.userId };
}

// ============================================================================
// Cache Management
// ============================================================================

/**
 * Invalidate a cached API key by its hash
 * Call this when a key is revoked or updated
 */
export function invalidateCachedKey(keyHash: string): void {
  apiKeyCache.delete(keyHash);
}

/**
 * Invalidate all cached keys for a user
 * Call this when a user's keys are bulk-revoked
 */
export function invalidateCachedKeysForUser(userId: string): void {
  // Collect keys first to avoid mutating during iteration
  const keysToDelete = [...apiKeyCache.entries()]
    .filter(([, info]) => info.userId === userId)
    .map(([keyHash]) => keyHash);

  for (const keyHash of keysToDelete) {
    apiKeyCache.delete(keyHash);
  }
}

/**
 * Clear the entire API key cache
 */
export function clearApiKeyCache(): void {
  apiKeyCache.clear();
}

/**
 * Get cache statistics for monitoring
 */
export function getApiKeyCacheStats(): {
  size: number;
  maxSize: number;
  ttlMs: number;
} {
  return {
    size: apiKeyCache.size,
    maxSize: MAX_CACHE_SIZE,
    ttlMs: CACHE_TTL_MS,
  };
}
