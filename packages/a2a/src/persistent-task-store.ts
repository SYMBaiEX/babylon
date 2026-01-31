/**
 * Persistent Task Store
 *
 * Extends the ExtendedTaskStore to add Redis-backed persistence for tasks.
 * This ensures tasks survive server restarts and work across multiple
 * serverless instances (e.g., Vercel functions).
 *
 * Uses Redis for storage with an in-memory fallback when Redis is unavailable.
 *
 * @public
 */

import type { Task } from '@a2a-js/sdk';
import {
  getCache,
  getRedisClient,
  isRedisAvailable,
  setCache,
} from '@babylon/api';
import { logger } from '@babylon/shared';
import {
  ExtendedTaskStore,
  type ListTasksParams,
  type ListTasksResult,
} from './extended-task-store';

const TASK_CACHE_NAMESPACE = 'a2a:tasks';
const TASK_INDEX_NAMESPACE = 'a2a:task-index';
const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

/**
 * Persistent task store with Redis backing
 *
 * Provides task storage and retrieval with Redis persistence and
 * automatic fallback to in-memory storage when Redis is unavailable.
 */
export class PersistentTaskStore extends ExtendedTaskStore {
  private memoryFallback: Map<string, Task> = new Map();

  /**
   * Save task to both in-memory and Redis
   */
  async save(task: Task): Promise<void> {
    // Always save to parent (in-memory)
    await super.save(task);

    // Also save to memory fallback for quick access
    this.memoryFallback.set(task.id, task);

    // Persist to Redis if available
    if (await isRedisAvailable()) {
      try {
        const taskKey = `task:${task.id}`;
        const serialized = JSON.stringify(task);

        await setCache(taskKey, serialized, {
          namespace: TASK_CACHE_NAMESPACE,
          ttl: DEFAULT_TTL_SECONDS,
        });

        // Update indexes for efficient querying
        await this.updateIndexes(task);
      } catch (error) {
        logger.warn(
          'Failed to persist task to Redis, using memory only',
          { taskId: task.id, error: String(error) },
          'A2A'
        );
      }
    }
  }

