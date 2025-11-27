/**
 * Redis Streams Support
 *
 * @description Provides Redis Streams operations for pub/sub messaging.
 * Works with both Upstash REST API and standard Redis protocol.
 */

import { Redis as UpstashRedis } from '@upstash/redis';
import { logger } from '@babylon/shared';
import { redis, redisClientType } from './client';
import type { JsonValue } from '../types';

// Type for ioredis instance (avoid importing at top level to prevent bundling in edge runtime)
type IORedisInstance = {
  xadd: (...args: unknown[]) => Promise<string>;
  xread: (...args: unknown[]) => Promise<unknown>;
};

/**
 * Convert a payload object into Redis stream field/value pairs (stringified).
 * Keeps a single `payload` field to avoid field explosion.
 */
const encodeStreamPayload = (payload: Record<string, JsonValue>) => {
  return {
    payload: JSON.stringify(payload),
  };
};

/**
 * Add an entry to a Redis stream with optional trimming.
 *
 * @param {string} stream - Stream name
 * @param {Record<string, JsonValue>} payload - Payload to add
 * @param {{ maxlen?: number }} opts - Options (maxlen for trimming)
 * @returns {Promise<string | null>} Stream entry ID or null
 */
export async function streamAdd(
  stream: string,
  payload: Record<string, JsonValue>,
  opts?: { maxlen?: number }
): Promise<string | null> {
  if (!redis) return null;

  const entry = encodeStreamPayload(payload);

  if (redisClientType === 'upstash') {
    const trim =
      opts?.maxlen !== undefined
        ? {
            type: 'MAXLEN' as const,
            threshold: opts.maxlen,
            comparison: '~' as const,
            limit: Math.max(1000, Math.min(opts.maxlen * 2, 50000)),
          }
        : undefined;

    return await (redis as UpstashRedis).xadd(
      stream,
      '*',
      entry,
      trim ? { trim } : undefined
    );
  }

  if (redisClientType === 'standard') {
    // Build args in correct Redis XADD order:
    // XADD key [MAXLEN [= | ~] threshold] <* | id> field value [field value ...]
    const args: (string | number)[] = [stream];

    // MAXLEN must come after the stream key and before the entry ID
    if (opts?.maxlen !== undefined) {
      args.push('MAXLEN', '~', opts.maxlen);
    }

    args.push('*');
    Object.entries(entry).forEach(([key, value]) => {
      args.push(key, String(value));
    });

    // Type assertion needed because TS can't narrow union based on separate variable
    const ioredis = redis as unknown as IORedisInstance;
    return await ioredis.xadd(...(args as [string, string]));
  }

  return null;
}

export interface StreamMessage<T = Record<string, unknown>> {
  stream: string;
  id: string;
  payload: T;
}

/**
 * Extract payload from Redis stream fields
 */
const extractPayload = (fields: unknown[]): Record<string, unknown> | null => {
  const obj: Record<string, unknown> = {};
  for (let i = 0; i < fields.length; i += 2) {
    const key = fields[i];
    const value = fields[i + 1];
    if (typeof key === 'string') {
      obj[key] = value;
    }
  }

  if (typeof obj.payload === 'string') {
    try {
      return JSON.parse(obj.payload);
    } catch {
      return { payload: obj.payload };
    }
  }

  return obj;
};

/**
 * Read entries from Redis streams starting from the provided IDs.
 *
 * Note: Upstash REST does not support BLOCK. We emulate a short-polling loop
 * on the caller side rather than relying on blocking reads.
 *
 * @param {string[]} streams - Stream names to read from
 * @param {string[]} ids - Starting IDs for each stream
 * @param {{ count?: number }} opts - Options (count for limiting results)
 * @returns {Promise<StreamMessage[]>} Array of stream messages
 */
export async function streamRead(
  streams: string[],
  ids: string[],
  opts?: { count?: number }
): Promise<StreamMessage[]> {
  if (!redis || streams.length === 0 || ids.length === 0) return [];

  try {
    if (redisClientType === 'upstash') {
      // Upstash xread returns complex nested array structure
      const res: unknown = await (redis as UpstashRedis).xread(streams, ids, {
        count: opts?.count,
      });

      // Upstash returns: [[streamName, [[id, [field, value, ...]], ...]], ...]
      const parsed: StreamMessage[] = [];
      if (Array.isArray(res)) {
        for (const entry of res) {
          if (!Array.isArray(entry) || entry.length < 2) continue;
          const [streamName, records] = entry as [string, unknown];
          if (!Array.isArray(records)) continue;

          for (const record of records) {
            if (!Array.isArray(record) || record.length < 2) continue;
            const [id, fields] = record as [string, unknown];
            if (!Array.isArray(fields)) continue;

            const payload = extractPayload(fields);
            if (payload) {
              parsed.push({ stream: streamName, id, payload });
            }
          }
        }
      }
      return parsed;
    }

    if (redisClientType === 'standard') {
      // Type assertion needed because TS can't narrow union based on separate variable
      const ioredis = redis as unknown as IORedisInstance;
      const streamArgs = [...streams, ...ids] as string[];

      // Call appropriate overload based on whether COUNT is specified
      const res = opts?.count
        ? await ioredis.xread('COUNT', opts.count, 'STREAMS', ...streamArgs)
        : await ioredis.xread('STREAMS', ...streamArgs);

      const parsed: StreamMessage[] = [];
      if (Array.isArray(res)) {
        for (const streamEntry of res) {
          if (!Array.isArray(streamEntry) || streamEntry.length < 2) continue;
          const [streamName, records] = streamEntry as [string, unknown];
          if (!Array.isArray(records)) continue;
          for (const record of records) {
            if (!Array.isArray(record) || record.length < 2) continue;
            const [id, fields] = record as [string, unknown];
            if (!Array.isArray(fields)) continue;
            const payload = extractPayload(fields);
            if (payload) {
              parsed.push({ stream: streamName, id, payload });
            }
          }
        }
      }
      return parsed;
    }
  } catch (error) {
    logger.warn('streamRead failed', { error }, 'Redis');
  }

  return [];
}

