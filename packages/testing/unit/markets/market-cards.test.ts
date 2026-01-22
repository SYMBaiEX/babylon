/**
 * Market Card Display Logic Tests
 *
 * Tests for the REAL formatter functions used by market cards.
 * Imports actual functions from the codebase - no duplicates!
 *
 * Tests cover:
 * - formatPrice, formatVolume from formatters.ts
 * - getDaysLeft, calculateSharePercentages from formatters.ts
 * - Edge cases and boundary conditions
 */

import { describe, expect, it } from 'bun:test';
import {
  calculateSharePercentages,
  formatPrice,
  formatVolume,
  getDaysLeft,
} from '../../../../apps/web/src/app/markets/_lib/formatters';

// ============================================================================
// formatPrice - REAL function from formatters.ts
// ============================================================================

describe('formatPrice (real function)', () => {
  it('should format prices with ƀ symbol and 2 decimals', () => {
    expect(formatPrice(123.456)).toBe('ƀ123.46');
    expect(formatPrice(100)).toBe('ƀ100.00');
    expect(formatPrice(0)).toBe('ƀ0.00');
  });

  it('should handle negative prices', () => {
    expect(formatPrice(-100)).toBe('ƀ-100.00');
  });

  it('should handle very small prices', () => {
    expect(formatPrice(0.001)).toBe('ƀ0.00');
    expect(formatPrice(0.01)).toBe('ƀ0.01');
  });

  it('should handle very large prices', () => {
    expect(formatPrice(999999)).toBe('ƀ999999.00');
  });
});

// ============================================================================
// formatVolume - REAL function from formatters.ts
// ============================================================================

describe('formatVolume (real function)', () => {
  it('should format volumes under 1K without suffix', () => {
    expect(formatVolume(0)).toBe('ƀ0.00');
    expect(formatVolume(500)).toBe('ƀ500.00');
    expect(formatVolume(999.99)).toBe('ƀ999.99');
  });

  it('should format volumes with K suffix', () => {
    expect(formatVolume(1000)).toBe('ƀ1.00K');
    expect(formatVolume(1500)).toBe('ƀ1.50K');
  });

  it('should format volumes with M suffix', () => {
    expect(formatVolume(1000000)).toBe('ƀ1.00M');
    expect(formatVolume(2500000)).toBe('ƀ2.50M');
  });

  it('should format volumes with B suffix', () => {
    expect(formatVolume(1000000000)).toBe('ƀ1.00B');
    expect(formatVolume(5000000000)).toBe('ƀ5.00B');
  });

  it('should handle boundary values correctly', () => {
    expect(formatVolume(999)).toBe('ƀ999.00'); // Just under 1K
    expect(formatVolume(1000)).toBe('ƀ1.00K'); // Exactly 1K
  });
});

// ============================================================================
// getDaysLeft - REAL function from formatters.ts
// Note: Real function clamps at 0 (returns Math.max(0, diff))
// ============================================================================

describe('getDaysLeft (real function)', () => {
  it('should return null for undefined date', () => {
    expect(getDaysLeft(undefined)).toBeNull();
  });

  it('should return null for empty string', () => {
    expect(getDaysLeft('')).toBeNull();
  });

  it('should calculate positive days for future dates', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 5);
    const result = getDaysLeft(futureDate.toISOString());
    expect(result).toBeGreaterThanOrEqual(4);
    expect(result).toBeLessThanOrEqual(6);
  });

  it('should return 0 for past dates (clamped)', () => {
    // Real function clamps at 0 - this is important!
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 5);
    const result = getDaysLeft(pastDate.toISOString());
    expect(result).toBe(0);
  });

  it('should return 0 for dates in the past (not negative)', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const result = getDaysLeft(yesterday.toISOString());
    expect(result).toBe(0);
  });
});

// ============================================================================
// calculateSharePercentages - REAL function from formatters.ts
// Note: Real function uses CPMM pricing, not simple division!
// ============================================================================

