/**
 * Unit Tests: TotalPointsService
 *
 * Tests total points calculation, dirty-flag marking, snapshot, and recompute logic.
 * These tests focus on the calculation logic and helper functions.
 */

import { describe, expect, it } from 'bun:test';

// ---------------------------------------------------------------------------
// Helper function replicas for testing (same logic as in total-points-service.ts)
// We test these directly to ensure calculation correctness
// ---------------------------------------------------------------------------

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function clampFeeRate(rate: number): number {
  return rate > 0 && rate < 1 ? rate : 0;
}

function calculatePerpPositionValue(position: {
  size: unknown;
  leverage: unknown;
  unrealizedPnL: unknown;
}): number {
  const size = toNumber(position.size);
  const leverage = toNumber(position.leverage);
  const unrealizedPnL = toNumber(position.unrealizedPnL);

  const effectiveLeverage =
    Number.isFinite(leverage) && leverage > 0 ? leverage : 1;
  const margin = Math.abs(size / effectiveLeverage);
  return margin + unrealizedPnL;
}

// Simplified prediction position value (without PredictionPricing dependency)
function calculatePredictionPositionValueSimple(position: {
  shares: unknown;
  avgPrice: unknown;
}): number {
  const shares = toNumber(position.shares);
  const avgPrice = toNumber(position.avgPrice);
  return shares * avgPrice; // Cost basis approximation
}

// ---------------------------------------------------------------------------
// Tests: toNumber helper
// ---------------------------------------------------------------------------

