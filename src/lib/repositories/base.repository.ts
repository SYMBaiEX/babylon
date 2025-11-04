/**
 * Base repository pattern implementation
 * Provides common CRUD operations with caching support
 */

import type { PrismaClient, Prisma } from '@prisma/client';
import { cache } from '@/lib/cache/cache-service';
import { DatabaseError, NotFoundError } from '@/lib/errors';
import { logger } from '@/lib/logger';

/**
 * Cache TTL presets (in seconds)
 */
export enum CacheTTL {
  STATIC = 3600,      // 1 hour for static data
  LONG = 1800,        // 30 minutes for semi-static data
  MEDIUM = 600,       // 10 minutes for user data
  SHORT = 300,        // 5 minutes for frequently changing data
  REALTIME = 60,      // 1 minute for near-realtime data
  BURST = 10          // 10 seconds for rapidly changing data
}

/**
 * Base repository options
 */
export interface RepositoryOptions {
  defaultTTL?: number;
  cachePrefix?: string;
  enableCache?: boolean;
}

/**
 * Abstract base repository class
 * Provides common database operations with caching
 */
export abstract class BaseRepository<
  TEntity extends { id: string },
  TCreateDTO = Prisma.JsonValue,
  TUpdateDTO = Prisma.JsonValue
> {
  protected prisma: PrismaClient;
  protected modelName: string;
  protected cachePrefix: string;
  protected defaultTTL: number;
  protected enableCache: boolean;

  constructor(
    prisma: PrismaClient,
    modelName: string,
    options: RepositoryOptions = {}
  ) {
    this.prisma = prisma;
    this.modelName = modelName;
    this.cachePrefix = options.cachePrefix || `${modelName}:`;
    this.defaultTTL = options.defaultTTL || CacheTTL.SHORT;
    this.enableCache = options.enableCache !== false; // Default to true
  }

  /**
   * Get the Prisma model delegate
   * Note: Uses 'any' due to Prisma's dynamic model access limitations
   */
  protected get model(): {
    findUnique: (args: unknown) => Promise<TEntity | null>;
    findMany: (args?: unknown) => Promise<TEntity[]>;
    findFirst: (args?: unknown) => Promise<TEntity | null>;
    count: (args?: unknown) => Promise<number>;
    create: (args: unknown) => Promise<TEntity>;
    update: (args: unknown) => Promise<TEntity>;
    delete: (args: unknown) => Promise<TEntity>;
    upsert: (args: unknown) => Promise<TEntity>;
     
  } {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.prisma as any)[this.modelName];
  }

  /**
   * Generate cache key
   */
  protected getCacheKey(...parts: (string | number | object)[]): string {
    return this.generateCacheKey(...parts)
  }
  
  /**
   * Generate cache key (internal)
   */
  protected generateCacheKey(...parts: (string | number | object)[]): string {
    const keyParts = parts.map(part => {
      if (typeof part === 'object') {
        return this.hashObject(part);
      }
      return String(part);
    });
    return `${this.cachePrefix}${keyParts.join(':')}`;
  }

  /**
   * Hash object for cache key generation
   */
  private hashObject(obj: object): string {
    // Simple hash for cache keys
    return Buffer.from(JSON.stringify(obj)).toString('base64').substring(0, 20);
  }

  /**
   * Alias for getOrSet (for convenience)
   */
  protected async withCache<R>(
    cacheKey: string,
    fetcher: () => Promise<R>,
    ttl?: number
  ): Promise<R> {
    return this.getOrSet(cacheKey, fetcher, ttl)
  }
  
  /**
   * Get from cache or fetch from database
   */
  protected async getOrSet<R>(
    cacheKey: string,
    fetcher: () => Promise<R>,
    ttl?: number
  ): Promise<R> {
    if (!this.enableCache) {
      return fetcher();
    }

    try {
      const cached = await cache.get<R>(cacheKey);
      if (cached !== null) {
        logger.debug(`Cache hit: ${cacheKey}`, undefined, 'Repository');
        return cached;
      }

      logger.debug(`Cache miss: ${cacheKey}`, undefined, 'Repository');
      const result = await fetcher();

      if (result !== null && result !== undefined) {
        await cache.set(cacheKey, result, ttl || this.defaultTTL);
      }

      return result;
    } catch (error) {
      logger.error(`Cache operation failed: ${error}`, undefined, 'Repository');
      // Fallback to direct fetch on cache error
      return fetcher();
    }
  }

  /**
   * Get cache instance for direct access
   */
  protected get cache(): { get: <T>(key: string) => Promise<T | null>; set: (key: string, value: unknown, ttl?: number) => Promise<void>; delete: (key: string) => Promise<void> } {
    return cache
  }

  /**
   * Invalidate cache for an entity
   */
  protected async invalidateCache(id?: string, additionalKeys: string[] = []): Promise<void> {
    if (!this.enableCache) return;

    const keysToInvalidate: string[] = [...additionalKeys];

    if (id) {
      keysToInvalidate.push(this.generateCacheKey('id', id));
    }

    // Invalidate list caches
    keysToInvalidate.push(
      this.generateCacheKey('list'),
      this.generateCacheKey('count')
    );

    await Promise.all(
      keysToInvalidate.map(key => cache.delete(key))
    );
  }

  /**
   * Invalidate all cache for this repository
   */
  async invalidateAllCache(): Promise<void> {
    if (!this.enableCache) return;

    // Invalidate by pattern
    await cache.invalidatePattern(`${this.cachePrefix}*`);
  }

  /**
   * Find by ID
   */
  async findById(id: string, options?: { include?: object; select?: object }): Promise<TEntity | null> {
    const cacheKey = this.generateCacheKey('id', id, options || {});

    return this.getOrSet(
      cacheKey,
      async () => {
        try {
          const result = await this.model.findUnique({
            where: { id },
            ...options
          });
          return result;
        } catch (error) {
          throw new DatabaseError(
            `Failed to find ${this.modelName} by ID`,
            'findById',
            error instanceof Error ? error : undefined
          );
        }
      },
      this.defaultTTL
    );
  }

  /**
   * Find by ID or throw error
   */
  async findByIdOrThrow(id: string, options?: { include?: object; select?: object }): Promise<TEntity> {
    const result = await this.findById(id, options);

    if (!result) {
      throw new NotFoundError(this.modelName, id);
    }

    return result;
  }

  /**
   * Find many with pagination and filters
   */
  async findMany(options: {
    where?: object;
    orderBy?: object;
    include?: object;
    select?: object;
    skip?: number;
    take?: number;
  } = {}): Promise<TEntity[]> {
    const cacheKey = this.generateCacheKey('list', options);

    return this.getOrSet(
      cacheKey,
      async () => {
        try {
          const results = await this.model.findMany(options);
          return results;
        } catch (error) {
          throw new DatabaseError(
            `Failed to find ${this.modelName} records`,
            'findMany',
            error instanceof Error ? error : undefined
          );
        }
      },
      this.defaultTTL
    );
  }

  /**
   * Find first matching record
   */
  async findFirst(options: {
    where?: object;
    orderBy?: object;
    include?: object;
    select?: object;
  } = {}): Promise<TEntity | null> {
    const cacheKey = this.generateCacheKey('first', options);

    return this.getOrSet(
      cacheKey,
      async () => {
        try {
          const result = await this.model.findFirst(options);
          return result;
        } catch (error) {
          throw new DatabaseError(
            `Failed to find first ${this.modelName}`,
            'findFirst',
            error instanceof Error ? error : undefined
          );
        }
      },
      this.defaultTTL
    );
  }

  /**
   * Count records
   */
  async count(where?: object): Promise<number> {
    const cacheKey = this.generateCacheKey('count', where || {});

    return this.getOrSet(
      cacheKey,
      async () => {
        try {
          const count = await this.model.count({ where });
          return count;
        } catch (error) {
          throw new DatabaseError(
            `Failed to count ${this.modelName} records`,
            'count',
            error instanceof Error ? error : undefined
          );
        }
      },
      this.defaultTTL
    );
  }

  /**
   * Create a new record
   */
  async create(data: TCreateDTO, options?: { include?: object; select?: object }): Promise<TEntity> {
    try {
      const result = await this.model.create({
        data,
        ...options
      });

      // Invalidate list caches
      await this.invalidateCache();

      return result;
    } catch (error) {
      throw new DatabaseError(
        `Failed to create ${this.modelName}`,
        'create',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Update a record
   */
  async update(
    id: string,
    data: TUpdateDTO,
    options?: { include?: object; select?: object }
  ): Promise<TEntity> {
    try {
      const result = await this.model.update({
        where: { id },
        data,
        ...options
      });

      // Invalidate caches for this entity
      await this.invalidateCache(id);

      return result;
    } catch (error) {
      if (error instanceof Error && error.message.includes('Record to update not found')) {
        throw new NotFoundError(this.modelName, id);
      }

      throw new DatabaseError(
        `Failed to update ${this.modelName}`,
        'update',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Delete a record
   */
  async delete(id: string): Promise<TEntity> {
    try {
      const result = await this.model.delete({
        where: { id }
      });

      // Invalidate caches
      await this.invalidateCache(id);

      return result;
    } catch (error) {
      if (error instanceof Error && error.message.includes('Record to delete does not exist')) {
        throw new NotFoundError(this.modelName, id);
      }

      throw new DatabaseError(
        `Failed to delete ${this.modelName}`,
        'delete',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Upsert a record
   */
  async upsert(
    where: object,
    create: TCreateDTO,
    update: TUpdateDTO,
    options?: { include?: object; select?: object }
  ): Promise<TEntity> {
    try {
      const result = await this.model.upsert({
        where,
        create,
        update,
        ...options
      });

      // Invalidate caches
      await this.invalidateCache();

      return result;
    } catch (error) {
      throw new DatabaseError(
        `Failed to upsert ${this.modelName}`,
        'upsert',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Execute a transaction
   */
  async transaction<R>(
    fn: (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>) => Promise<R>
  ): Promise<R> {
    try {
      const result = await this.prisma.$transaction(fn);

      // Invalidate all caches after transaction
      await this.invalidateAllCache();

      return result;
    } catch (error) {
      throw new DatabaseError(
        `Transaction failed for ${this.modelName}`,
        'transaction',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Paginate results
   */
  async paginate(options: {
    page?: number;
    limit?: number;
    where?: object;
    orderBy?: object;
    include?: object;
    select?: object;
  }): Promise<{
    data: TEntity[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = options.page || 1;
    const limit = options.limit || 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.findMany({
        where: options.where,
        orderBy: options.orderBy,
        include: options.include,
        select: options.select,
        skip,
        take: limit
      }),
      this.count(options.where)
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }
}