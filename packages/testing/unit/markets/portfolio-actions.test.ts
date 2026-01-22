import { describe, expect, it } from 'bun:test';

describe('Share button disabled state', () => {
  // Mirrors: disabled={loading || !data}
  const isDisabled = (loading: boolean, data: unknown) => loading || !data;

  it('disabled when loading', () => {
    expect(isDisabled(true, {})).toBe(true);
    expect(isDisabled(true, null)).toBe(true);
  });

  it('disabled when no data', () => {
    expect(isDisabled(false, null)).toBe(true);
    expect(isDisabled(false, undefined)).toBe(true);
  });

  it('enabled when has data and not loading', () => {
    expect(isDisabled(false, {})).toBe(false);
    expect(isDisabled(false, { balance: 1000 })).toBe(false);
  });
});

describe('Portfolio data validation', () => {
  const isValid = (d: unknown): boolean => {
    if (!d || typeof d !== 'object') return false;
    const o = d as Record<string, unknown>;
    return (
      typeof o.availableBalance === 'number' &&
      typeof o.accountEquity === 'number' &&
      typeof o.totalPnL === 'number'
    );
  };

  it('validates correct shape', () => {
    expect(
      isValid({ availableBalance: 0, accountEquity: 0, totalPnL: 0 })
    ).toBe(true);
    expect(
      isValid({ availableBalance: -100, accountEquity: -200, totalPnL: -500 })
    ).toBe(true);
  });

  it('rejects invalid data', () => {
    expect(isValid(null)).toBe(false);
    expect(isValid({})).toBe(false);
    expect(isValid({ availableBalance: '1000' })).toBe(false);
  });
});
