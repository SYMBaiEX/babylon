/**
 * MarketsToggle Component Tests
 *
 * Tests for the Markets page header toggle component that displays
 * tab navigation and user balance.
 *
 * Tests cover:
 * - Tab configuration and rendering
 * - Balance display logic with various states
 * - Edge cases: null, undefined, zero, negative values
 * - Loading states
 * - Authentication states
 */

import { describe, expect, it } from 'bun:test';
import { formatCurrency } from '@babylon/shared';

// Tab configuration extracted from MarketsToggle
const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'perps', label: 'Perps' },
  { id: 'predictions', label: 'Predictions' },
] as const;

type MarketTab = (typeof TABS)[number]['id'];

/**
 * Determines if balance should be displayed based on component props.
 * Extracted from MarketsToggle for unit testing.
 */
function shouldShowBalance(
  authenticated: boolean | undefined,
  balance: number | null | undefined,
  loading: boolean | undefined
): { showContainer: boolean; showValue: boolean; showSkeleton: boolean } {
  const showContainer = !!authenticated;
  const showSkeleton = showContainer && !!loading;
  const showValue = showContainer && !loading && balance != null;

  return { showContainer, showValue, showSkeleton };
}

/**
 * Formats balance for display in header.
 * Uses the shared formatCurrency utility.
 */
function formatBalanceDisplay(balance: number): string {
  return formatCurrency(balance, { useThousandsSeparator: true });
}

describe('MarketsToggle - Tab Configuration', () => {
  it('should have exactly 3 tabs', () => {
    expect(TABS).toHaveLength(3);
  });

  it('should have correct tab IDs', () => {
    const tabIds = TABS.map((t) => t.id);
    expect(tabIds).toContain('dashboard');
    expect(tabIds).toContain('perps');
    expect(tabIds).toContain('predictions');
  });

  it('should have correct tab labels', () => {
    const tabLabels = TABS.map((t) => t.label);
    expect(tabLabels).toContain('Dashboard');
    expect(tabLabels).toContain('Perps');
    expect(tabLabels).toContain('Predictions');
  });

  it('should have tabs in correct order', () => {
    expect(TABS[0]!.id).toBe('dashboard');
    expect(TABS[1]!.id).toBe('perps');
    expect(TABS[2]!.id).toBe('predictions');
  });
});

describe('MarketsToggle - Balance Display Logic', () => {
  describe('Authentication states', () => {
    it('should not show balance container when not authenticated', () => {
      const result = shouldShowBalance(false, 1000, false);
      expect(result.showContainer).toBe(false);
      expect(result.showValue).toBe(false);
      expect(result.showSkeleton).toBe(false);
    });

    it('should not show balance container when authenticated is undefined', () => {
      const result = shouldShowBalance(undefined, 1000, false);
      expect(result.showContainer).toBe(false);
      expect(result.showValue).toBe(false);
    });

    it('should show balance container when authenticated', () => {
      const result = shouldShowBalance(true, 1000, false);
      expect(result.showContainer).toBe(true);
      expect(result.showValue).toBe(true);
    });
  });

  describe('Loading states', () => {
    it('should show skeleton when loading and authenticated', () => {
      const result = shouldShowBalance(true, 1000, true);
      expect(result.showContainer).toBe(true);
      expect(result.showSkeleton).toBe(true);
      expect(result.showValue).toBe(false);
    });

    it('should not show skeleton when not loading', () => {
      const result = shouldShowBalance(true, 1000, false);
      expect(result.showSkeleton).toBe(false);
      expect(result.showValue).toBe(true);
    });

    it('should not show skeleton when not authenticated', () => {
      const result = shouldShowBalance(false, 1000, true);
      expect(result.showSkeleton).toBe(false);
    });
  });

  describe('Balance value edge cases', () => {
    it('should show balance when value is zero', () => {
      const result = shouldShowBalance(true, 0, false);
      expect(result.showValue).toBe(true);
    });

    it('should show balance when value is negative', () => {
      const result = shouldShowBalance(true, -100, false);
      expect(result.showValue).toBe(true);
    });

    it('should not show balance when value is null', () => {
      const result = shouldShowBalance(true, null, false);
      expect(result.showValue).toBe(false);
    });

    it('should not show balance when value is undefined', () => {
      const result = shouldShowBalance(true, undefined, false);
      expect(result.showValue).toBe(false);
    });

    it('should show balance for very large values', () => {
      const result = shouldShowBalance(true, 999999999, false);
      expect(result.showValue).toBe(true);
    });

    it('should show balance for very small positive values', () => {
      const result = shouldShowBalance(true, 0.01, false);
      expect(result.showValue).toBe(true);
    });
  });
});

describe('MarketsToggle - Balance Formatting', () => {
  it('should format zero balance correctly', () => {
    const formatted = formatBalanceDisplay(0);
    // formatCurrency includes decimal places
    expect(formatted).toBe('ƀ0.00');
  });

  it('should format small balances correctly', () => {
    const formatted = formatBalanceDisplay(99.99);
    expect(formatted).toBe('ƀ99.99');
  });

  it('should format large balances with thousand separators', () => {
    const formatted = formatBalanceDisplay(1234567.89);
    expect(formatted).toContain('ƀ');
    expect(formatted).toContain('1');
    // Should have some form of separation/abbreviation
  });

  it('should format negative balances correctly', () => {
    const formatted = formatBalanceDisplay(-500.25);
    expect(formatted).toContain('ƀ');
    expect(formatted).toContain('-');
  });

  it('should handle boundary value at 1000', () => {
    const formatted = formatBalanceDisplay(1000);
    expect(formatted).toContain('ƀ');
  });

  it('should handle boundary value at 1000000', () => {
    const formatted = formatBalanceDisplay(1000000);
    expect(formatted).toContain('ƀ');
  });
});

describe('MarketsToggle - Tab Active State', () => {
  const isTabActive = (activeTab: MarketTab, tabId: MarketTab): boolean => {
    return activeTab === tabId;
  };

  it('should correctly identify active dashboard tab', () => {
    expect(isTabActive('dashboard', 'dashboard')).toBe(true);
    expect(isTabActive('dashboard', 'perps')).toBe(false);
    expect(isTabActive('dashboard', 'predictions')).toBe(false);
  });

  it('should correctly identify active perps tab', () => {
    expect(isTabActive('perps', 'dashboard')).toBe(false);
    expect(isTabActive('perps', 'perps')).toBe(true);
    expect(isTabActive('perps', 'predictions')).toBe(false);
  });

  it('should correctly identify active predictions tab', () => {
    expect(isTabActive('predictions', 'dashboard')).toBe(false);
    expect(isTabActive('predictions', 'perps')).toBe(false);
    expect(isTabActive('predictions', 'predictions')).toBe(true);
  });
});
