/**
 * Tests for Generation Lock Service
 *
 * @description
 * Verifies the distributed locking mechanism works correctly
 * to prevent concurrent tick generation.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { db } from '@/db';
import {
  acquireGenerationLock,
  checkGenerationLock,
  releaseGenerationLock,
} from '../generation-lock-service';

describe('GenerationLockService', () => {
  // Clean up locks before and after each test
  beforeEach(async () => {
    await db.generationLock.deleteMany({});
  });

  afterEach(async () => {
    await db.generationLock.deleteMany({});
  });

  test('acquireGenerationLock succeeds when no lock exists', async () => {
    const acquired = await acquireGenerationLock('test-process-1');
    expect(acquired).toBe(true);
  });

  test('acquireGenerationLock fails when lock already held', async () => {
    // First process acquires
    const acquired1 = await acquireGenerationLock('test-process-1');
    expect(acquired1).toBe(true);

    // Second process tries to acquire
    const acquired2 = await acquireGenerationLock('test-process-2');
    expect(acquired2).toBe(false);
  });

  test('releaseGenerationLock frees the lock', async () => {
    // Acquire lock
    await acquireGenerationLock('test-process-1');

    // Release lock
    await releaseGenerationLock('test-process-1');

    // Should be able to acquire again
    const acquired = await acquireGenerationLock('test-process-2');
    expect(acquired).toBe(true);
  });

  test('lock expires after expiry time', async () => {
    // This test would need to wait 5 minutes or mock time
    // For now, verify the expiry is set correctly
    await acquireGenerationLock('test-process-1');

    const lock = await checkGenerationLock();
    expect(lock).not.toBeNull();
    expect(lock?.expiresAt).toBeDefined();

    // Expiry should be ~5 minutes in future
    const now = new Date();
    const expiryTime = lock!.expiresAt.getTime() - now.getTime();
    expect(expiryTime).toBeGreaterThan(4 * 60 * 1000); // At least 4 min
    expect(expiryTime).toBeLessThan(6 * 60 * 1000); // At most 6 min
  });

  test('checkGenerationLock returns null when no lock', async () => {
    const lock = await checkGenerationLock();
    expect(lock).toBeNull();
  });

  test('checkGenerationLock returns lock info when held', async () => {
    await acquireGenerationLock('test-process-1');

    const lock = await checkGenerationLock();
    expect(lock).not.toBeNull();
    expect(lock?.lockedBy).toBe('test-process-1');
    expect(lock?.operation).toBe('game-tick');
  });
});
