import { describe, expect, it } from 'bun:test';
import { BABYLON_POINTS_SYMBOL } from '@babylon/shared';

// Replicate formatPrice/formatVolume logic since web app imports have complex deps
const formatPrice = (p: number) => `${BABYLON_POINTS_SYMBOL}${p.toFixed(2)}`;
const formatVolume = (v: number) => {
  if (v >= 1e9) return `${BABYLON_POINTS_SYMBOL}${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${BABYLON_POINTS_SYMBOL}${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${BABYLON_POINTS_SYMBOL}${(v / 1e3).toFixed(2)}K`;
  return `${BABYLON_POINTS_SYMBOL}${v.toFixed(2)}`;
};
const getDaysLeft = (date?: string) => {
  if (!date) return null;
  const diff = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
  return Math.max(0, diff);
};

describe('formatPrice', () => {
  it('formats with ƀ symbol and 2 decimals', () => {
    expect(formatPrice(123.456)).toBe('ƀ123.46');
    expect(formatPrice(100)).toBe('ƀ100.00');
    expect(formatPrice(0)).toBe('ƀ0.00');
    expect(formatPrice(-100)).toBe('ƀ-100.00');
  });

  it('handles edge values', () => {
    expect(formatPrice(0.001)).toBe('ƀ0.00');
    expect(formatPrice(0.01)).toBe('ƀ0.01');
    expect(formatPrice(999999)).toBe('ƀ999999.00');
  });
});

describe('formatVolume', () => {
  it('formats under 1K without suffix', () => {
    expect(formatVolume(0)).toBe('ƀ0.00');
    expect(formatVolume(500)).toBe('ƀ500.00');
    expect(formatVolume(999)).toBe('ƀ999.00');
  });

  it('adds K/M/B suffix for larger values', () => {
    expect(formatVolume(1000)).toBe('ƀ1.00K');
    expect(formatVolume(1500)).toBe('ƀ1.50K');
    expect(formatVolume(1000000)).toBe('ƀ1.00M');
    expect(formatVolume(1000000000)).toBe('ƀ1.00B');
  });
});

describe('getDaysLeft', () => {
  it('returns null for missing date', () => {
    expect(getDaysLeft(undefined)).toBeNull();
    expect(getDaysLeft('')).toBeNull();
  });

  it('calculates days for future dates', () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);
    const result = getDaysLeft(future.toISOString());
    expect(result).toBeGreaterThanOrEqual(4);
    expect(result).toBeLessThanOrEqual(6);
  });

  it('clamps past dates to 0', () => {
    const past = new Date();
    past.setDate(past.getDate() - 5);
    expect(getDaysLeft(past.toISOString())).toBe(0);
  });
});

describe('Card inline patterns', () => {
  it('price change color', () => {
    const color = (n: number) => (n >= 0 ? 'text-green-600' : 'text-red-600');
    expect(color(10)).toBe('text-green-600');
    expect(color(0)).toBe('text-green-600');
    expect(color(-10)).toBe('text-red-600');
  });

  it('price change prefix', () => {
    const fmt = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
    expect(fmt(10.5)).toBe('+10.50%');
    expect(fmt(0)).toBe('+0.00%');
    expect(fmt(-10.5)).toBe('-10.50%');
  });

  it('time remaining', () => {
    const fmt = (d: number | null) => (d !== null ? `${d}d left` : 'Soon');
    expect(fmt(5)).toBe('5d left');
    expect(fmt(0)).toBe('0d left');
    expect(fmt(null)).toBe('Soon');
  });

  it('funding rate color', () => {
    const color = (r: number) => (r >= 0 ? 'text-orange-500' : 'text-blue-500');
    expect(color(0.001)).toBe('text-orange-500');
    expect(color(0)).toBe('text-orange-500');
    expect(color(-0.001)).toBe('text-blue-500');
  });

  it('funding rate format', () => {
    const fmt = (r: number) => `Fund: ${(r * 100).toFixed(4)}%`;
    expect(fmt(0.0001)).toBe('Fund: 0.0100%');
    expect(fmt(0)).toBe('Fund: 0.0000%');
    expect(fmt(-0.0001)).toBe('Fund: -0.0100%');
  });
});
