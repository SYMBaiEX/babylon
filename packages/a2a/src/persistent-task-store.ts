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
import { getCache, isRedisAvailable, setCache } from '@babylon/api';
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
          task = JSON.parse(cached) as Task;
          // Restore to memory for fast subsequent access
          await super.save(task);
          this.memoryFallback.set(taskId, task);
          return task;
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
   * Update Redis indexes for efficient querying
   */
  private async updateIndexes(task: Task): Promise<void> {
    const contextId = task.contextId || 'global';
    const status = task.status.state;
    const timestamp = task.status.timestamp
      ? new Date(task.status.timestamp).getTime()
      : Date.now();

    // Store task ID in context index
    const contextIndexKey = `context:${contextId}`;
    const contextIndex = await this.getIndex(contextIndexKey);
    contextIndex.push({ taskId: task.id, timestamp });

    // Keep index sorted and limited
    contextIndex.sort((a, b) => b.timestamp - a.timestamp);
    if (contextIndex.length > 1000) {
      contextIndex.splice(1000);
    }

    await this.setIndex(contextIndexKey, contextIndex);

    // Store task ID in status index
    const statusIndexKey = `status:${status}`;
    const statusIndex = await this.getIndex(statusIndexKey);

    // Remove old entry if exists
    const existingIdx = statusIndex.findIndex((e) => e.taskId === task.id);
    if (existingIdx >= 0) {
      statusIndex.splice(existingIdx, 1);
    }

    statusIndex.push({ taskId: task.id, timestamp });
    statusIndex.sort((a, b) => b.timestamp - a.timestamp);
    if (statusIndex.length > 1000) {
      statusIndex.splice(1000);
    }

    await this.setIndex(statusIndexKey, statusIndex);
  }

  /**
   * Get an index from Redis
   */
  private async getIndex(
    indexKey: string
  ): Promise<Array<{ taskId: string; timestamp: number }>> {
    try {
      const cached = await getCache<string>(indexKey, {
        namespace: TASK_INDEX_NAMESPACE,
      });
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      logger.debug('Failed to get index from Redis', { indexKey }, 'A2A');
    }
    return [];
  }

  /**
   * Set an index in Redis
   */
  private async setIndex(
    indexKey: string,
    index: Array<{ taskId: string; timestamp: number }>
  ): Promise<void> {
    try {
      await setCache(indexKey, JSON.stringify(index), {
        namespace: TASK_INDEX_NAMESPACE,
        ttl: DEFAULT_TTL_SECONDS,
      });
    } catch {
      logger.debug('Failed to set index in Redis', { indexKey }, 'A2A');
    }
  }

  /**
   * List tasks from Redis using indexes
   */
  private async listFromRedis(
    params: ListTasksParams
  ): Promise<ListTasksResult> {
    const contextId = params.contextId || 'global';
    const contextIndexKey = `context:${contextId}`;

    // Get task IDs from context index
    let taskEntries = await this.getIndex(contextIndexKey);

    // Filter by status if specified
    if (params.status) {
      const statusIndexKey = `status:${params.status}`;
      const statusIndex = await this.getIndex(statusIndexKey);
      const statusTaskIds = new Set(statusIndex.map((e) => e.taskId));
      taskEntries = taskEntries.filter((e) => statusTaskIds.has(e.taskId));
    }

    // Filter by lastUpdatedAfter
    if (params.lastUpdatedAfter) {
      taskEntries = taskEntries.filter(
        (e) => e.timestamp >= params.lastUpdatedAfter!
      );
    }

    // Pagination
    const pageSize = Math.min(params.pageSize || 10, 100);
    const pageOffset = params.pageToken
      ? Number.parseInt(params.pageToken, 10)
      : 0;

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
