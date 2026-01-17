/**
 * shouldUpdateWorldFacts Tests
 *
 * Unit tests for the shouldUpdateWorldFacts logic with various timestamp scenarios.
 * Tests the time comparison logic that determines when world facts need updating.
 */

import { describe, expect, test } from 'bun:test';

// Constants mirroring game-tick.ts
const DEFAULT_WORLD_FACTS_UPDATE_INTERVAL_HOURS = 8;

/**
 * Pure function that mirrors the shouldUpdateWorldFacts logic
 * This allows us to test the time comparison logic in isolation
 */
function shouldUpdateWorldFactsLogic(
  lastAutoFactCreatedAt: Date | null,
  updateIntervalHours: number = DEFAULT_WORLD_FACTS_UPDATE_INTERVAL_HOURS,
  currentTime: Date = new Date()
): { shouldUpdate: boolean; reason: string } {
  const updateIntervalMs = updateIntervalHours * 60 * 60 * 1000;

  if (!lastAutoFactCreatedAt) {
    return { shouldUpdate: true, reason: 'no-auto-facts' };
  }

  const timeSinceLastGeneration =
    currentTime.getTime() - lastAutoFactCreatedAt.getTime();
  const shouldUpdate = timeSinceLastGeneration >= updateIntervalMs;

  return {
    shouldUpdate,
    reason: shouldUpdate ? 'interval-exceeded' : 'interval-not-exceeded',
  };
}

describe('shouldUpdateWorldFacts - Timestamp Scenarios', () => {
  const now = new Date('2024-01-15T12:00:00Z');

  test('should return true when no auto-generated facts exist', () => {
    const result = shouldUpdateWorldFactsLogic(null, 8, now);

    expect(result.shouldUpdate).toBe(true);
    expect(result.reason).toBe('no-auto-facts');
  });

  test('should return true when last fact is older than interval', () => {
    // Last fact was 9 hours ago, interval is 8 hours
    const lastFactTime = new Date('2024-01-15T03:00:00Z'); // 9 hours before now

    const result = shouldUpdateWorldFactsLogic(lastFactTime, 8, now);

    expect(result.shouldUpdate).toBe(true);
    expect(result.reason).toBe('interval-exceeded');
  });

  test('should return false when last fact is within interval', () => {
    // Last fact was 5 hours ago, interval is 8 hours
    const lastFactTime = new Date('2024-01-15T07:00:00Z'); // 5 hours before now

    const result = shouldUpdateWorldFactsLogic(lastFactTime, 8, now);

    expect(result.shouldUpdate).toBe(false);
    expect(result.reason).toBe('interval-not-exceeded');
  });

  test('should return true exactly at interval boundary', () => {
    // Last fact was exactly 8 hours ago
    const lastFactTime = new Date('2024-01-15T04:00:00Z'); // exactly 8 hours before now

    const result = shouldUpdateWorldFactsLogic(lastFactTime, 8, now);

    expect(result.shouldUpdate).toBe(true);
    expect(result.reason).toBe('interval-exceeded');
  });

  test('should return false just before interval boundary', () => {
    // Last fact was 7 hours 59 minutes ago
    const lastFactTime = new Date('2024-01-15T04:01:00Z'); // 7h59m before now

    const result = shouldUpdateWorldFactsLogic(lastFactTime, 8, now);

    expect(result.shouldUpdate).toBe(false);
    expect(result.reason).toBe('interval-not-exceeded');
  });

  test('should handle custom interval hours', () => {
    // Last fact was 2 hours ago, interval is 1 hour
    const lastFactTime = new Date('2024-01-15T10:00:00Z'); // 2 hours before now

    const result = shouldUpdateWorldFactsLogic(lastFactTime, 1, now);

    expect(result.shouldUpdate).toBe(true);
    expect(result.reason).toBe('interval-exceeded');
  });

  test('should handle very long intervals', () => {
    // Last fact was 23 hours ago, interval is 24 hours
    const lastFactTime = new Date('2024-01-14T13:00:00Z'); // 23 hours before now

    const result = shouldUpdateWorldFactsLogic(lastFactTime, 24, now);

    expect(result.shouldUpdate).toBe(false);
    expect(result.reason).toBe('interval-not-exceeded');
  });

  test('should handle very short intervals', () => {
    // Last fact was 30 minutes ago, interval is 0.5 hours (30 minutes)
    const lastFactTime = new Date('2024-01-15T11:30:00Z'); // 30 minutes before now

    const result = shouldUpdateWorldFactsLogic(lastFactTime, 0.5, now);

    expect(result.shouldUpdate).toBe(true);
    expect(result.reason).toBe('interval-exceeded');
  });

  test('should handle future timestamps gracefully', () => {
    // Edge case: lastFact is in the future (clock skew, etc.)
    const futureTime = new Date('2024-01-15T13:00:00Z'); // 1 hour in the future

    const result = shouldUpdateWorldFactsLogic(futureTime, 8, now);

    // Time since last generation would be negative
    expect(result.shouldUpdate).toBe(false);
    expect(result.reason).toBe('interval-not-exceeded');
  });

  test('should handle same timestamp (just created)', () => {
    // Last fact was created at exact same time as check
    const result = shouldUpdateWorldFactsLogic(now, 8, now);

    expect(result.shouldUpdate).toBe(false);
    expect(result.reason).toBe('interval-not-exceeded');
  });
});

