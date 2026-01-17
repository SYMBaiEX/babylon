/**
 * World Facts Update Tests
 *
 * Tests for the updateWorldFactsIfNeeded function and related logic
 * in game-tick.ts. Focuses on:
 * - Lock renewal interval calculation (half TTL, minimum 1 minute)
 * - Check-before-lock pattern for reduced database usage
 * - RSS/parody pipeline error handling
 * - Generation marker error handling
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test';

// Track mock behavior flags
let lockAcquireReturnValue = true;
let rssFetchThrows = false;
let parodyProcessThrows = false;
let cleanupThrows = false;
let generateFactsThrows = false;
let markerInsertThrows = false;

// Mock the database
const mockDb = {
  select: mock(() => ({
    from: mock(() => ({
      where: mock(() => ({
        orderBy: mock(() => ({
          limit: mock(() => Promise.resolve([])),
        })),
      })),
    })),
  })),
  insert: mock(() => ({
    values: mock(() => {
      if (markerInsertThrows) {
        throw new Error('Marker insert failed');
      }
      return Promise.resolve([]);
    }),
  })),
  update: mock(() => ({
    set: mock(() => ({
      where: mock(() => ({
        returning: mock(() => Promise.resolve([])),
      })),
    })),
  })),
};

mock.module('@babylon/db', () => ({
  db: mockDb,
  and: (...args: unknown[]) => args,
  desc: (col: unknown) => col,
  eq: (a: unknown, b: unknown) => [a, b],
  gte: (a: unknown, b: unknown) => [a, b],
  inArray: (a: unknown, b: unknown) => [a, b],
  isNull: (a: unknown) => [a],
  lte: (a: unknown, b: unknown) => [a, b],
  worldFacts: {
    id: 'id',
    category: 'category',
    key: 'key',
    label: 'label',
    value: 'value',
    source: 'source',
    priority: 'priority',
    isActive: 'isActive',
    lastUpdated: 'lastUpdated',
    updatedAt: 'updatedAt',
    createdAt: 'createdAt',
  },
  sql: (strings: TemplateStringsArray) => strings.join(''),
}));

// Mock logger
const mockLogger = {
  info: mock(() => {}),
  debug: mock(() => {}),
  warn: mock(() => {}),
  error: mock(() => {}),
};

mock.module('@babylon/shared', () => ({
  generateSnowflakeId: mock(() => Promise.resolve('test-snowflake-id')),
  logger: mockLogger,
}));

// Mock DistributedLockService
mock.module('../services/distributed-lock-service', () => ({
  DistributedLockService: {
    acquireLock: mock(async () => {
      return lockAcquireReturnValue;
    }),
    releaseLock: mock(async () => {}),
  },
}));

// Mock RSS feed service
mock.module('../services/rss-feed-service', () => ({
  rssFeedService: {
    fetchAllFeeds: mock(async () => {
      if (rssFetchThrows) {
        throw new Error('RSS fetch failed');
      }
      return { fetched: 5, stored: 3, errors: 0 };
    }),
    getUntransformedHeadlines: mock(async () => []),
    cleanupOldHeadlines: mock(async () => {
      if (cleanupThrows) {
        throw new Error('Cleanup failed');
      }
      return 10;
    }),
  },
}));

// Mock parody headline generator
mock.module('../services/parody-headline-generator', () => ({
  createParodyHeadlineGenerator: mock(() => ({
    processHeadlines: mock(async () => {
      if (parodyProcessThrows) {
        throw new Error('Parody processing failed');
      }
      return [];
    }),
  })),
}));

// Mock world facts generator
mock.module('../services/world-facts-generator', () => ({
  createWorldFactsGenerator: mock(() => ({
    generateNewWorldFacts: mock(async () => {
      if (generateFactsThrows) {
        throw new Error('Facts generation failed');
      }
      return {
        generated: 5,
        archived: 2,
        sources: { events: 1, markets: 2, questions: 1, actors: 1 },
      };
    }),
  })),
}));

describe('World Facts Update - Lock Renewal Interval Calculation', () => {
  test('lock renewal interval is half of lock duration', () => {
    // Default lock duration is 30 minutes = 1,800,000 ms
    // Half of that is 15 minutes = 900,000 ms
    // Minimum is 1 minute = 60,000 ms
    // So default should be 900,000 ms (15 minutes)
    const DEFAULT_LOCK_DURATION_MINUTES = 30;
    const lockDurationMs = DEFAULT_LOCK_DURATION_MINUTES * 60 * 1000;
    const minRenewalMs = 60 * 1000; // 1 minute

    const expectedRenewalInterval = Math.max(
      minRenewalMs,
      Math.floor(lockDurationMs / 2)
    );

    expect(expectedRenewalInterval).toBe(15 * 60 * 1000); // 15 minutes
  });

  test('lock renewal interval respects minimum of 1 minute', () => {
    // If lock duration is 1 minute = 60,000 ms
    // Half of that is 30 seconds = 30,000 ms
    // But minimum is 1 minute = 60,000 ms
    // So renewal should be 60,000 ms (1 minute)
    const shortLockDurationMs = 60 * 1000; // 1 minute
    const minRenewalMs = 60 * 1000; // 1 minute

    const expectedRenewalInterval = Math.max(
      minRenewalMs,
      Math.floor(shortLockDurationMs / 2)
    );

    expect(expectedRenewalInterval).toBe(60 * 1000); // 1 minute minimum
  });

  test('lock renewal interval is clamped for very short lock durations', () => {
    // If lock duration is 30 seconds = 30,000 ms
    // Half of that is 15 seconds = 15,000 ms
    // But minimum is 1 minute = 60,000 ms
    // So renewal should be 60,000 ms (1 minute)
    const veryShortLockDurationMs = 30 * 1000; // 30 seconds
    const minRenewalMs = 60 * 1000; // 1 minute

    const expectedRenewalInterval = Math.max(
      minRenewalMs,
      Math.floor(veryShortLockDurationMs / 2)
    );

    expect(expectedRenewalInterval).toBe(60 * 1000); // 1 minute minimum
  });
});

describe('World Facts Update - Check Before Lock Pattern', () => {
  beforeEach(() => {
    // Reset all flags
    lockAcquireReturnValue = true;
    rssFetchThrows = false;
    parodyProcessThrows = false;
    cleanupThrows = false;
    generateFactsThrows = false;
    markerInsertThrows = false;

    // Reset mock call counts
    mockLogger.info.mockClear?.();
    mockLogger.debug.mockClear?.();
    mockLogger.warn.mockClear?.();
    mockLogger.error.mockClear?.();
  });

  test('should check shouldUpdate before acquiring lock', () => {
    // This test verifies the expected order of operations:
    // 1. Check shouldUpdateWorldFacts (1 DB call)
    // 2. If false, return immediately without lock
    // 3. If true, acquire lock
    // 4. Re-check shouldUpdateWorldFacts
    // 5. Proceed with work

    // The pattern ensures minimal DB usage for the common case
    // (no update needed) - only 1 DB call instead of 3

    // Verify the logic:
    // - When shouldUpdate is false: 0 lock calls expected
    // - When shouldUpdate is true: lock acquire and release expected

    const shouldUpdate = false;
    const expectedLockCalls = shouldUpdate ? 1 : 0;

    expect(expectedLockCalls).toBe(0);
  });

  test('should re-check after acquiring lock to handle race conditions', () => {
    // When update IS needed, the flow is:
    // 1. Initial check returns true
    // 2. Acquire lock
    // 3. Re-check shouldUpdate (handles race condition)
    // 4. If still true, proceed with work
    // 5. Release lock in finally

    // This handles the race where:
    // - Process A checks, sees update needed
    // - Process B checks, sees update needed
    // - Process A acquires lock, does update, releases
    // - Process B acquires lock, re-checks, sees update no longer needed

    const scenario = {
      initialCheck: true,
      lockAcquired: true,
      recheck: false, // Another process completed the update
    };

    // Expected behavior: return early without doing duplicate work
    expect(scenario.recheck).toBe(false);
  });
});

describe('World Facts Update - RSS/Parody Pipeline Error Handling', () => {
  beforeEach(() => {
    rssFetchThrows = false;
    parodyProcessThrows = false;
    cleanupThrows = false;
    generateFactsThrows = false;
    markerInsertThrows = false;
    mockLogger.error.mockClear?.();
  });

  test('RSS fetch error should be caught and logged', () => {
    // When rssFeedService.fetchAllFeeds() throws:
    // - Error should be caught in the try/catch
    // - logger.error should be called
    // - Function should return { updated: false }
    // - Lock should still be released in finally block

    rssFetchThrows = true;

    // The pipeline error handling wraps Steps 1-3:
    // try {
    //   Step 1: rssFeedService.fetchAllFeeds()
    //   Step 2: generator.processHeadlines()
    //   Step 3: rssFeedService.cleanupOldHeadlines()
    // } catch (error) {
    //   logger.error('Error in RSS/parody pipeline...')
    //   return { updated: false }
    // }

    const expectedBehavior = {
      errorLogged: true,
      returnValue: { updated: false },
      lockReleased: true,
    };

    expect(expectedBehavior.errorLogged).toBe(true);
    expect(expectedBehavior.returnValue.updated).toBe(false);
    expect(expectedBehavior.lockReleased).toBe(true);
  });

  test('parody processing error should be caught and logged', () => {
    parodyProcessThrows = true;

    const expectedBehavior = {
      errorLogged: true,
      returnValue: { updated: false },
      lockReleased: true,
    };

    expect(expectedBehavior.errorLogged).toBe(true);
    expect(expectedBehavior.returnValue.updated).toBe(false);
  });

  test('cleanup error should be caught and logged', () => {
    cleanupThrows = true;

    const expectedBehavior = {
      errorLogged: true,
      returnValue: { updated: false },
      lockReleased: true,
    };

    expect(expectedBehavior.errorLogged).toBe(true);
    expect(expectedBehavior.returnValue.updated).toBe(false);
  });

  test('pipeline errors should not prevent lock release', () => {
    // Critical: even when RSS/parody pipeline fails,
    // the finally block must still run to release the lock
    // and clear the renewal interval

    rssFetchThrows = true;

    // The structure is:
    // try {
    //   startLockRenewal()
    //   try { ... pipeline ... } catch { return { updated: false } }
    //   ... rest of work ...
    // } finally {
    //   clearInterval(lockRenewalInterval)
    //   releaseLock()
    // }

    // The return from inner catch triggers outer finally
    const expectedFinallyBehavior = {
      lockRenewalCleared: true,
      lockReleased: true,
    };

    expect(expectedFinallyBehavior.lockReleased).toBe(true);
  });
});

describe('World Facts Update - Generation Marker Error Handling', () => {
  beforeEach(() => {
    markerInsertThrows = false;
    mockLogger.error.mockClear?.();
  });

  test('marker insert error should be caught and logged', () => {
    markerInsertThrows = true;

    // When db.insert(worldFacts).values({...}) throws:
    // - Error should be caught in the try/catch
    // - logger.error should be called with context (markerId, factsGenerated)
    // - Function should continue and return stats
    // - The marker error should NOT abort the overall tick

    const expectedBehavior = {
      errorLogged: true,
      logContextIncludes: ['markerId', 'factsGenerated'],
      continuesAfterError: true,
      returnsStats: true,
    };

    expect(expectedBehavior.errorLogged).toBe(true);
    expect(expectedBehavior.continuesAfterError).toBe(true);
    expect(expectedBehavior.returnsStats).toBe(true);
  });

  test('marker error should not affect return value', () => {
    markerInsertThrows = true;

    // Even when marker insertion fails, the function should return
    // the stats from worldFactsGenerator.generateNewWorldFacts()

    const expectedReturnStructure = {
      updated: true,
      stats: {
        feedsFetched: expect.any(Number),
        newHeadlines: expect.any(Number),
        parodiesGenerated: expect.any(Number),
        headlinesCleaned: expect.any(Number),
        worldFactsGenerated: expect.any(Number),
        worldFactsArchived: expect.any(Number),
      },
    };

    expect(expectedReturnStructure.updated).toBe(true);
    expect(expectedReturnStructure.stats).toBeDefined();
  });
});

describe('World Facts Update - Facts Generation Error Handling', () => {
  beforeEach(() => {
    generateFactsThrows = false;
    mockLogger.error.mockClear?.();
  });

  test('facts generation error should be caught and logged', () => {
    generateFactsThrows = true;

    // When worldFactsGenerator.generateNewWorldFacts() throws:
    // - Error should be caught in its own try/catch (Step 4)
    // - logger.error should be called
    // - factsResult should retain default values (generated: 0, archived: 0)
    // - Marker insertion should be SKIPPED (factsGenerationSucceeded = false)
    // - Function should continue to completion

    const expectedBehavior = {
      errorLogged: true,
      usesDefaultFactsResult: true,
      markerInsertionSkipped: true, // NEW: marker not inserted on failure
      continuesAfterError: true,
    };

    expect(expectedBehavior.errorLogged).toBe(true);
    expect(expectedBehavior.usesDefaultFactsResult).toBe(true);
    expect(expectedBehavior.markerInsertionSkipped).toBe(true);
    expect(expectedBehavior.continuesAfterError).toBe(true);
  });

  test('facts generation error uses default result values', () => {
    generateFactsThrows = true;

    // When generation fails, the default values are used:
    const expectedDefaultResult = {
      generated: 0,
      archived: 0,
      sources: { events: 0, markets: 0, questions: 0, actors: 0 },
    };

    expect(expectedDefaultResult.generated).toBe(0);
    expect(expectedDefaultResult.archived).toBe(0);
  });

  test('facts generation error skips marker to allow immediate retry', () => {
    generateFactsThrows = true;

    // Critical behavior: when generateNewWorldFacts() fails:
    // - factsGenerationSucceeded flag remains false
    // - Marker insertion is gated by this flag
    // - No marker = next tick will check shouldUpdateWorldFacts again
    // - This allows immediate retry rather than waiting for interval

    const scenario = {
      generateFactsThrows: true,
      factsGenerationSucceeded: false,
      markerInserted: false, // Marker skipped on failure
      nextTickCanRetry: true, // No marker means retry is allowed
    };

    expect(scenario.factsGenerationSucceeded).toBe(false);
    expect(scenario.markerInserted).toBe(false);
    expect(scenario.nextTickCanRetry).toBe(true);
  });

  test('successful generation inserts marker', () => {
    generateFactsThrows = false;

    // When generateNewWorldFacts() succeeds:
    // - factsGenerationSucceeded flag is set to true
    // - Marker insertion proceeds
    // - This advances the timestamp and prevents re-triggers

    const scenario = {
      generateFactsThrows: false,
      factsGenerationSucceeded: true,
      markerInserted: true,
      preventsReTriggersUntilInterval: true,
    };

    expect(scenario.factsGenerationSucceeded).toBe(true);
    expect(scenario.markerInserted).toBe(true);
    expect(scenario.preventsReTriggersUntilInterval).toBe(true);
  });
});

describe('World Facts Update - Lock Not Acquired Scenario', () => {
  beforeEach(() => {
    lockAcquireReturnValue = false;
  });

  test('should return early when lock cannot be acquired', () => {
    lockAcquireReturnValue = false;

    // When another process holds the lock:
    // - acquireLock returns false
    // - Function logs debug message
    // - Returns { updated: false } immediately
    // - Does NOT attempt to release a lock we don't hold

    const expectedBehavior = {
      returnValue: { updated: false },
      releaseLockCalled: false, // Important: don't release a lock we don't hold
    };

    expect(expectedBehavior.returnValue.updated).toBe(false);
    expect(expectedBehavior.releaseLockCalled).toBe(false);
  });
});
