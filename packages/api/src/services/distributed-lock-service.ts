/**
 * Distributed Lock Service
 *
 * @description Generic distributed lock implementation using Drizzle.
 * Prevents race conditions across multiple servers/processes.
 * Supports automatic stale lock recovery.
 */

import { db, eq, generationLocks } from '@babylon/db';
import { logger } from '@babylon/shared';
import { randomBytes } from 'crypto';

export interface LockOptions {
  lockId: string;
  durationMs: number;
  operation: string;
  processId?: string;
}

export class DistributedLockService {
  /**
   * Acquire a distributed lock
   *
   * @description Uses a "check-first, create-second" pattern to avoid triggering
   * unique constraint errors in normal cases. Race conditions (multiple processes
   * checking and creating simultaneously) are handled gracefully with proper error
   * recovery. Supports automatic stale lock recovery for expired locks.
   *
   * @param {LockOptions} options - Lock acquisition options
   * @param {string} options.lockId - Unique lock identifier
   * @param {number} options.durationMs - Lock duration in milliseconds
   * @param {string} options.operation - Operation name for logging
   * @param {string} [options.processId] - Optional process identifier (auto-generated if not provided)
   * @returns {Promise<boolean>} True if lock was acquired, false otherwise
   */
  static async acquireLock(options: LockOptions): Promise<boolean> {
    const { lockId, durationMs, operation, processId } = options;
    const now = new Date();
    const expiry = new Date(now.getTime() + durationMs);

    // Generate serverless-safe unique ID if not provided
    const lockHolder =
      processId || `serverless-${Date.now()}-${randomBytes(8).toString('hex')}`;

    // First, check if lock already exists (avoids unique constraint errors in most cases)
    const [existingLock] = await db
      .select()
      .from(generationLocks)
      .where(eq(generationLocks.id, lockId))
      .limit(1);

    if (existingLock) {
      // Lock exists - check if it's expired
      if (existingLock.expiresAt <= now) {
        // Expired - try to recover atomically using conditional update
        await db
          .update(generationLocks)
          .set({
            lockedBy: lockHolder,
            lockedAt: now,
            expiresAt: expiry,
            operation,
          })
          .where(eq(generationLocks.id, lockId));

        // Check if we updated (need to verify the lock is still expired)
        const [updatedLock] = await db
          .select()
          .from(generationLocks)
          .where(eq(generationLocks.id, lockId))
          .limit(1);

        if (updatedLock && updatedLock.lockedBy === lockHolder) {
          logger.info(
            `Lock ${lockId} acquired (recovered stale)`,
            {
              lockId,
              lockHolder,
              expiresAt: expiry.toISOString(),
            },
            'DistributedLockService'
          );
          return true;
        }
        // Someone else recovered it between our check and update - fall through to log
      }

      // Lock exists and is valid (or was just recovered by another process)
      const ageMinutes = Math.round(
        (now.getTime() - existingLock.lockedAt.getTime()) / 1000 / 60
      );
      logger.info(
        `Lock ${lockId} held by ${existingLock.lockedBy} - skipping`,
        {
          lockId,
          holder: existingLock.lockedBy,
          ageMinutes,
          expiresIn: Math.round(
            (existingLock.expiresAt.getTime() - now.getTime()) / 1000
          ),
        },
        'DistributedLockService'
      );
      return false;
    }

    // No lock exists - try to create it
    await db.insert(generationLocks).values({
      id: lockId,
      lockedBy: lockHolder,
      lockedAt: now,
      expiresAt: expiry,
      operation,
    });

    logger.info(
      `Lock ${lockId} acquired (created)`,
      {
        lockId,
        lockHolder,
        expiresAt: expiry.toISOString(),
      },
      'DistributedLockService'
    );
    return true;
  }

  /**
   * Release a distributed lock
   *
   * @description Releases a lock only if it's held by the specified process ID.
   * This prevents accidental release of locks held by other processes. Process ID
   * is required for safe lock release in distributed environments.
   *
   * @param {string} lockId - Lock identifier to release
   * @param {string} [processId] - Process ID that holds the lock (required for safe release)
   * @returns {Promise<void>}
   */
  static async releaseLock(lockId: string, processId?: string): Promise<void> {
    if (!processId) {
      // Process ID is required for safe lock release to prevent releasing locks held by other processes
      logger.warn(
        `releaseLock called without processId for ${lockId} - unsafe release prevented`,
        undefined,
        'DistributedLockService'
      );
      return;
    }

    // Only delete if we're the holder
    const [existingLock] = await db
      .select()
      .from(generationLocks)
      .where(eq(generationLocks.id, lockId))
      .limit(1);

    if (existingLock && existingLock.lockedBy === processId) {
      await db.delete(generationLocks).where(eq(generationLocks.id, lockId));

      logger.info(
        `Lock ${lockId} released`,
        { lockId, lockHolder: processId },
        'DistributedLockService'
      );
    } else if (existingLock) {
      logger.warn(
        `Lock ${lockId} not held by this process`,
        {
          lockId,
          requestedHolder: processId,
          actualHolder: existingLock.lockedBy,
        },
        'DistributedLockService'
      );
    } else {
      logger.info(
        `Lock ${lockId} already released or expired`,
        { lockId },
        'DistributedLockService'
      );
    }
  }

  /**
   * Check if a lock is currently held
   *
   * @description Queries the database to check if a lock exists and is still valid
   * (not expired). Returns the lock information if held, null otherwise.
   *
   * @param {string} lockId - Lock identifier to check
   * @returns {Promise<object | null>} Lock information if held and valid, null otherwise
   */
  static async checkLock(lockId: string) {
    const [lock] = await db
      .select()
      .from(generationLocks)
      .where(eq(generationLocks.id, lockId))
      .limit(1);

    if (!lock) return null;

    const now = new Date();
    if (lock.expiresAt < now) {
      return null; // Expired
    }

    return lock;
  }
}
