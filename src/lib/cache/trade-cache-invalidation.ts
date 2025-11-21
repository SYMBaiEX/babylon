/**
 * Trade Cache Invalidation Utilities
 * 
 * Provides functions to invalidate Redis cache when trades are created
 * to ensure fresh data is fetched on next request.
 */

import { redis, redisClientType } from '@/lib/redis';
import { logger } from '@/lib/logger';
import type { Redis as UpstashRedis } from '@upstash/redis';

/**
 * Invalidate all trades cache for a specific prediction market using pattern-based deletion
 */
export async function invalidatePredictionTradesCache(marketId: string): Promise<void> {
  try {
    // If Redis is available, delete all cache entries for this market using SCAN
    if (redis && redisClientType) {
      const pattern = `market-trades:prediction-trades:${marketId}:*`;

      if (redisClientType === 'upstash') {
        // Upstash Redis supports SCAN - use cursor-based iteration for efficient pattern deletion
        const upstashClient = redis as UpstashRedis;
        let cursor: string | number = 0;
        let deletedCount = 0;

        do {
          const result: [string | number, string[]] = await upstashClient.scan(cursor, {
            match: pattern,
            count: 100,
          }) as [string | number, string[]];
          cursor = result[0];
          const keys = result[1];

          if (keys.length > 0) {
            // Delete all matched keys
            await upstashClient.del(...keys);
            deletedCount += keys.length;
          }
        } while (cursor !== '0' && cursor !== 0);

        if (deletedCount > 0) {
          logger.debug(`Deleted ${deletedCount} cache keys for market ${marketId}`, undefined, 'TradeCache');
        }
      } else {
        // Standard Redis - use SCAN stream to find and delete all matching keys
        const { default: _IORedis } = await import('ioredis');
        const client = redis as InstanceType<typeof _IORedis>;

        const stream = client.scanStream({
          match: pattern,
          count: 100,
        });

        stream.on('data', (keys: string[]) => {
          if (keys.length) {
            const pipeline = client.pipeline();
            keys.forEach((key) => pipeline.del(key));
            pipeline.exec();
          }
        });

        await new Promise((resolve, reject) => {
          stream.on('end', resolve);
          stream.on('error', reject);
        });
      }
    } else {
      // If no Redis, cache is in-memory and will expire naturally
      logger.debug('No Redis available, cache will expire naturally', { marketId }, 'TradeCache');
    }

    logger.info(`Invalidated prediction trades cache for market ${marketId}`, undefined, 'TradeCache');
  } catch (error) {
    logger.error(`Failed to invalidate prediction trades cache`, error, 'TradeCache');
  }
}

/**
 * Invalidate all trades cache for a specific perpetual market using pattern-based deletion
 */
export async function invalidatePerpTradesCache(ticker: string): Promise<void> {
  try {
    // If Redis is available, delete all cache entries for this ticker using SCAN
    if (redis && redisClientType) {
      const pattern = `market-trades:perp-trades:${ticker}:*`;

      if (redisClientType === 'upstash') {
        // Upstash Redis supports SCAN - use cursor-based iteration for efficient pattern deletion
        const upstashClient = redis as UpstashRedis;
        let cursor: string | number = 0;
        let deletedCount = 0;

        do {
          const result: [string | number, string[]] = await upstashClient.scan(cursor, {
            match: pattern,
            count: 100,
          }) as [string | number, string[]];
          cursor = result[0];
          const keys = result[1];

          if (keys.length > 0) {
            // Delete all matched keys
            await upstashClient.del(...keys);
            deletedCount += keys.length;
          }
        } while (cursor !== '0' && cursor !== 0);

        if (deletedCount > 0) {
          logger.debug(`Deleted ${deletedCount} cache keys for ticker ${ticker}`, undefined, 'TradeCache');
        }
      } else {
        // Standard Redis - use SCAN stream to find and delete all matching keys
        const { default: _IORedis } = await import('ioredis');
        const client = redis as InstanceType<typeof _IORedis>;

        const stream = client.scanStream({
          match: pattern,
          count: 100,
        });

        stream.on('data', (keys: string[]) => {
          if (keys.length) {
            const pipeline = client.pipeline();
            keys.forEach((key) => pipeline.del(key));
            pipeline.exec();
          }
        });

        await new Promise((resolve, reject) => {
          stream.on('end', resolve);
          stream.on('error', reject);
        });
      }
    } else {
      logger.debug('No Redis available, cache will expire naturally', { ticker }, 'TradeCache');
    }

    logger.info(`Invalidated perp trades cache for ticker ${ticker}`, undefined, 'TradeCache');
  } catch (error) {
    logger.error(`Failed to invalidate perp trades cache`, error, 'TradeCache');
  }
}

/**
 * Invalidate trades cache after a prediction market trade
 * Call this after creating a position or balance transaction for a prediction market
 */
export async function invalidateAfterPredictionTrade(marketId: string): Promise<void> {
  await invalidatePredictionTradesCache(marketId);
}

/**
 * Invalidate trades cache after a perpetual futures trade
 * Call this after opening/closing a perp position or creating related balance transaction
 */
export async function invalidateAfterPerpTrade(ticker: string): Promise<void> {
  await invalidatePerpTradesCache(ticker);
}

