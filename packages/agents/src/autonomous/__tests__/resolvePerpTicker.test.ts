import { describe, expect, test } from 'bun:test';
import { StaticDataRegistry } from '@feed/engine';
import { resolvePerpTicker } from '../utils/resolvePerpTicker';

describe('resolvePerpTicker', () => {
  test('matches canonical ticker regardless of casing', () => {
    const result = resolvePerpTicker('tslai');
    expect(result).not.toBeNull();
    expect(result?.ticker).toBe('TSLAI');
  });

  test('matches by organization id', () => {
    const result = resolvePerpTicker('teslai');
    expect(result?.ticker).toBe('TSLAI');
  });

  test('matches by parody name', () => {
    const result = resolvePerpTicker('TeslAI');
    expect(result?.ticker).toBe('TSLAI');
  });

  test('matches by original name', () => {
    const result = resolvePerpTicker('Tesla');
    expect(result?.ticker).toBe('TSLAI');
  });

  test('handles empty-like inputs gracefully', () => {
    expect(resolvePerpTicker('')).toBeNull();
    expect(resolvePerpTicker('   ')).toBeNull();
    expect(resolvePerpTicker(undefined)).toBeNull();
    expect(resolvePerpTicker(null)).toBeNull();
  });

  test('handles special characters in identifier', () => {
    const result = resolvePerpTicker('$TSLAI!!');
    expect(result?.ticker).toBe('TSLAI');
  });

  test('supports prefix partial matches but avoids mid-string matches', () => {
    expect(resolvePerpTicker('tes')).not.toBeNull();
    expect(resolvePerpTicker('tes')?.ticker).toBe('TSLAI');
    expect(resolvePerpTicker('sla')).toBeNull();
  });

  test('rejects ambiguous prefixes instead of picking the first market', () => {
    const normalize = (v: string | null | undefined) =>
      (v ?? '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]/g, '');
    const companies = StaticDataRegistry.getAllOrganizations().filter(
      (org) => org.ticker && org.type === 'company'
    );
    const tickersByPrefix = new Map<string, Set<string>>();
    for (const org of companies) {
      for (const candidate of [org.ticker, org.name, org.originalName]) {
        const prefix = normalize(candidate).slice(0, 3);
        if (prefix.length < 3) continue;
        const set = tickersByPrefix.get(prefix) ?? new Set<string>();
        set.add(org.ticker!);
        tickersByPrefix.set(prefix, set);
      }
    }
    const ambiguous = [...tickersByPrefix.entries()].find(
      ([prefix, tickers]) =>
        tickers.size > 1 &&
        !companies.some((org) =>
          [org.ticker, org.id, org.name, org.originalName, org.originalHandle]
            .map(normalize)
            .includes(prefix)
        )
    )?.[0];
    if (!ambiguous) throw new Error('fixture has no shared 3-char prefix');
    expect(resolvePerpTicker(ambiguous)).toBeNull();
  });

  test('returns null for unknown identifiers', () => {
    expect(resolvePerpTicker('not-real')).toBeNull();
  });
});
