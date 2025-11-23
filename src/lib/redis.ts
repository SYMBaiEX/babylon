/**
 * Redis Client - Common interface for both local and production Redis
 * 
 * Local Development:
 * - Uses standard Redis protocol via ioredis
 * - Connects to local Docker Redis (REDIS_URL=redis://localhost:6379)
 * 
 * Vercel Production:
 * - Uses Upstash REST API via @upstash/redis
 * - Connects to Upstash Redis (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN)
 * 
 * Falls back gracefully if Redis is not configured.
 */

import { Redis as UpstashRedis } from '@upstash/redis'
import IORedis from 'ioredis'
import { logger } from './logger'
import type { JsonValue } from '@/types/common'

// Redis client types
type RedisClient = UpstashRedis | IORedis | null

// Check if Upstash Redis is configured (Vercel production)
const hasUpstashConfig = () => {
  return !!((process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) && (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN))
}

// Check if standard Redis URL is configured (local development)
const hasStandardRedisUrl = () => {
  return !!process.env.REDIS_URL
}

// Create Redis client based on available configuration
let redisClient: RedisClient = null
let redisType: 'upstash' | 'standard' | null = null
let isClosing = false
const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build'
const isTestEnv = process.env.NODE_ENV === 'test'

// Skip Redis initialization during build time to avoid connection issues
if (isBuildTime || isTestEnv) {
  logger.info(
    isTestEnv
      ? 'Test environment detected - skipping Redis initialization'
      : 'Build time detected - skipping Redis initialization',
    undefined,
    'Redis'
  )
} else if (hasUpstashConfig()) {
  redisClient = new UpstashRedis({
    url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
  })
  redisType = 'upstash'
  logger.info('Redis client initialized (Upstash REST API)', undefined, 'Redis')
} else if (hasStandardRedisUrl()) {
  redisClient = new IORedis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
      if (times > 3) {
        return null
      }
      return Math.min(times * 100, 2000)
    },
    lazyConnect: true,
  })
  redisType = 'standard'
  
  void redisClient.connect().then(() => {
    logger.info('Redis client initialized (Standard Redis Protocol)', undefined, 'Redis')
  })
} else {
  logger.info('Redis not configured - SSE will use local-only broadcasting', undefined, 'Redis')
  logger.info('For local dev: Set REDIS_URL=redis://localhost:6379', undefined, 'Redis')
  logger.info('For production: Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN', undefined, 'Redis')
}

export const redis = redisClient
export const redisClientType = redisType

/**
 * Convert a payload object into Redis stream field/value pairs (stringified).
 * Keeps a single `payload` field to avoid field explosion.
 */
const encodeStreamPayload = (payload: Record<string, JsonValue>) => {
  return {
    payload: JSON.stringify(payload),
  }
}

/**
 * Add an entry to a Redis stream with optional trimming.
 */
export async function streamAdd(
  stream: string,
  payload: Record<string, JsonValue>,
  opts?: { maxlen?: number }
): Promise<string | null> {
  if (!redis) return null

  const entry = encodeStreamPayload(payload)

  if (redisType === 'upstash') {
    const trim =
      opts?.maxlen !== undefined
        ? {
            type: 'MAXLEN' as const,
            threshold: opts.maxlen,
            comparison: '~' as const,
            limit: Math.max(1000, Math.min(opts.maxlen * 2, 50000)),
          }
        : undefined

    return await (redis as UpstashRedis).xadd(
      stream,
      '*',
      entry,
      trim ? { trim } : undefined
    )
  }

  if (redisType === 'standard') {
    // Build args in correct Redis XADD order:
    // XADD key [MAXLEN [= | ~] threshold] <* | id> field value [field value ...]
    // See: https://redis.io/docs/latest/commands/xadd/
    const args: (string | number)[] = [stream]

    // MAXLEN must come after the stream key and before the entry ID
    if (opts?.maxlen !== undefined) {
      args.push('MAXLEN', '~', opts.maxlen)
    }

    args.push('*')
    Object.entries(entry).forEach(([key, value]) => {
      args.push(key, String(value))
    })

    return await (redis as IORedis).xadd(...(args as [string, string]))
  }

  return null
}

export interface StreamMessage<T = Record<string, unknown>> {
  stream: string
  id: string
  payload: T
}

/**
 * Read entries from Redis streams starting from the provided IDs.
 *
 * Note: Upstash REST does not support BLOCK. We emulate a short-polling loop
 * on the caller side rather than relying on blocking reads.
 */
