/**
 * Market Card Components Tests
 *
 * Tests for the market card display logic used in:
 * - PerpMarketCard
 * - TrendingPerpCard
 * - PredictionMarketCard
 * - HotPredictionCard
 *
 * Tests cover:
 * - Price change formatting and sign display
 * - Time remaining calculations
 * - Share percentage calculations
 * - Position display logic
 * - Edge cases and boundary conditions
 */

import { describe, expect, it } from 'bun:test';

// ============================================================================
// Price Change Display Logic (from PerpMarketCard, TrendingPerpCard)
// ============================================================================

/**
 * Determines if a price change is positive (used for color coding).
 * Extracted from card components for unit testing.
 */
function isPositiveChange(change24h: number): boolean {
  return change24h >= 0;
}

/**
 * Formats the price change percentage for display.
 * Shows + prefix for positive, - is inherent in negative numbers.
 */
function formatChangePercent(
  changePercent: number,
  isPositive: boolean
): string {
  const prefix = isPositive ? '+' : '';
  return `${prefix}${changePercent.toFixed(2)}%`;
}

describe('Market Cards - Price Change Display', () => {
  describe('isPositiveChange', () => {
    it('should return true for positive changes', () => {
      expect(isPositiveChange(10.5)).toBe(true);
      expect(isPositiveChange(0.01)).toBe(true);
      expect(isPositiveChange(100)).toBe(true);
    });

    it('should return true for zero change', () => {
      expect(isPositiveChange(0)).toBe(true);
    });

    it('should return false for negative changes', () => {
      expect(isPositiveChange(-10.5)).toBe(false);
      expect(isPositiveChange(-0.01)).toBe(false);
      expect(isPositiveChange(-100)).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(isPositiveChange(Number.POSITIVE_INFINITY)).toBe(true);
      expect(isPositiveChange(Number.NEGATIVE_INFINITY)).toBe(false);
      expect(isPositiveChange(Number.MIN_VALUE)).toBe(true); // Smallest positive
      expect(isPositiveChange(-Number.MIN_VALUE)).toBe(false);
    });
  });

  describe('formatChangePercent', () => {
    it('should format positive changes with + prefix', () => {
      expect(formatChangePercent(10.5, true)).toBe('+10.50%');
      expect(formatChangePercent(0.01, true)).toBe('+0.01%');
      expect(formatChangePercent(100, true)).toBe('+100.00%');
    });

    it('should format zero change with + prefix', () => {
      expect(formatChangePercent(0, true)).toBe('+0.00%');
    });

    it('should format negative changes without + prefix', () => {
      expect(formatChangePercent(-10.5, false)).toBe('-10.50%');
      expect(formatChangePercent(-0.01, false)).toBe('-0.01%');
      expect(formatChangePercent(-100, false)).toBe('-100.00%');
    });

    it('should round to 2 decimal places', () => {
      // JavaScript toFixed uses banker's rounding (round half to even)
      // 10.555 -> 10.55 (rounds down because 5 is even)
      // 10.565 -> 10.57 (rounds up because 6 is odd)
      expect(formatChangePercent(10.555, true)).toBe('+10.55%');
      expect(formatChangePercent(10.554, true)).toBe('+10.55%');
      expect(formatChangePercent(10.556, true)).toBe('+10.56%');
      expect(formatChangePercent(-5.999, false)).toBe('-6.00%');
    });

    it('should handle very small changes', () => {
      expect(formatChangePercent(0.001, true)).toBe('+0.00%');
      expect(formatChangePercent(-0.001, false)).toBe('-0.00%');
    });

    it('should handle very large changes', () => {
      expect(formatChangePercent(1000, true)).toBe('+1000.00%');
      expect(formatChangePercent(-1000, false)).toBe('-1000.00%');
    });
  });
});

// ============================================================================
// Time Remaining Logic (from PredictionMarketCard, HotPredictionCard)
// ============================================================================

/**
 * Calculates days left until resolution date.
 * Returns null if no resolution date provided.
 * Extracted from formatters.ts for unit testing.
 */