  /**
   * Load task from memory first, then Redis
   */
  async load(taskId: string): Promise<Task | undefined> {
    // Check in-memory first (from parent)
    let task = await super.load(taskId);
    if (task) return task;

    // Check memory fallback
    task = this.memoryFallback.get(taskId);
    if (task) return task;

    // Try Redis
    if (await isRedisAvailable()) {
      try {
        const taskKey = `task:${taskId}`;
        const cached = await getCache<string>(taskKey, {
          namespace: TASK_CACHE_NAMESPACE,
        });

        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            // Validate the parsed object has required Task properties
            if (
              parsed &&
              typeof parsed === 'object' &&
              typeof parsed.id === 'string' &&
              parsed.status &&
              typeof parsed.status === 'object' &&
              typeof parsed.status.state === 'string'
            ) {
              task = parsed as Task;
              // Restore to memory for fast subsequent access
              await super.save(task);
              this.memoryFallback.set(taskId, task);
              return task;
            }
            // Invalid task structure - treat as cache miss
            logger.warn(
              'Invalid task structure in Redis cache, treating as cache miss',
              { taskId },
              'A2A'
            );
          } catch (parseError) {
            // Corrupted cache entry - treat as cache miss
            logger.warn(
              'Failed to parse task from Redis cache, treating as cache miss',
              { taskId, error: String(parseError) },
              'A2A'
            );
          }
        }
      } catch (error) {
        logger.warn(
          'Failed to load task from Redis',
          { taskId, error: String(error) },
          'A2A'
        );
      }
    }

    return undefined;
  }

  /**
   * List tasks with optional Redis-backed querying
   */
  async list(params: ListTasksParams = {}): Promise<ListTasksResult> {
    // If Redis is available and we have a contextId filter, try Redis first
    if ((await isRedisAvailable()) && params.contextId) {
      try {
        return await this.listFromRedis(params);
      } catch (error) {
        logger.warn(
          'Failed to list tasks from Redis, falling back to memory',
          { error: String(error) },
          'A2A'
        );
      }
    }

    // Fall back to parent implementation (in-memory)
    return super.list(params);
  }

  /**
   * Update Redis indexes for efficient querying using atomic sorted set operations
   */
  private async updateIndexes(task: Task): Promise<void> {
    const client = getRedisClient();
    if (!client) return;

    const contextId = task.contextId || 'global';
    const status = task.status.state;
    const timestamp = task.status.timestamp
      ? new Date(task.status.timestamp).getTime()
      : Date.now();

    const contextIndexKey = `${TASK_INDEX_NAMESPACE}:context:${contextId}`;
    const statusIndexKey = `${TASK_INDEX_NAMESPACE}:status:${status}`;
    const maxIndexSize = 1000;

    try {
      // Use Redis MULTI/EXEC for atomic operations on both indexes
      const pipeline = client.multi();

      // Add/update task in context index (sorted set with timestamp as score)
      // ZADD with score=timestamp atomically adds or updates the entry
      pipeline.zadd(contextIndexKey, timestamp, task.id);
      // Trim to keep only the newest 1000 entries (remove lowest scores = oldest)
      // ZREMRANGEBYRANK 0 -(maxIndexSize+1) removes all but the top maxIndexSize entries
      pipeline.zremrangebyrank(contextIndexKey, 0, -(maxIndexSize + 1));
      // Set TTL on the index key
      pipeline.expire(contextIndexKey, DEFAULT_TTL_SECONDS);

      // Add/update task in status index
      pipeline.zadd(statusIndexKey, timestamp, task.id);
      pipeline.zremrangebyrank(statusIndexKey, 0, -(maxIndexSize + 1));
      pipeline.expire(statusIndexKey, DEFAULT_TTL_SECONDS);

      // Execute all commands atomically
      await pipeline.exec();
    } catch (error) {
      logger.debug(
        'Failed to update indexes atomically in Redis',
        { taskId: task.id, error: String(error) },
        'A2A'
      );
    }
  }

  /**
   * Get an index from Redis sorted set
   * Returns entries sorted by timestamp descending (newest first)
   */
  private async getIndexFromSortedSet(
    indexKey: string
  ): Promise<Array<{ taskId: string; timestamp: number }>> {
    const client = getRedisClient();
    if (!client) return [];

    try {
      // ZREVRANGE returns members sorted by score descending (newest first)
      // with WITHSCORES to get the timestamps
      const results = await client.zrevrange(indexKey, 0, -1, 'WITHSCORES');

      // Results come as [member1, score1, member2, score2, ...]
      const entries: Array<{ taskId: string; timestamp: number }> = [];
      for (let i = 0; i < results.length; i += 2) {
        const taskId = results[i];
        const score = results[i + 1];
        if (taskId && score) {
          entries.push({
            taskId,
            timestamp: Number.parseFloat(score),
          });
        }
      }
      return entries;
    } catch {
      logger.debug(
        'Failed to get index from Redis sorted set',
        { indexKey },
        'A2A'
      );
    }
    return [];
  }

  /**
   * List tasks from Redis using sorted set indexes
   */
  private async listFromRedis(
    params: ListTasksParams
  ): Promise<ListTasksResult> {
    const contextId = params.contextId || 'global';
    const contextIndexKey = `${TASK_INDEX_NAMESPACE}:context:${contextId}`;

    // Get task IDs from context index (sorted set)
    let taskEntries = await this.getIndexFromSortedSet(contextIndexKey);

    // Filter by status if specified
    if (params.status) {
      const statusIndexKey = `${TASK_INDEX_NAMESPACE}:status:${params.status}`;
      const statusIndex = await this.getIndexFromSortedSet(statusIndexKey);
      const statusTaskIds = new Set(statusIndex.map((e) => e.taskId));
      taskEntries = taskEntries.filter((e) => statusTaskIds.has(e.taskId));
    }

    // Filter by lastUpdatedAfter
    if (params.lastUpdatedAfter) {
      taskEntries = taskEntries.filter(
        (e) => e.timestamp >= params.lastUpdatedAfter!
      );
    }

    // Pagination with validated pageToken
    const pageSize = Math.min(params.pageSize || 10, 100);
    let pageOffset = 0;

    if (params.pageToken) {
      const parsed = Number.parseInt(params.pageToken, 10);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error(
          `Invalid pageToken: expected non-negative integer, got "${params.pageToken}"`
        );
      }
      pageOffset = parsed;
    }

    const totalSize = taskEntries.length;
    const paginatedEntries = taskEntries.slice(
      pageOffset,
      pageOffset + pageSize
    );

    // Load tasks
    const tasks: Task[] = [];
    for (const entry of paginatedEntries) {
      const task = await this.load(entry.taskId);
      if (task) {
        // Process task (trim history, remove artifacts if needed)
        const processed = { ...task };

        if (params.historyLength !== undefined && processed.history) {
          processed.history = processed.history.slice(-params.historyLength);
        }

        if (params.includeArtifacts === false) {
          delete processed.artifacts;
        }

        tasks.push(processed);
      }
    }

    // Calculate next page token
    const hasMore = totalSize > pageOffset + pageSize;
    const nextPageToken = hasMore ? String(pageOffset + pageSize) : '';

    return {
      tasks,
      totalSize,
      pageSize,
      nextPageToken,
    };
  }

  /**
   * Clear all tasks (for testing)
   */
  async clear(): Promise<void> {
    await super.clear();
    this.memoryFallback.clear();
    // Note: Redis indexes will expire naturally with TTL
  }
}