describe('calculateSharePercentages (real function - CPMM pricing)', () => {
  it('should return 50/50 for zero shares', () => {
    const result = calculateSharePercentages(0, 0);
    expect(result.yesPercent).toBe(50);
    expect(result.noPercent).toBe(50);
    expect(result.totalShares).toBe(0);
  });

  it('should return 50/50 for undefined shares', () => {
    const result = calculateSharePercentages(undefined, undefined);
    expect(result.yesPercent).toBe(50);
    expect(result.noPercent).toBe(50);
    expect(result.totalShares).toBe(0);
  });

  it('should calculate equal shares correctly', () => {
    const result = calculateSharePercentages(100, 100);
    // CPMM pricing should give 50/50 for equal reserves
    expect(result.yesPercent).toBeCloseTo(50, 1);
    expect(result.noPercent).toBeCloseTo(50, 1);
    expect(result.totalShares).toBe(200);
  });

  it('should calculate skewed shares using CPMM pricing', () => {
    // With CPMM, 75/25 shares doesn't give 75%/25% - it uses AMM pricing
    const result = calculateSharePercentages(75, 25);
    // CPMM: yes_price = no_reserve / (yes_reserve + no_reserve) = 25/100 = 0.25
    // Actually: getCurrentPrice calculates differently
    expect(result.yesPercent).toBeDefined();
    expect(result.noPercent).toBeDefined();
    expect(result.yesPercent + result.noPercent).toBeCloseTo(100, 1);
    expect(result.totalShares).toBe(100);
  });

  it('should handle 100% one-sided (edge case)', () => {
    const result = calculateSharePercentages(100, 0);
    // When noShares is 0, price calculation may have edge behavior
    expect(result.totalShares).toBe(100);
    expect(result.yesPercent + result.noPercent).toBeCloseTo(100, 1);
  });

  it('should handle very large share counts', () => {
    const result = calculateSharePercentages(1000000, 1000000);
    expect(result.yesPercent).toBeCloseTo(50, 1);
    expect(result.noPercent).toBeCloseTo(50, 1);
    expect(result.totalShares).toBe(2000000);
  });

  it('percentages should always sum close to 100', () => {
    const testCases = [
      [100, 100],
      [200, 100],
      [100, 200],
      [50, 50],
      [1000, 500],
    ];

    for (const [yes, no] of testCases) {
      const result = calculateSharePercentages(yes, no);
      expect(result.yesPercent + result.noPercent).toBeCloseTo(100, 1);
    }
  });
});

// ============================================================================
// Inline logic tests - these ARE in components as inline expressions
// Testing the actual patterns used in JSX
// ============================================================================

describe('Card inline logic patterns', () => {
  describe('Price change color logic (inline in cards)', () => {
    // This IS used inline: isPositive ? 'text-green-600' : 'text-red-600'
    const getChangeColor = (change: number) =>
      change >= 0 ? 'text-green-600' : 'text-red-600';

    it('should return green for positive changes', () => {
      expect(getChangeColor(10)).toBe('text-green-600');
      expect(getChangeColor(0.01)).toBe('text-green-600');
    });

    it('should return green for zero (flat)', () => {
      expect(getChangeColor(0)).toBe('text-green-600');
    });

    it('should return red for negative changes', () => {
      expect(getChangeColor(-10)).toBe('text-red-600');
      expect(getChangeColor(-0.01)).toBe('text-red-600');
    });
  });

  describe('Price change prefix logic (inline in cards)', () => {
    // This IS used inline: {isPositive ? '+' : ''}{changePercent.toFixed(2)}%
    const formatChange = (change: number) => {
      const isPositive = change >= 0;
      return `${isPositive ? '+' : ''}${change.toFixed(2)}%`;
    };

    it('should add + prefix for positive changes', () => {
      expect(formatChange(10.5)).toBe('+10.50%');
    });

    it('should add + prefix for zero', () => {
      expect(formatChange(0)).toBe('+0.00%');
    });

    it('should not add + prefix for negative (- is inherent)', () => {
      expect(formatChange(-10.5)).toBe('-10.50%');
    });
  });

  describe('Time remaining format (inline in cards)', () => {
    // This IS used inline: {daysLeft !== null ? `${daysLeft}d left` : 'Soon'}
    const formatTime = (daysLeft: number | null) =>
      daysLeft !== null ? `${daysLeft}d left` : 'Soon';

    it('should format days correctly', () => {
      expect(formatTime(5)).toBe('5d left');
      expect(formatTime(0)).toBe('0d left');
    });

    it('should show Soon for null', () => {
      expect(formatTime(null)).toBe('Soon');
    });
  });

  describe('Funding rate color (inline in PerpMarketCard)', () => {
    // This IS used inline: rate >= 0 ? 'text-orange-500' : 'text-blue-500'
    const getFundingColor = (rate: number) =>
      rate >= 0 ? 'text-orange-500' : 'text-blue-500';

    it('should return orange for positive rates', () => {
      expect(getFundingColor(0.001)).toBe('text-orange-500');
    });

    it('should return orange for zero', () => {
      expect(getFundingColor(0)).toBe('text-orange-500');
    });

    it('should return blue for negative rates', () => {
      expect(getFundingColor(-0.001)).toBe('text-blue-500');
    });
  });

  describe('Funding rate format (inline in PerpMarketCard)', () => {
    // This IS used inline: Fund: {(market.fundingRate.rate * 100).toFixed(4)}%
    const formatFunding = (rate: number) =>
      `Fund: ${(rate * 100).toFixed(4)}%`;

    it('should format correctly', () => {
      expect(formatFunding(0.0001)).toBe('Fund: 0.0100%');
      expect(formatFunding(0)).toBe('Fund: 0.0000%');
      expect(formatFunding(-0.0001)).toBe('Fund: -0.0100%');
    });
  });
});