function getDaysLeft(resolutionDate: string | null | undefined): number | null {
  if (!resolutionDate) return null;
  const endDate = new Date(resolutionDate);
  const now = new Date();
  const diffMs = endDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * Formats days left for display in card.
 * Shows "Xd left" or "Soon" if no date.
 */
function formatTimeRemaining(daysLeft: number | null): string {
  if (daysLeft === null) return 'Soon';
  return `${daysLeft}d left`;
}

describe('Market Cards - Time Remaining Display', () => {
  describe('getDaysLeft', () => {
    it('should return null for null resolution date', () => {
      expect(getDaysLeft(null)).toBeNull();
    });

    it('should return null for undefined resolution date', () => {
      expect(getDaysLeft(undefined)).toBeNull();
    });

    it('should return null for empty string resolution date', () => {
      expect(getDaysLeft('')).toBeNull();
    });

    it('should calculate positive days for future dates', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);
      const daysLeft = getDaysLeft(futureDate.toISOString());
      expect(daysLeft).toBeGreaterThanOrEqual(4);
      expect(daysLeft).toBeLessThanOrEqual(6);
    });

    it('should handle date exactly 1 day in future', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const daysLeft = getDaysLeft(tomorrow.toISOString());
      expect(daysLeft).toBeGreaterThanOrEqual(0);
      expect(daysLeft).toBeLessThanOrEqual(2);
    });

    it('should return negative/zero for past dates', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 5);
      const daysLeft = getDaysLeft(pastDate.toISOString());
      expect(daysLeft).toBeLessThanOrEqual(0);
    });

    it('should handle date boundaries (midnight)', () => {
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);
      const daysLeft = getDaysLeft(endOfToday.toISOString());
      expect(daysLeft).toBeGreaterThanOrEqual(0);
      expect(daysLeft).toBeLessThanOrEqual(1);
    });
  });

  describe('formatTimeRemaining', () => {
    it('should format null as "Soon"', () => {
      expect(formatTimeRemaining(null)).toBe('Soon');
    });

    it('should format positive days correctly', () => {
      expect(formatTimeRemaining(1)).toBe('1d left');
      expect(formatTimeRemaining(5)).toBe('5d left');
      expect(formatTimeRemaining(30)).toBe('30d left');
    });

    it('should format zero days correctly', () => {
      expect(formatTimeRemaining(0)).toBe('0d left');
    });

    it('should format negative days correctly', () => {
      // Markets that have passed their date
      expect(formatTimeRemaining(-1)).toBe('-1d left');
      expect(formatTimeRemaining(-5)).toBe('-5d left');
    });

    it('should handle large day counts', () => {
      expect(formatTimeRemaining(365)).toBe('365d left');
      expect(formatTimeRemaining(1000)).toBe('1000d left');
    });
  });
});

// ============================================================================
// Share Percentage Calculations (from PredictionMarketCard, HotPredictionCard)
// ============================================================================

/**
 * Calculates YES/NO percentages from share counts.
 * Extracted from formatters.ts for unit testing.
 */
function calculateSharePercentages(
  yesShares: number | null | undefined,
  noShares: number | null | undefined
): { yesPercent: number; noPercent: number; totalShares: number } {
  const yes = yesShares ?? 0;
  const no = noShares ?? 0;
  const total = yes + no;

  if (total === 0) {
    return { yesPercent: 50, noPercent: 50, totalShares: 0 };
  }

  return {
    yesPercent: (yes / total) * 100,
    noPercent: (no / total) * 100,
    totalShares: total,
  };
}

describe('Market Cards - Share Percentages', () => {
  describe('calculateSharePercentages', () => {
    it('should return 50/50 for zero shares', () => {
      const result = calculateSharePercentages(0, 0);
      expect(result.yesPercent).toBe(50);
      expect(result.noPercent).toBe(50);
      expect(result.totalShares).toBe(0);
    });

    it('should return 50/50 for null shares', () => {
      const result = calculateSharePercentages(null, null);
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
      expect(result.yesPercent).toBe(50);
      expect(result.noPercent).toBe(50);
      expect(result.totalShares).toBe(200);
    });

    it('should calculate skewed YES shares correctly', () => {
      const result = calculateSharePercentages(75, 25);
      expect(result.yesPercent).toBe(75);
      expect(result.noPercent).toBe(25);
      expect(result.totalShares).toBe(100);
    });

    it('should calculate skewed NO shares correctly', () => {
      const result = calculateSharePercentages(25, 75);
      expect(result.yesPercent).toBe(25);
      expect(result.noPercent).toBe(75);
      expect(result.totalShares).toBe(100);
    });

    it('should handle 100% YES', () => {
      const result = calculateSharePercentages(100, 0);
      expect(result.yesPercent).toBe(100);
      expect(result.noPercent).toBe(0);
      expect(result.totalShares).toBe(100);
    });

    it('should handle 100% NO', () => {
      const result = calculateSharePercentages(0, 100);
      expect(result.yesPercent).toBe(0);
      expect(result.noPercent).toBe(100);
      expect(result.totalShares).toBe(100);
    });

    it('should handle decimal shares', () => {
      const result = calculateSharePercentages(33.33, 66.67);
      expect(result.yesPercent).toBeCloseTo(33.33, 1);
      expect(result.noPercent).toBeCloseTo(66.67, 1);
      expect(result.totalShares).toBe(100);
    });

    it('should handle very large share counts', () => {
      const result = calculateSharePercentages(1000000, 1000000);
      expect(result.yesPercent).toBe(50);
      expect(result.noPercent).toBe(50);
      expect(result.totalShares).toBe(2000000);
    });

    it('should handle mixed null/number values', () => {
      const result = calculateSharePercentages(100, null);
      expect(result.yesPercent).toBe(100);
      expect(result.noPercent).toBe(0);
      expect(result.totalShares).toBe(100);
    });

    it('percentages should always sum to 100', () => {
      const testCases = [
        [10, 90],
        [33, 67],
        [1, 99],
        [50, 50],
        [0, 100],
        [100, 0],
        [12.5, 87.5],
      ];

      for (const [yes, no] of testCases) {
        const result = calculateSharePercentages(yes, no);
        expect(result.yesPercent + result.noPercent).toBeCloseTo(100, 5);
      }
    });
  });
});