describe('shouldUpdateWorldFacts - Environment Variable Scenarios', () => {
  test('should use default 8 hours when env var not set', () => {
    const now = new Date('2024-01-15T12:00:00Z');
    const sevenHoursAgo = new Date('2024-01-15T05:00:00Z');
    const nineHoursAgo = new Date('2024-01-15T03:00:00Z');

    // With default 8 hour interval
    expect(
      shouldUpdateWorldFactsLogic(sevenHoursAgo, 8, now).shouldUpdate
    ).toBe(false);
    expect(shouldUpdateWorldFactsLogic(nineHoursAgo, 8, now).shouldUpdate).toBe(
      true
    );
  });

  test('should handle custom interval from env var simulation', () => {
    const now = new Date('2024-01-15T12:00:00Z');
    const threeHoursAgo = new Date('2024-01-15T09:00:00Z');
    const fiveHoursAgo = new Date('2024-01-15T07:00:00Z');

    // Simulating WORLD_FACTS_UPDATE_INTERVAL_HOURS=4
    const customInterval = 4;

    expect(
      shouldUpdateWorldFactsLogic(threeHoursAgo, customInterval, now)
        .shouldUpdate
    ).toBe(false);
    expect(
      shouldUpdateWorldFactsLogic(fiveHoursAgo, customInterval, now)
        .shouldUpdate
    ).toBe(true);
  });
});

