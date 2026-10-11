import { describe, expect, it } from 'bun:test';
import {
  GRANULAR_TO_DB_TIMEFRAME,
  getCurrentArcState,
  getStateBoundaries,
  mapGranularToDbTimeframe,
  shouldSpawnSubMarket,
} from '../services/market-timeframes';

const start = new Date('2026-01-01T00:00:00Z');
const end = new Date('2026-01-01T01:00:00Z');

describe('market-timeframes', () => {
  it('maps the canonical 2d granular timeframe to weekly', () => {
    expect(mapGranularToDbTimeframe('2d')).toBe('weekly');
    expect(GRANULAR_TO_DB_TIMEFRAME['1d']).toBe('daily');
    expect(() => mapGranularToDbTimeframe('2h')).toThrow(
      'Unsupported granular timeframe'
    );
  });

  describe('getCurrentArcState', () => {
    it('maps elapsed progress onto the timeframe arc states', () => {
      expect(getCurrentArcState(start, end, 'intraday', start)).toBe('setup');
      expect(
        getCurrentArcState(
          start,
          end,
          'intraday',
          new Date('2026-01-01T00:30:00Z')
        )
      ).toBe('climax');
      expect(getCurrentArcState(start, end, 'intraday', end)).toBe(
        'resolution'
      );
    });

    it('rejects zero/negative durations even before the start time', () => {
      const before = new Date('2025-12-31T00:00:00Z');
      expect(() =>
        getCurrentArcState(start, start, 'intraday', before)
      ).toThrow('endTime must be after startTime');
      expect(() => getCurrentArcState(end, start, 'intraday', before)).toThrow(
        'endTime must be after startTime'
      );
    });

    it('rejects invalid dates', () => {
      const invalid = new Date('not-a-date');
      expect(() => getCurrentArcState(invalid, end, 'intraday')).toThrow(
        'invalid start/end time'
      );
      expect(() => getCurrentArcState(start, end, 'intraday', invalid)).toThrow(
        'invalid current time'
      );
    });
  });

  it('getStateBoundaries rejects invalid dates', () => {
    expect(() => getStateBoundaries(new Date('nope'), end, 'intraday')).toThrow(
      'invalid start/end time'
    );
  });

  describe('shouldSpawnSubMarket', () => {
    // general/breaking_news spawns an intraday child with probability 0.5
    it('spawns only when the draw is strictly below the probability', () => {
      expect(
        shouldSpawnSubMarket('breaking_news', 'general', 'daily', 0.49)
      ).not.toBeNull();
      expect(
        shouldSpawnSubMarket('breaking_news', 'general', 'daily', 0.5)
      ).toBeNull();
    });

    it('rejects out-of-range or non-finite draws', () => {
      for (const value of [Number.NaN, -0.1, 1, 2]) {
        expect(() =>
          shouldSpawnSubMarket('breaking_news', 'general', 'daily', value)
        ).toThrow('randomValue must be in [0, 1)');
      }
    });
  });
});
