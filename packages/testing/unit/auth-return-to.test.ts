import { describe, expect, test } from 'bun:test';
import { safeReturnTo } from '../../../apps/web/src/lib/auth/safe-return-to';

describe('OAuth return destination', () => {
  test('keeps same-origin paths and encoded query values', () => {
    expect(safeReturnTo('/profile?label=a%2Fb#posts')).toBe(
      '/profile?label=a%2Fb#posts'
    );
    const params = new URLSearchParams('returnTo=%2Fsearch%3Fq%3D%252F');
    expect(safeReturnTo(params.get('returnTo'))).toBe('/search?q=%2F');
  });

  test('rejects external destinations and browser URL normalization tricks', () => {
    for (const value of [
      null,
      '',
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      '/\n/evil.example',
      '/\t/evil.example',
    ]) {
      expect(safeReturnTo(value)).toBe('/');
    }
  });
});