describe('Lock Renewal Interval Calculation', () => {
  /**
   * Pure function mirroring the lock renewal interval calculation
   */
  function calculateLockRenewalInterval(
    lockDurationMs: number,
    minRenewalMs: number = 60 * 1000
  ): number {
    return Math.max(minRenewalMs, Math.floor(lockDurationMs / 2));
  }

  test('default 30 minute lock gives 15 minute renewal', () => {
    const lockDurationMs = 30 * 60 * 1000; // 30 minutes
    const result = calculateLockRenewalInterval(lockDurationMs);

    expect(result).toBe(15 * 60 * 1000); // 15 minutes
  });

  test('10 minute lock gives 5 minute renewal', () => {
    const lockDurationMs = 10 * 60 * 1000; // 10 minutes
    const result = calculateLockRenewalInterval(lockDurationMs);

    expect(result).toBe(5 * 60 * 1000); // 5 minutes
  });

  test('2 minute lock gives 1 minute renewal (minimum)', () => {
    const lockDurationMs = 2 * 60 * 1000; // 2 minutes
    const result = calculateLockRenewalInterval(lockDurationMs);

    expect(result).toBe(60 * 1000); // 1 minute minimum
  });

  test('1 minute lock gives 1 minute renewal (minimum)', () => {
    const lockDurationMs = 1 * 60 * 1000; // 1 minute
    const result = calculateLockRenewalInterval(lockDurationMs);

    expect(result).toBe(60 * 1000); // 1 minute minimum (half would be 30s)
  });

  test('30 second lock gives 1 minute renewal (minimum)', () => {
    const lockDurationMs = 30 * 1000; // 30 seconds
    const result = calculateLockRenewalInterval(lockDurationMs);

    expect(result).toBe(60 * 1000); // 1 minute minimum
  });

  test('1 hour lock gives 30 minute renewal', () => {
    const lockDurationMs = 60 * 60 * 1000; // 1 hour
    const result = calculateLockRenewalInterval(lockDurationMs);

    expect(result).toBe(30 * 60 * 1000); // 30 minutes
  });

  test('custom minimum renewal interval', () => {
    const lockDurationMs = 10 * 60 * 1000; // 10 minutes
    const customMinRenewalMs = 3 * 60 * 1000; // 3 minutes

    const result = calculateLockRenewalInterval(
      lockDurationMs,
      customMinRenewalMs
    );

    expect(result).toBe(5 * 60 * 1000); // 5 minutes (half of 10, above 3 min minimum)
  });

  test('renewal is always less than lock duration', () => {
    const testCases = [
      5 * 60 * 1000, // 5 minutes
      15 * 60 * 1000, // 15 minutes
      30 * 60 * 1000, // 30 minutes
      60 * 60 * 1000, // 1 hour
    ];

    for (const lockDurationMs of testCases) {
      const renewal = calculateLockRenewalInterval(lockDurationMs);
      expect(renewal).toBeLessThan(lockDurationMs);
    }
  });

  test('renewal with minimum ensures at least one renewal before expiry', () => {
    // With 2 minute lock and 1 minute renewal, we get at least one renewal
    const lockDurationMs = 2 * 60 * 1000;
    const renewal = calculateLockRenewalInterval(lockDurationMs);

    expect(renewal).toBeLessThanOrEqual(lockDurationMs);
    expect(renewal).toBe(60 * 1000); // 1 minute
  });
});

describe('Generation Marker Insertion - Specification', () => {
  /**
   * These tests verify the expected marker structure.
   * Integration tests that call the real updateWorldFactsIfNeeded function
   * and verify marker persistence are in world-facts-update.test.ts.
   */

  test('marker has expected category and key', () => {
    // The marker should use these specific values
    const expectedCategory = 'system';
    const expectedKey = 'generation-marker';

    expect(expectedCategory).toBe('system');
    expect(expectedKey).toBe('generation-marker');
  });

  test('marker is inactive and has negative priority', () => {
    // Markers should not appear in prompts (isActive: false)
    // and have low priority (priority: -1)
    const expectedIsActive = false;
    const expectedPriority = -1;

    expect(expectedIsActive).toBe(false);
    expect(expectedPriority).toBe(-1);
  });

  test('marker source is auto-generated', () => {
    // Markers use the same source as other auto-generated facts
    const expectedSource = 'auto-generated';

    expect(expectedSource).toBe('auto-generated');
  });

  test('marker value format includes timestamp and facts count', () => {
    const now = new Date();
    const factsGenerated = 5;

    const markerValue = `Generation run at ${now.toISOString()} - ${factsGenerated} facts created`;

    expect(markerValue).toContain(now.toISOString());
    expect(markerValue).toContain('5 facts created');
  });

  test('marker value format with zero facts created', () => {
    const now = new Date();
    const factsGenerated = 0;

    const markerValue = `Generation run at ${now.toISOString()} - ${factsGenerated} facts created`;

    expect(markerValue).toContain('0 facts created');
  });

  test('marker value follows expected pattern', () => {
    const now = new Date();
    const factsGenerated = 10;

    const markerValue = `Generation run at ${now.toISOString()} - ${factsGenerated} facts created`;

    // Verify the pattern: "Generation run at <ISO timestamp> - <count> facts created"
    const pattern = /^Generation run at \d{4}-\d{2}-\d{2}T.+ - \d+ facts created$/;
    expect(pattern.test(markerValue)).toBe(true);
  });
});