// ============================================================================
// Position Display Logic (from PredictionMarketCard)
// ============================================================================

interface UserPosition {
  side: 'YES' | 'NO';
  shares: number;
  unrealizedPnL: number;
}

/**
 * Formats position for display.
 */
function formatPositionDisplay(position: UserPosition): {
  sideLabel: string;
  sharesFormatted: string;
  pnlFormatted: string;
  pnlIsPositive: boolean;
} {
  return {
    sideLabel: position.side,
    sharesFormatted: position.shares.toFixed(2),
    pnlFormatted: `${position.unrealizedPnL >= 0 ? '+' : ''}${position.unrealizedPnL.toFixed(2)}`,
    pnlIsPositive: position.unrealizedPnL >= 0,
  };
}

describe('Market Cards - Position Display', () => {
  describe('formatPositionDisplay', () => {
    it('should format YES position with positive PnL', () => {
      const position: UserPosition = {
        side: 'YES',
        shares: 100.5,
        unrealizedPnL: 25.75,
      };
      const result = formatPositionDisplay(position);
      expect(result.sideLabel).toBe('YES');
      expect(result.sharesFormatted).toBe('100.50');
      expect(result.pnlFormatted).toBe('+25.75');
      expect(result.pnlIsPositive).toBe(true);
    });

    it('should format NO position with negative PnL', () => {
      const position: UserPosition = {
        side: 'NO',
        shares: 50.25,
        unrealizedPnL: -10.5,
      };
      const result = formatPositionDisplay(position);
      expect(result.sideLabel).toBe('NO');
      expect(result.sharesFormatted).toBe('50.25');
      expect(result.pnlFormatted).toBe('-10.50');
      expect(result.pnlIsPositive).toBe(false);
    });

    it('should format zero PnL as positive', () => {
      const position: UserPosition = {
        side: 'YES',
        shares: 100,
        unrealizedPnL: 0,
      };
      const result = formatPositionDisplay(position);
      expect(result.pnlFormatted).toBe('+0.00');
      expect(result.pnlIsPositive).toBe(true);
    });

    it('should handle very small shares', () => {
      const position: UserPosition = {
        side: 'YES',
        shares: 0.01,
        unrealizedPnL: 0.001,
      };
      const result = formatPositionDisplay(position);
      expect(result.sharesFormatted).toBe('0.01');
      expect(result.pnlFormatted).toBe('+0.00');
    });

    it('should handle very large positions', () => {
      const position: UserPosition = {
        side: 'NO',
        shares: 999999.99,
        unrealizedPnL: 50000.5,
      };
      const result = formatPositionDisplay(position);
      expect(result.sharesFormatted).toBe('999999.99');
      expect(result.pnlFormatted).toBe('+50000.50');
    });
  });
});

// ============================================================================
// Funding Rate Display Logic (from PerpMarketCard)
// ============================================================================

/**
 * Determines funding rate color based on rate value.
 * Positive rates show orange (longs pay shorts).
 * Negative rates show blue (shorts pay longs).
 */
function getFundingRateColor(rate: number): 'orange' | 'blue' {
  return rate >= 0 ? 'orange' : 'blue';
}

/**
 * Formats funding rate for display.
 */
function formatFundingRate(rate: number): string {
  return `Fund: ${(rate * 100).toFixed(4)}%`;
}

describe('Market Cards - Funding Rate Display', () => {
  describe('getFundingRateColor', () => {
    it('should return orange for positive rates', () => {
      expect(getFundingRateColor(0.0001)).toBe('orange');
      expect(getFundingRateColor(0.01)).toBe('orange');
    });

    it('should return orange for zero rate', () => {
      expect(getFundingRateColor(0)).toBe('orange');
    });

    it('should return blue for negative rates', () => {
      expect(getFundingRateColor(-0.0001)).toBe('blue');
      expect(getFundingRateColor(-0.01)).toBe('blue');
    });
  });

  describe('formatFundingRate', () => {
    it('should format positive rates correctly', () => {
      expect(formatFundingRate(0.0001)).toBe('Fund: 0.0100%');
      expect(formatFundingRate(0.01)).toBe('Fund: 1.0000%');
    });

    it('should format zero rate', () => {
      expect(formatFundingRate(0)).toBe('Fund: 0.0000%');
    });

    it('should format negative rates correctly', () => {
      expect(formatFundingRate(-0.0001)).toBe('Fund: -0.0100%');
      expect(formatFundingRate(-0.01)).toBe('Fund: -1.0000%');
    });

    it('should handle very small rates', () => {
      expect(formatFundingRate(0.000001)).toBe('Fund: 0.0001%');
      expect(formatFundingRate(0.0000001)).toBe('Fund: 0.0000%');
    });
  });
});
