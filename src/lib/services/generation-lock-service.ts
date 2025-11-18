/**
 * Generation Lock Service
 * 
 * @description Simple distributed lock to prevent concurrent tick generation.
 * Prevents race conditions when multiple cron jobs trigger simultaneously. Uses
 * database-based locking that works across multiple servers with automatic stale
 * lock recovery (15 minutes expiry).
 * 
 * Features:
 * - Database-based locking (works across multiple servers)
 * - Automatic expiry (15 minutes for stale lock recovery)
 * - Simple acquire/release pattern
 * - No external dependencies (uses Prisma)
 * - Serverless-safe (uses timestamp + random bytes instead of process.pid)
 * 
 * Usage:
 * ```typescript
 * if (!await acquireGenerationLock(processId)) {
 *   return; // Skip this run, another process has the lock
 * }
 * 
 * try {
 *   await generateContent();
 * } finally {
 *   await releaseGenerationLock(processId);
 * }
 * ```
 */

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { randomBytes } from 'crypto';

const LOCK_ID = 'game-tick-lock';
// Lock expires after 15 minutes (must be > maxDuration of 13.3 minutes)
// This ensures locks don't expire while functions are still running
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Acquire generation lock
 * 
 * @description Attempts to acquire a distributed lock for content generation.
 * If lock is already held and not expired, returns false. If lock is expired
 * (stale), automatically acquires it.
 * 
 * Serverless Safety: Uses database-based locks with unique serverless-safe IDs.
 * Lock expiry (15min) is longer than Vercel maxDuration (13.3min) to prevent premature expiry.
 * 
 * @param {string} [processId] - Identifier for this process (default: random serverless-safe ID)
 * @returns {Promise<boolean>} True if lock acquired, false if already held
 * 
 * @example
 * ```typescript
 * const acquired = await acquireGenerationLock(processId);
 * if (!acquired) {
 *   return; // Skip, another process has the lock
 * }
 * ```
 */
export async function acquireGenerationLock(processId?: string): Promise<boolean> {
  const now = new Date();
  const expiry = new Date(now.getTime() + LOCK_DURATION_MS);
  // Generate serverless-safe unique ID: timestamp + random bytes
  // Don't rely on process.pid in serverless environments
  const lockHolder = processId || `serverless-${Date.now()}-${randomBytes(8).toString('hex')}`;
  
  // First, check if lock exists and is still valid
  const existingLock = await prisma.generationLock.findUnique({
    where: { id: LOCK_ID },
  });
  
  // If lock exists and is not expired, someone else has it
  if (existingLock && existingLock.expiresAt > now) {
    logger.info('Generation lock held by another process', {
      holder: existingLock.lockedBy,
      expiresAt: existingLock.expiresAt,
      expiresIn: Math.round((existingLock.expiresAt.getTime() - now.getTime()) / 1000),
    }, 'GenerationLock');
    return false;
  }
  
  // Lock doesn't exist or is expired - try to acquire it
  // Use upsert to atomically create or update
  // If lock exists but expired, update it
  // If lock doesn't exist, create it
  await prisma.generationLock.upsert({
    where: { id: LOCK_ID },
    create: {
      id: LOCK_ID,
      lockedBy: lockHolder,
      lockedAt: now,
      expiresAt: expiry,
      operation: 'game-tick',
    },
    update: {
      lockedBy: lockHolder,
      lockedAt: now,
      expiresAt: expiry,
    },
  });
  
  // Verify we actually got the lock (check if we're the holder)
  // This handles race conditions where multiple processes try to acquire simultaneously
  const lock = await prisma.generationLock.findUnique({
    where: { id: LOCK_ID },
  });
  
  if (lock && lock.lockedBy === lockHolder) {
    logger.info('Generation lock acquired', {
      lockHolder,
      expiresAt: lock.expiresAt,
      expiresIn: Math.round((lock.expiresAt.getTime() - now.getTime()) / 1000),
    }, 'GenerationLock');
    return true;
  }
  
  // Someone else got it between our check and upsert (race condition)
  logger.info('Generation lock acquired by another process (race condition)', {
    holder: lock?.lockedBy,
    ourHolder: lockHolder,
    expiresAt: lock?.expiresAt,
  }, 'GenerationLock');
  return false;
}

/**
 * Release generation lock
 * 
 * @description Releases the generation lock. Only the process that acquired
 * the lock can release it (prevents accidental releases). Requires processId
 * to match the lock holder for safety.
 * 
 * @param {string} [processId] - Identifier for this process (must match acquire)
 * @returns {Promise<void>}
 * 
 * @example
 * ```typescript
 * await releaseGenerationLock(processId);
 * ```
 */
export async function releaseGenerationLock(processId?: string): Promise<void> {
  if (!processId) {
    logger.warn('releaseGenerationLock called without processId - cannot safely release', undefined, 'GenerationLock');
    return;
  }
  
  // Only delete if we're the holder (exact match for safety)
  const deleted = await prisma.generationLock.deleteMany({
    where: {
      id: LOCK_ID,
      lockedBy: processId, // Exact match for safety
    },
  });
  
  if (deleted.count > 0) {
    logger.info('Generation lock released', { lockHolder: processId }, 'GenerationLock');
  } else {
    // Check if lock exists but held by someone else
    const lock = await prisma.generationLock.findUnique({
      where: { id: LOCK_ID },
    });
    
    if (lock) {
      logger.warn('Lock not held by this process', {
        requestedHolder: processId,
        actualHolder: lock.lockedBy,
      }, 'GenerationLock');
    } else {
      logger.info('Lock already released or expired', { requestedHolder: processId }, 'GenerationLock');
    }
  }
}

/**
 * Check if lock is held
 * 
 * @description Checks if the generation lock is currently held. Returns lock
 * information if held and not expired, null if free or expired.
 * 
 * @returns {Promise<object | null>} Lock info if held, null if free or expired
 */
export async function checkGenerationLock() {
  const lock = await prisma.generationLock.findUnique({
    where: { id: LOCK_ID },
  });
  
  if (!lock) return null;
  
  const now = new Date();
  if (lock.expiresAt < now) {
    // Lock is expired
    logger.info('Lock is expired', {
      holder: lock.lockedBy,
      expiredAt: lock.expiresAt,
    }, 'GenerationLock');
    return null;
  }
  
  return {
    lockedBy: lock.lockedBy,
    lockedAt: lock.lockedAt,
    expiresAt: lock.expiresAt,
    operation: lock.operation,
  };
}

