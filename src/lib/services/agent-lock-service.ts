/**
 * Agent Lock Service
 * 
 * @description
 * Per-agent distributed locks to prevent concurrent agent tick execution.
 * Each agent gets its own lock to prevent double-ticking or stacking ticks.
 * 
 * **Features**:
 * - Per-agent locking (independent locks for each agent)
 * - Database-based locking (works across multiple servers)
 * - Automatic stale lock recovery (10 minutes expiry)
 * - Simple acquire/release pattern
 * - No external dependencies (uses Prisma)
 * 
 * **Usage**:
 * ```typescript
 * if (!await acquireAgentLock(agentId)) {
 *   return; // Skip this agent, still running from previous tick
 * }
 * 
 * try {
 *   await runAgentTick(agentId);
 * } finally {
 *   await releaseAgentLock(agentId);
 * }
 * ```
 */

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { randomBytes } from 'crypto';

// Lock expires after 15 minutes (must be > maxDuration of 13.3 minutes)
// This ensures locks don't expire while functions are still running
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes - stale lock recovery

/**
 * Get lock ID for an agent
 */
function getAgentLockId(agentId: string): string {
  return `agent-tick-${agentId}`;
}

/**
 * Acquire agent lock
 * 
 * @param agentId - Agent identifier
 * @param processId - Identifier for this process (default: random)
 * @returns true if lock acquired, false if already held
 * 
 * @description
 * Attempts to acquire a distributed lock for an agent's tick execution.
 * If lock is already held and not expired, returns false (agent still running).
 * If lock is expired (>15 minutes old), automatically acquires it (stale lock recovery).
 * 
 * **Serverless Safety**: Uses database-based locks with unique serverless-safe IDs.
 * Lock expiry (15min) is longer than Vercel maxDuration (13.3min) to prevent premature expiry.
 */
export async function acquireAgentLock(agentId: string, processId?: string): Promise<boolean> {
  const now = new Date();
  const expiry = new Date(now.getTime() + LOCK_DURATION_MS);
  // Generate serverless-safe unique ID: timestamp + random bytes
  // Don't rely on process.pid in serverless environments
  const lockHolder = processId || `serverless-${Date.now()}-${randomBytes(8).toString('hex')}`;
  const lockId = getAgentLockId(agentId);
  
  // First, check if lock exists and is still valid
  const existingLock = await prisma.generationLock.findUnique({
    where: { id: lockId },
  });
  
  // If lock exists and is not expired, agent is still running
  if (existingLock && existingLock.expiresAt > now) {
    const ageMinutes = Math.round((now.getTime() - existingLock.lockedAt.getTime()) / 1000 / 60);
    logger.info('Agent lock held - skipping tick', {
      agentId,
      holder: existingLock.lockedBy,
      lockedAt: existingLock.lockedAt,
      ageMinutes,
      expiresIn: Math.round((existingLock.expiresAt.getTime() - now.getTime()) / 1000),
    }, 'AgentLock');
    return false;
  }
  
  // If lock existed and was expired, log stale lock recovery
  if (existingLock && existingLock.expiresAt <= now) {
    const staleDurationMinutes = Math.round((now.getTime() - existingLock.expiresAt.getTime()) / 1000 / 60);
    logger.warn('Stale agent lock detected - forcing unlock', {
      agentId,
      previousHolder: existingLock.lockedBy,
      lockedAt: existingLock.lockedAt,
      expiredAt: existingLock.expiresAt,
      staleDurationMinutes,
    }, 'AgentLock');
  }
  
  // Lock doesn't exist or is expired - try to acquire it
  // Use upsert to atomically create or update
  await prisma.generationLock.upsert({
    where: { id: lockId },
    create: {
      id: lockId,
      lockedBy: lockHolder,
      lockedAt: now,
      expiresAt: expiry,
      operation: 'agent-tick',
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
    where: { id: lockId },
  });
  
  if (lock && lock.lockedBy === lockHolder) {
    logger.info('Agent lock acquired', {
      agentId,
      lockHolder,
      expiresAt: lock.expiresAt,
      expiresIn: Math.round((lock.expiresAt.getTime() - now.getTime()) / 1000),
    }, 'AgentLock');
    return true;
  }
  
  // Someone else got it between our check and upsert (race condition)
  logger.info('Agent lock acquired by another process (race condition)', {
    agentId,
    holder: lock?.lockedBy,
    ourHolder: lockHolder,
  }, 'AgentLock');
  return false;
}

/**
 * Release agent lock
 * 
 * @param agentId - Agent identifier
 * @param processId - Identifier for this process (must match acquire)
 * 
 * @description
 * Releases the agent lock. Only the process that acquired the lock
 * can release it (prevents accidental releases).
 */
export async function releaseAgentLock(agentId: string, processId?: string): Promise<void> {
  if (!processId) {
    logger.warn('releaseAgentLock called without processId - cannot safely release', { agentId }, 'AgentLock');
    return;
  }
  
  const lockId = getAgentLockId(agentId);
  
  // Only delete if we're the holder (exact match for safety)
  const deleted = await prisma.generationLock.deleteMany({
    where: {
      id: lockId,
      lockedBy: processId, // Exact match for safety
    },
  });
  
  if (deleted.count > 0) {
    logger.info('Agent lock released', { agentId, lockHolder: processId }, 'AgentLock');
  } else {
    // Check if lock exists but held by someone else
    const lock = await prisma.generationLock.findUnique({
      where: { id: lockId },
    });
    
    if (lock) {
      logger.warn('Agent lock not held by this process', {
        agentId,
        requestedHolder: processId,
        actualHolder: lock.lockedBy,
      }, 'AgentLock');
    } else {
      logger.info('Agent lock already released or expired', { agentId, requestedHolder: processId }, 'AgentLock');
    }
  }
}

/**
 * Check if agent lock is held
 * 
 * @param agentId - Agent identifier
 * @returns Lock info if held, null if free
 */
export async function checkAgentLock(agentId: string) {
  const lockId = getAgentLockId(agentId);
  
  const lock = await prisma.generationLock.findUnique({
    where: { id: lockId },
  });
  
  if (!lock) return null;
  
  const now = new Date();
  if (lock.expiresAt < now) {
    // Lock is expired
    logger.info('Agent lock is expired', {
      agentId,
      holder: lock.lockedBy,
      expiredAt: lock.expiresAt,
    }, 'AgentLock');
    return null;
  }
  
  return {
    agentId,
    lockedBy: lock.lockedBy,
    lockedAt: lock.lockedAt,
    expiresAt: lock.expiresAt,
    operation: lock.operation,
  };
}