export async function streamRead(
  streams: string[],
  ids: string[],
  opts?: { count?: number }
): Promise<StreamMessage[]> {
  if (!redis || streams.length === 0 || ids.length === 0) return []

  try {
    if (redisType === 'upstash') {
      const res = (await (redis as UpstashRedis).xread(streams, ids, {
        count: opts?.count,
      })) as unknown

      // Upstash returns: [[streamName, [[id, [field, value, ...]], ...]], ...]
      const parsed: StreamMessage[] = []
      if (Array.isArray(res)) {
        for (const entry of res) {
          if (!Array.isArray(entry) || entry.length < 2) continue
          const [streamName, records] = entry as [string, unknown]
          if (!Array.isArray(records)) continue

          for (const record of records) {
            if (!Array.isArray(record) || record.length < 2) continue
            const [id, fields] = record as [string, unknown]
            if (!Array.isArray(fields)) continue

            const payload = extractPayload(fields)
            if (payload) {
              parsed.push({ stream: streamName, id, payload })
            }
          }
        }
      }
      return parsed
    }

    if (redisType === 'standard') {
    // ioredis xread requires literal tokens for type safety
    // See: https://redis.io/docs/latest/commands/xread/
    const ioredis = redis as IORedis
    const streamArgs = [...streams, ...ids] as string[]

    // Call appropriate overload based on whether COUNT is specified
    const res = opts?.count
      ? await ioredis.xread('COUNT', opts.count, 'STREAMS', ...streamArgs)
      : await ioredis.xread('STREAMS', ...streamArgs)

      // ioredis returns the same general structure as Redis CLI
      const parsed: StreamMessage[] = []
      if (Array.isArray(res)) {
        for (const streamEntry of res) {
          if (!Array.isArray(streamEntry) || streamEntry.length < 2) continue
          const [streamName, records] = streamEntry as [string, unknown]
          if (!Array.isArray(records)) continue
          for (const record of records) {
            if (!Array.isArray(record) || record.length < 2) continue
            const [id, fields] = record as [string, unknown]
            if (!Array.isArray(fields)) continue
            const payload = extractPayload(fields)
            if (payload) {
              parsed.push({ stream: streamName, id, payload })
            }
          }
        }
      }
      return parsed
    }
  } catch (error) {
    logger.warn('streamRead failed', { error }, 'Redis')
  }

  return []
}

const extractPayload = (fields: unknown[]): Record<string, unknown> | null => {
  const obj: Record<string, unknown> = {}
  for (let i = 0; i < fields.length; i += 2) {
    const key = fields[i]
    const value = fields[i + 1]
    if (typeof key === 'string') {
      obj[key] = value
    }
  }

  if (typeof obj.payload === 'string') {
    try {
      return JSON.parse(obj.payload)
    } catch {
      return { payload: obj.payload }
    }
  }

  return obj
}

/**
 * Check if Redis is available
 * 
 * @description Determines if a Redis client has been successfully initialized
 * and is available for use. Returns false if Redis is not configured or failed
 * to initialize.
 * 
 * @returns {boolean} True if Redis is available, false otherwise
 * 
 * @example
 * ```typescript
 * if (isRedisAvailable()) {
 *   await redis.set('key', 'value');
 * }
 * ```
 */
export function isRedisAvailable(): boolean {
  return redis !== null
}

/**
 * Safely publish to Redis (no-op if not available)
 * 
 * @description Publishes a message to a Redis channel. Works with both Upstash
 * REST API and standard Redis protocol. Returns false if Redis is not available.
 * Automatically sets channel expiration to 60 seconds.
 * 
 * @param {string} channel - Redis channel name
 * @param {string} message - Message to publish
 * @returns {Promise<boolean>} True if published successfully, false if Redis unavailable
 * 
 * @example
 * ```typescript
 * await safePublish('events', JSON.stringify({ type: 'user_login', userId: '123' }));
 * ```
 */
export async function safePublish(channel: string, message: string): Promise<boolean> {
  if (!redis) return false

  if (redisType === 'upstash') {
    await (redis as UpstashRedis).rpush(channel, message)
    await (redis as UpstashRedis).expire(channel, 60)
  } else if (redisType === 'standard') {
    await (redis as IORedis).rpush(channel, message)
    await (redis as IORedis).expire(channel, 60)
  }
  return true
}

/**
 * Safely poll Redis for messages (returns empty array if not available)
 * 
 * @description Polls a Redis channel for messages, removing them from the queue.
 * Works with both Upstash REST API and standard Redis protocol. Returns empty
 * array if Redis is not available or no messages found.
 * 
 * @param {string} channel - Redis channel name to poll
 * @param {number} count - Maximum number of messages to retrieve (default: 10)
 * @returns {Promise<string[]>} Array of messages, or empty array if none found/unavailable
 * 
 * @example
 * ```typescript
 * const messages = await safePoll('events', 20);
 * messages.forEach(msg => processMessage(JSON.parse(msg)));
 * ```
 */
export async function safePoll(channel: string, count: number = 10): Promise<string[]> {
  if (!redis) return []

  let messages: string[] | string | null = null

  if (redisType === 'upstash') {
    const result = await (redis as UpstashRedis).lpop(channel, count)
    messages = result as string[] | string | null
  } else if (redisType === 'standard') {
    const items: string[] = []
    for (let i = 0; i < count; i++) {
      const item = await (redis as IORedis).lpop(channel)
      if (!item) break
      items.push(item)
    }
    messages = items.length > 0 ? items : null
  }

  if (!messages) return []

  if (Array.isArray(messages)) {
    return messages.filter((m): m is string => typeof m === 'string')
  }
  return typeof messages === 'string' ? [messages] : []
}

/**
 * Cleanup Redis connection on shutdown
 * 
 * @description Gracefully closes the Redis connection. Only closes standard Redis
 * connections (not Upstash REST API). Safe to call multiple times. Used during
 * application shutdown to clean up resources.
 * 
 * @returns {Promise<void>} Promise that resolves when connection is closed
 * 
 * @example
 * ```typescript
 * // On application shutdown
 * await closeRedis();
 * ```
 */
export async function closeRedis(): Promise<void> {
  if (isClosing) return
  isClosing = true

  if (redis && redisType === 'standard') {
    const ioRedisClient = redis as IORedis
    if (ioRedisClient.status === 'ready' || ioRedisClient.status === 'connect') {
      await ioRedisClient.quit()
      logger.info('Redis connection closed', undefined, 'Redis')
    }
  }
}

// Cleanup on process exit (only if not build time)
if (typeof process !== 'undefined' && !isBuildTime) {
  process.on('SIGINT', () => {
    void closeRedis()
  })
  process.on('SIGTERM', () => {
    void closeRedis()
  })
}
