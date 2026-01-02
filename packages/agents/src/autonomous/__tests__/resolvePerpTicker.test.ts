import { describe, expect, test } from 'bun:test';
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

  test('returns null for unknown identifiers', () => {
    expect(resolvePerpTicker('not-real')).toBeNull();
  });
});