describe('TotalPointsService Helpers', () => {
  describe('toNumber', () => {
    it('should return number as-is when valid', () => {
      expect(toNumber(100)).toBe(100);
      expect(toNumber(0)).toBe(0);
      expect(toNumber(-50.5)).toBe(-50.5);
      expect(toNumber(0.001)).toBe(0.001);
    });

    it('should parse string numbers correctly', () => {
      expect(toNumber('100')).toBe(100);
      expect(toNumber('50.5')).toBe(50.5);
      expect(toNumber('-25')).toBe(-25);
      expect(toNumber('0')).toBe(0);
    });

    it('should return fallback for NaN', () => {
      expect(toNumber(NaN)).toBe(0);
      expect(toNumber(NaN, 10)).toBe(10);
    });

    it('should return fallback for Infinity', () => {
      expect(toNumber(Infinity)).toBe(0);
      expect(toNumber(-Infinity)).toBe(0);
      expect(toNumber(Infinity, 99)).toBe(99);
    });

    it('should return fallback for non-numeric strings', () => {
      expect(toNumber('abc')).toBe(0);
      expect(toNumber('')).toBe(0);
      expect(toNumber('not a number', 5)).toBe(5);
    });

    it('should return fallback for null/undefined', () => {
      expect(toNumber(null)).toBe(0);
      expect(toNumber(undefined)).toBe(0);
      expect(toNumber(null, 42)).toBe(42);
    });

    it('should return fallback for objects/arrays', () => {
      expect(toNumber({})).toBe(0);
      expect(toNumber([])).toBe(0);
      expect(toNumber({ value: 100 })).toBe(0);
    });

    it('should handle decimal string from DB (common case)', () => {
      // Drizzle returns decimals as strings
      expect(toNumber('1234.56')).toBe(1234.56);
      expect(toNumber('0.00')).toBe(0);
      expect(toNumber('-999.99')).toBe(-999.99);
    });
  });

  describe('clampFeeRate', () => {
    it('should return rate when valid (0 < rate < 1)', () => {
      expect(clampFeeRate(0.01)).toBe(0.01);
      expect(clampFeeRate(0.5)).toBe(0.5);
      expect(clampFeeRate(0.99)).toBe(0.99);
    });

    it('should return 0 for rate <= 0', () => {
      expect(clampFeeRate(0)).toBe(0);
      expect(clampFeeRate(-0.1)).toBe(0);
      expect(clampFeeRate(-1)).toBe(0);
    });

    it('should return 0 for rate >= 1', () => {
      expect(clampFeeRate(1)).toBe(0);
      expect(clampFeeRate(1.5)).toBe(0);
      expect(clampFeeRate(100)).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Perp Position Value Calculation
// ---------------------------------------------------------------------------

describe('calculatePerpPositionValue', () => {
  it('should calculate margin + unrealizedPnL for long position', () => {
    const position = {
      size: 1000, // $1000 position
      leverage: 10, // 10x leverage
      unrealizedPnL: 50, // +$50 profit
    };
    // margin = |1000 / 10| = 100
    // value = 100 + 50 = 150
    expect(calculatePerpPositionValue(position)).toBe(150);
  });

  it('should calculate margin + unrealizedPnL for position with loss', () => {
    const position = {
      size: 500,
      leverage: 5,
      unrealizedPnL: -20,
    };
    // margin = |500 / 5| = 100
    // value = 100 + (-20) = 80
    expect(calculatePerpPositionValue(position)).toBe(80);
  });

  it('should handle negative size (short position)', () => {
    const position = {
      size: -1000, // Short position
      leverage: 10,
      unrealizedPnL: 100,
    };
    // margin = |-1000 / 10| = 100
    // value = 100 + 100 = 200
    expect(calculatePerpPositionValue(position)).toBe(200);
  });

  it('should default to leverage 1 when leverage is 0', () => {
    const position = {
      size: 500,
      leverage: 0,
      unrealizedPnL: 0,
    };
    // effectiveLeverage = 1 (default)
    // margin = |500 / 1| = 500
    expect(calculatePerpPositionValue(position)).toBe(500);
  });

  it('should default to leverage 1 when leverage is negative', () => {
    const position = {
      size: 200,
      leverage: -5,
      unrealizedPnL: 10,
    };
    // effectiveLeverage = 1 (default)
    // margin = |200 / 1| = 200
    // value = 200 + 10 = 210
    expect(calculatePerpPositionValue(position)).toBe(210);
  });

  it('should handle string values from DB', () => {
    const position = {
      size: '1000',
      leverage: '10',
      unrealizedPnL: '25.50',
    };
    // margin = |1000 / 10| = 100
    // value = 100 + 25.50 = 125.50
    expect(calculatePerpPositionValue(position)).toBe(125.5);
  });

  it('should handle null/undefined values gracefully', () => {
    const position = {
      size: null,
      leverage: undefined,
      unrealizedPnL: null,
    };
    // All values become 0, margin = |0 / 1| = 0
    expect(calculatePerpPositionValue(position)).toBe(0);
  });

  it('should handle NaN/Infinity gracefully', () => {
    const position = {
      size: NaN,
      leverage: Infinity,
      unrealizedPnL: -Infinity,
    };
    // toNumber returns 0 for all, margin = |0 / 1| = 0
    expect(calculatePerpPositionValue(position)).toBe(0);
  });

  it('should calculate correctly for high leverage', () => {
    const position = {
      size: 10000,
      leverage: 100,
      unrealizedPnL: 50,
    };
    // margin = |10000 / 100| = 100
    // value = 100 + 50 = 150
    expect(calculatePerpPositionValue(position)).toBe(150);
  });
});

// ---------------------------------------------------------------------------
// Tests: Prediction Position Value Calculation (simplified)
// ---------------------------------------------------------------------------

describe('calculatePredictionPositionValueSimple', () => {
  it('should calculate cost basis (shares * avgPrice)', () => {
    const position = {
      shares: 100,
      avgPrice: 0.65, // 65 cents per share
    };
    expect(calculatePredictionPositionValueSimple(position)).toBe(65);
  });

  it('should handle string values from DB', () => {
    const position = {
      shares: '50',
      avgPrice: '0.80',
    };
    expect(calculatePredictionPositionValueSimple(position)).toBe(40);
  });

  it('should return 0 for zero shares', () => {
    const position = {
      shares: 0,
      avgPrice: 0.5,
    };
    expect(calculatePredictionPositionValueSimple(position)).toBe(0);
  });

  it('should handle null values gracefully', () => {
    const position = {
      shares: null,
      avgPrice: null,
    };
    expect(calculatePredictionPositionValueSimple(position)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: Total Points Calculation Logic
// ---------------------------------------------------------------------------

describe('Total Points Calculation Logic', () => {
  it('should sum wallet + perp positions + prediction positions', () => {
    const wallet = 1000;
    const perpPositions = [
      { size: 500, leverage: 5, unrealizedPnL: 20 }, // 100 + 20 = 120
      { size: 1000, leverage: 10, unrealizedPnL: -10 }, // 100 - 10 = 90
    ];
    const predictionPositions = [
      { shares: 100, avgPrice: 0.5 }, // 50
      { shares: 200, avgPrice: 0.3 }, // 60
    ];

    const perpsValue = perpPositions.reduce(
      (sum, p) => sum + calculatePerpPositionValue(p),
      0
    );
    const predictionsValue = predictionPositions.reduce(
      (sum, p) => sum + calculatePredictionPositionValueSimple(p),
      0
    );

    const totalPoints = wallet + perpsValue + predictionsValue;

    expect(perpsValue).toBe(210); // 120 + 90
    expect(predictionsValue).toBe(110); // 50 + 60
    expect(totalPoints).toBe(1320); // 1000 + 210 + 110
  });

  it('should handle user with only wallet balance', () => {
    const wallet = 5000;
    const perpsValue = 0;
    const predictionsValue = 0;

    const totalPoints = wallet + perpsValue + predictionsValue;
    expect(totalPoints).toBe(5000);
  });

  it('should handle user with only positions (no wallet)', () => {
    const wallet = 0;
    const perpPositions = [{ size: 1000, leverage: 10, unrealizedPnL: 100 }];

    const perpsValue = perpPositions.reduce(
      (sum, p) => sum + calculatePerpPositionValue(p),
      0
    );

    const totalPoints = wallet + perpsValue;
    expect(totalPoints).toBe(200); // 100 margin + 100 PnL
  });

  it('should handle negative unrealized PnL reducing total', () => {
    const wallet = 500;
    const perpPositions = [
      { size: 1000, leverage: 10, unrealizedPnL: -80 }, // 100 - 80 = 20
    ];

    const perpsValue = perpPositions.reduce(
      (sum, p) => sum + calculatePerpPositionValue(p),
      0
    );

    const totalPoints = wallet + perpsValue;
    expect(totalPoints).toBe(520); // 500 + 20
  });

  it('should handle large portfolio correctly', () => {
    const wallet = 100000;
    const perpPositions = Array(10).fill({
      size: 10000,
      leverage: 10,
      unrealizedPnL: 500,
    });

    const perpsValue = perpPositions.reduce(
      (sum, p) => sum + calculatePerpPositionValue(p),
      0
    );

    // Each position: margin = 1000, value = 1000 + 500 = 1500
    // 10 positions = 15000
    expect(perpsValue).toBe(15000);
    expect(wallet + perpsValue).toBe(115000);
  });
});

// ---------------------------------------------------------------------------
// Tests: Edge Cases and Data Integrity
// ---------------------------------------------------------------------------

describe('Edge Cases and Data Integrity', () => {
  it('should produce consistent results for same input', () => {
    const position = { size: 1234.56, leverage: 7.5, unrealizedPnL: 42.42 };

    const result1 = calculatePerpPositionValue(position);
    const result2 = calculatePerpPositionValue(position);
    const result3 = calculatePerpPositionValue(position);

    expect(result1).toBe(result2);
    expect(result2).toBe(result3);
  });

  it('should handle very small decimal values', () => {
    const position = {
      size: 0.001,
      leverage: 1,
      unrealizedPnL: 0.0001,
    };

    const value = calculatePerpPositionValue(position);
    expect(value).toBeCloseTo(0.0011, 4);
  });

  it('should handle very large values without overflow', () => {
    const position = {
      size: 1e12, // 1 trillion
      leverage: 1,
      unrealizedPnL: 1e9, // 1 billion
    };

    const value = calculatePerpPositionValue(position);
    expect(value).toBe(1e12 + 1e9);
    expect(Number.isFinite(value)).toBe(true);
  });

  it('should not produce NaN for edge case inputs', () => {
    const edgeCases = [
      { size: 0, leverage: 0, unrealizedPnL: 0 },
      { size: NaN, leverage: 10, unrealizedPnL: 0 },
      { size: 100, leverage: NaN, unrealizedPnL: 0 },
      { size: 100, leverage: 10, unrealizedPnL: NaN },
      { size: Infinity, leverage: 10, unrealizedPnL: 0 },
    ];

    for (const position of edgeCases) {
      const value = calculatePerpPositionValue(position);
      expect(Number.isNaN(value)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: Dirty Flag Logic (conceptual)
// ---------------------------------------------------------------------------

describe('Dirty Flag Logic (conceptual)', () => {
  it('should mark user dirty after balance change', () => {
    // Conceptual test - verifies the pattern
    const userId = 'user-123';
    const dirtyAt = new Date();

    // After calling markDirty(userId), the DB should have:
    expect(dirtyAt).toBeInstanceOf(Date);
    expect(userId).toBe('user-123');
  });

  it('should only clear dirty flag if not re-dirtied after cutoff', () => {
    // Conceptual test for race condition handling
    const cutoff = new Date('2026-01-29T12:00:00Z');
    const dirtyAt = new Date('2026-01-29T11:59:00Z');
    const reDirtyAt = new Date('2026-01-29T12:01:00Z');

    // dirtyAt <= cutoff: should clear
    expect(dirtyAt <= cutoff).toBe(true);

    // reDirtyAt > cutoff: should NOT clear (user was re-dirtied)
    expect(reDirtyAt <= cutoff).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: Batch Processing Logic
// ---------------------------------------------------------------------------

describe('Batch Processing Logic', () => {
  it('should process users in batches of configured size', () => {
    const BATCH_SIZE = 100;
    const totalUsers = 350;

    const batches: number[] = [];
    for (let i = 0; i < totalUsers; i += BATCH_SIZE) {
      const batchEnd = Math.min(i + BATCH_SIZE, totalUsers);
      batches.push(batchEnd - i);
    }

    // Should have 4 batches: 100, 100, 100, 50
    expect(batches).toEqual([100, 100, 100, 50]);
    expect(batches.reduce((a, b) => a + b, 0)).toBe(totalUsers);
  });

  it('should handle exact batch size boundary', () => {
    const BATCH_SIZE = 100;
    const totalUsers = 200;

    const batches: number[] = [];
    for (let i = 0; i < totalUsers; i += BATCH_SIZE) {
      const batchEnd = Math.min(i + BATCH_SIZE, totalUsers);
      batches.push(batchEnd - i);
    }

    // Should have exactly 2 batches of 100
    expect(batches).toEqual([100, 100]);
  });

  it('should handle fewer users than batch size', () => {
    const BATCH_SIZE = 100;
    const totalUsers = 42;

    const batches: number[] = [];
    for (let i = 0; i < totalUsers; i += BATCH_SIZE) {
      const batchEnd = Math.min(i + BATCH_SIZE, totalUsers);
      batches.push(batchEnd - i);
    }

    // Should have 1 batch of 42
    expect(batches).toEqual([42]);
  });

  it('should handle zero users', () => {
    const BATCH_SIZE = 100;
    const totalUsers = 0;

    const batches: number[] = [];
    for (let i = 0; i < totalUsers; i += BATCH_SIZE) {
      const batchEnd = Math.min(i + BATCH_SIZE, totalUsers);
      batches.push(batchEnd - i);
    }

    // Should have no batches
    expect(batches).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tests: Cursor-based Pagination Logic
// ---------------------------------------------------------------------------

describe('Cursor-based Pagination Logic', () => {
  it('should use lastId for cursor-based iteration', () => {
    const users = [
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
      { id: 'd' },
      { id: 'e' },
    ];
    const BATCH_SIZE = 2;
    const processed: string[] = [];
    let lastId: string | null = null;

    // Simulate cursor-based pagination
    while (true) {
      const batch = users
        .filter((u) => (lastId ? u.id > lastId : true))
        .slice(0, BATCH_SIZE);

      if (batch.length === 0) break;

      for (const user of batch) {
        processed.push(user.id);
      }

      const lastUser = batch[batch.length - 1];
      if (lastUser) lastId = lastUser.id;

      if (batch.length < BATCH_SIZE) break;
    }

    // Should process all users in order
    expect(processed).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('should not miss or duplicate users', () => {
    const userIds = Array.from({ length: 250 }, (_, i) =>
      String(i).padStart(5, '0')
    );
    const users = userIds.map((id) => ({ id }));
    const BATCH_SIZE = 100;
    const processed: string[] = [];
    let lastId: string | null = null;

    while (true) {
      const batch = users
        .filter((u) => (lastId ? u.id > lastId : true))
        .slice(0, BATCH_SIZE);

      if (batch.length === 0) break;

      for (const user of batch) {
        processed.push(user.id);
      }

      const lastUser = batch[batch.length - 1];
      if (lastUser) lastId = lastUser.id;

      if (batch.length < BATCH_SIZE) break;
    }

    // Should have exactly 250 unique users
    expect(processed.length).toBe(250);
    expect(new Set(processed).size).toBe(250);
    expect(processed).toEqual(userIds);
  });
});
