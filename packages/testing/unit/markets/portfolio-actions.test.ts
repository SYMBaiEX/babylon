/**
 * PortfolioPnLCard (Action Bar) Tests
 *
 * Tests for the portfolio action bar that displays Share P&L and Buy Points buttons.
 * Component was simplified to focus on actions only (balance is now in header).
 *
 * Tests cover:
 * - Button disabled states
 * - Loading state handling
 * - Data availability checks
 * - Edge cases for portfolio data
 */

import { describe, expect, it } from 'bun:test';

// ============================================================================
// Button State Logic
// ============================================================================

interface PortfolioPnLSnapshot {
  availableBalance: number;
  accountEquity: number;
  totalPnL: number;
  unrealizedPerpPnL: number;
  unrealizedPredictionPnL: number;
  totalDeposited: number;
  totalWithdrawn: number;
}

/**
 * Determines if the Share P&L button should be disabled.
 * Extracted from PortfolioPnLCard for unit testing.
 */
function isShareButtonDisabled(
  loading: boolean,
  data: PortfolioPnLSnapshot | null
): boolean {
  return loading || !data;
}

/**
 * Determines button state for the action bar.
 */
function getActionBarState(loading: boolean, data: PortfolioPnLSnapshot | null): {
  shareDisabled: boolean;
  buyPointsEnabled: boolean;
} {
  return {
    shareDisabled: loading || !data,
    buyPointsEnabled: true, // Buy points is always enabled
  };
}

describe('PortfolioPnLCard - Share Button State', () => {
  const mockData: PortfolioPnLSnapshot = {
    availableBalance: 1000,
    accountEquity: 1500,
    totalPnL: 500,
    unrealizedPerpPnL: 200,
    unrealizedPredictionPnL: 100,
    totalDeposited: 1000,
    totalWithdrawn: 0,
  };

  describe('isShareButtonDisabled', () => {
    it('should be disabled when loading is true', () => {
      expect(isShareButtonDisabled(true, mockData)).toBe(true);
    });

    it('should be disabled when data is null', () => {
      expect(isShareButtonDisabled(false, null)).toBe(true);
    });

    it('should be disabled when both loading and data is null', () => {
      expect(isShareButtonDisabled(true, null)).toBe(true);
    });

    it('should be enabled when not loading and data exists', () => {
      expect(isShareButtonDisabled(false, mockData)).toBe(false);
    });

    it('should be enabled even with zero balance data', () => {
      const zeroData: PortfolioPnLSnapshot = {
        ...mockData,
        availableBalance: 0,
        accountEquity: 0,
        totalPnL: 0,
      };
      expect(isShareButtonDisabled(false, zeroData)).toBe(false);
    });

    it('should be enabled with negative PnL data', () => {
      const negativeData: PortfolioPnLSnapshot = {
        ...mockData,
        totalPnL: -500,
        unrealizedPerpPnL: -300,
        unrealizedPredictionPnL: -200,
      };
      expect(isShareButtonDisabled(false, negativeData)).toBe(false);
    });
  });
});

describe('PortfolioPnLCard - Action Bar State', () => {
  const mockData: PortfolioPnLSnapshot = {
    availableBalance: 1000,
    accountEquity: 1500,
    totalPnL: 500,
    unrealizedPerpPnL: 200,
    unrealizedPredictionPnL: 100,
    totalDeposited: 1000,
    totalWithdrawn: 0,
  };

  describe('getActionBarState', () => {
    it('should have share disabled and buy enabled when loading', () => {
      const state = getActionBarState(true, mockData);
      expect(state.shareDisabled).toBe(true);
      expect(state.buyPointsEnabled).toBe(true);
    });

    it('should have share disabled and buy enabled when no data', () => {
      const state = getActionBarState(false, null);
      expect(state.shareDisabled).toBe(true);
      expect(state.buyPointsEnabled).toBe(true);
    });

    it('should have both enabled when data exists and not loading', () => {
      const state = getActionBarState(false, mockData);
      expect(state.shareDisabled).toBe(false);
      expect(state.buyPointsEnabled).toBe(true);
    });

    it('buy points should always be enabled regardless of state', () => {
      expect(getActionBarState(true, null).buyPointsEnabled).toBe(true);
      expect(getActionBarState(true, mockData).buyPointsEnabled).toBe(true);
      expect(getActionBarState(false, null).buyPointsEnabled).toBe(true);
      expect(getActionBarState(false, mockData).buyPointsEnabled).toBe(true);
    });
  });
});

