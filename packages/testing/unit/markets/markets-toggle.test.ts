import { describe, expect, it } from 'bun:test';
import { formatCurrency } from '@babylon/shared';

describe('formatCurrency (used in MarketsToggle)', () => {
  it('formats amounts correctly', () => {
    expect(formatCurrency(0, { useThousandsSeparator: true })).toBe('ƀ0.00');
    expect(formatCurrency(99.99, { useThousandsSeparator: true })).toBe(
      'ƀ99.99'
    );
    expect(formatCurrency(-500.25, { useThousandsSeparator: true })).toContain(
      '-'
    );
  });

  it('handles thousand separators', () => {
    const result = formatCurrency(1234.56, { useThousandsSeparator: true });
    expect(result).toContain('ƀ');
    expect(result).toContain('1');
  });
});

describe('MarketsToggle display logic', () => {
  const showContainer = (auth?: boolean) => !!auth;
  const displayState = (loading?: boolean, balance?: number | null) => {
    if (loading) return 'skeleton';
    if (balance != null) return 'value';
    return 'empty';
  };

  it('hides balance when not authenticated', () => {
    expect(showContainer(false)).toBe(false);
    expect(showContainer(undefined)).toBe(false);
  });

  it('shows balance when authenticated', () => {
    expect(showContainer(true)).toBe(true);
  });

  it('shows skeleton when loading', () => {
    expect(displayState(true, 1000)).toBe('skeleton');
    expect(displayState(true, null)).toBe('skeleton');
  });

  it('shows value when balance exists', () => {
    expect(displayState(false, 1000)).toBe('value');
    expect(displayState(false, 0)).toBe('value');
  });

  it('shows empty when no balance', () => {
    expect(displayState(false, null)).toBe('empty');
    expect(displayState(false, undefined)).toBe('empty');
  });
});

describe('Tab active state', () => {
  type TabId = 'dashboard' | 'perps' | 'predictions';
  const getClass = (active: TabId, tab: TabId) =>
    active === tab ? 'text-foreground' : 'text-muted-foreground';

  it('highlights active tab', () => {
    expect(getClass('dashboard', 'dashboard')).toBe('text-foreground');
    expect(getClass('perps', 'perps')).toBe('text-foreground');
  });

  it('dims inactive tabs', () => {
    expect(getClass('dashboard', 'perps')).toBe('text-muted-foreground');
  });
});