describe('PortfolioPnLCard - Portfolio Data Validation', () => {
  /**
   * Validates portfolio data has expected structure.
   */
  function isValidPortfolioData(
    data: unknown
  ): data is PortfolioPnLSnapshot {
    if (!data || typeof data !== 'object') return false;
    const d = data as Record<string, unknown>;
    return (
      typeof d.availableBalance === 'number' &&
      typeof d.accountEquity === 'number' &&
      typeof d.totalPnL === 'number'
    );
  }

  it('should validate complete portfolio data', () => {
    const data: PortfolioPnLSnapshot = {
      availableBalance: 1000,
      accountEquity: 1500,
      totalPnL: 500,
      unrealizedPerpPnL: 200,
      unrealizedPredictionPnL: 100,
      totalDeposited: 1000,
      totalWithdrawn: 0,
    };
    expect(isValidPortfolioData(data)).toBe(true);
  });

  it('should reject null', () => {
    expect(isValidPortfolioData(null)).toBe(false);
  });

  it('should reject undefined', () => {
    expect(isValidPortfolioData(undefined)).toBe(false);
  });

  it('should reject empty object', () => {
    expect(isValidPortfolioData({})).toBe(false);
  });

  it('should reject object missing required fields', () => {
    expect(isValidPortfolioData({ availableBalance: 1000 })).toBe(false);
    expect(
      isValidPortfolioData({ availableBalance: 1000, accountEquity: 1500 })
    ).toBe(false);
  });

  it('should reject object with string values', () => {
    expect(
      isValidPortfolioData({
        availableBalance: '1000',
        accountEquity: '1500',
        totalPnL: '500',
      })
    ).toBe(false);
  });

  it('should accept object with zero values', () => {
    expect(
      isValidPortfolioData({
        availableBalance: 0,
        accountEquity: 0,
        totalPnL: 0,
        unrealizedPerpPnL: 0,
        unrealizedPredictionPnL: 0,
        totalDeposited: 0,
        totalWithdrawn: 0,
      })
    ).toBe(true);
  });

  it('should accept object with negative values', () => {
    expect(
      isValidPortfolioData({
        availableBalance: -100,
        accountEquity: -200,
        totalPnL: -500,
        unrealizedPerpPnL: -200,
        unrealizedPredictionPnL: -100,
        totalDeposited: 1000,
        totalWithdrawn: 500,
      })
    ).toBe(true);
  });
});

describe('PortfolioPnLCard - Edge Cases', () => {
  /**
   * Checks if portfolio has any unrealized P&L worth sharing.
   */
  function hasSignificantPnL(data: PortfolioPnLSnapshot | null): boolean {
    if (!data) return false;
    return Math.abs(data.totalPnL) > 0.01;
  }

  it('should detect significant positive PnL', () => {
    expect(
      hasSignificantPnL({
        availableBalance: 1000,
        accountEquity: 1500,
        totalPnL: 500,
        unrealizedPerpPnL: 200,
        unrealizedPredictionPnL: 100,
        totalDeposited: 1000,
        totalWithdrawn: 0,
      })
    ).toBe(true);
  });

  it('should detect significant negative PnL', () => {
    expect(
      hasSignificantPnL({
        availableBalance: 500,
        accountEquity: 500,
        totalPnL: -500,
        unrealizedPerpPnL: -300,
        unrealizedPredictionPnL: -200,
        totalDeposited: 1000,
        totalWithdrawn: 0,
      })
    ).toBe(true);
  });

  it('should return false for negligible PnL', () => {
    expect(
      hasSignificantPnL({
        availableBalance: 1000,
        accountEquity: 1000,
        totalPnL: 0.001,
        unrealizedPerpPnL: 0,
        unrealizedPredictionPnL: 0,
        totalDeposited: 1000,
        totalWithdrawn: 0,
      })
    ).toBe(false);
  });

  it('should return false for exactly zero PnL', () => {
    expect(
      hasSignificantPnL({
        availableBalance: 1000,
        accountEquity: 1000,
        totalPnL: 0,
        unrealizedPerpPnL: 0,
        unrealizedPredictionPnL: 0,
        totalDeposited: 1000,
        totalWithdrawn: 0,
      })
    ).toBe(false);
  });

  it('should return false for null data', () => {
    expect(hasSignificantPnL(null)).toBe(false);
  });
});
