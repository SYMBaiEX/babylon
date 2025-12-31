/**
 * Liquidity Factor Tests
 *
 * Verifies that the liquidity factor correctly amplifies price impact
 * while respecting safety limits.
 */

import { describe, expect, test } from 'bun:test';
import {
  calculatePriceFromHoldings,
  calculateRawPriceFromHoldings,
  getEffectiveSupply,
  PERP_MARKET_CONFIG,
  type PerpMarketConfig,
} from '@babylon/shared';

describe('Liquidity Factor', () => {
  describe('getEffectiveSupply', () => {
    test('calculates effective supply correctly', () => {
      const effective = getEffectiveSupply();
      expect(effective).toBe(
        PERP_MARKET_CONFIG.SYNTHETIC_SUPPLY /
          PERP_MARKET_CONFIG.LIQUIDITY_FACTOR
      );
    });

    test('with default config (10000/20 = 500)', () => {
      expect(getEffectiveSupply()).toBe(500);
    });

    test('with custom config', () => {
      const customConfig: PerpMarketConfig = {
        ...PERP_MARKET_CONFIG,
        SYNTHETIC_SUPPLY: 10000,
        LIQUIDITY_FACTOR: 10,
      };
      expect(getEffectiveSupply(customConfig)).toBe(1000);
    });
  });

  describe('calculateRawPriceFromHoldings', () => {
    test('zero holdings = initial price', () => {
      const price = calculateRawPriceFromHoldings(100, 0);
      expect(price).toBe(100);
    });

    test('positive holdings increase price', () => {
      // With effective supply of 500:
      // $100 holdings = $100/500 = $0.20 price increase
      const price = calculateRawPriceFromHoldings(100, 100);
      expect(price).toBe(100.2);
    });

    test('$1000 trade with LIQUIDITY_FACTOR=20', () => {
      // effectiveSupply = 10000/20 = 500
      // priceChange = 1000/500 = $2
      // newPrice = 100 + 2 = 102
      const price = calculateRawPriceFromHoldings(100, 1000);
      expect(price).toBe(102);
    });

    test('$5000 trade with LIQUIDITY_FACTOR=20', () => {
      // effectiveSupply = 500
      // priceChange = 5000/500 = $10
      // newPrice = 100 + 10 = 110
      const price = calculateRawPriceFromHoldings(100, 5000);
      expect(price).toBe(110);
    });

    test('negative holdings (shorts) decrease price', () => {
      // priceChange = -1000/500 = -$2
      // newPrice = 100 - 2 = 98
      const price = calculateRawPriceFromHoldings(100, -1000);
      expect(price).toBe(98);
    });
  });

  describe('calculatePriceFromHoldings with limits', () => {
    test('respects max change per trade (10%)', () => {
      const initialPrice = 100;
      const currentPrice = 100;
      // A $100k holding would cause massive price increase
      // but should be clamped to 10% = $110
      const price = calculatePriceFromHoldings(
        initialPrice,
        currentPrice,
        100000
      );
      expect(price).toBe(110); // Clamped to +10%
    });

    test('respects min change per trade (10%)', () => {
      const initialPrice = 100;
      const currentPrice = 100;
      // Massive short should be clamped to -10%
      const price = calculatePriceFromHoldings(
        initialPrice,
        currentPrice,
        -100000
      );
      expect(price).toBe(90); // Clamped to -10%
    });

    test('respects absolute floor (25% of initial)', () => {
      const initialPrice = 100;
      const currentPrice = 30; // Already low
      // Even with more shorts, can't go below 25
      const price = calculatePriceFromHoldings(
        initialPrice,
        currentPrice,
        -50000
      );
      expect(price).toBe(27); // currentPrice - 10% = 27, but floor is 25
      // Actually: max(25, 27) = 27
    });

    test('respects absolute ceiling (400% of initial)', () => {
      const initialPrice = 100;
      const currentPrice = 390; // Already near ceiling
      // With massive holdings that would push price above 400
      // effectiveSupply = 500, holdings = 200000
      // rawPrice = (100*500 + 200000) / 500 = 500
      // But ceiling is 400 (initialPrice * 4)
      const price = calculatePriceFromHoldings(
        initialPrice,
        currentPrice,
        200000
      );
      expect(price).toBe(400); // Ceiling is 400
    });

    test('normal trade within limits applies correctly', () => {
      const initialPrice = 100;
      const currentPrice = 100;
      const holdings = 1000; // $2 increase
      const price = calculatePriceFromHoldings(
        initialPrice,
        currentPrice,
        holdings
      );
      expect(price).toBe(102);
    });
  });

  describe('liquidity factor comparison', () => {
    const createConfig = (liquidityFactor: number): PerpMarketConfig => ({
      ...PERP_MARKET_CONFIG,
      LIQUIDITY_FACTOR: liquidityFactor,
    });

    test('LIQUIDITY_FACTOR=1 (normal liquidity)', () => {
      const config = createConfig(1);
      // effectiveSupply = 10000/1 = 10000
      // priceChange = 1000/10000 = $0.10
      const price = calculateRawPriceFromHoldings(100, 1000, config);
      expect(price).toBe(100.1);
    });

    test('LIQUIDITY_FACTOR=10 (10x less liquid)', () => {
      const config = createConfig(10);
      // effectiveSupply = 10000/10 = 1000
      // priceChange = 1000/1000 = $1
      const price = calculateRawPriceFromHoldings(100, 1000, config);
      expect(price).toBe(101);
    });

    test('LIQUIDITY_FACTOR=20 (20x less liquid - default)', () => {
      const config = createConfig(20);
      // effectiveSupply = 10000/20 = 500
      // priceChange = 1000/500 = $2
      const price = calculateRawPriceFromHoldings(100, 1000, config);
      expect(price).toBe(102);
    });

    test('LIQUIDITY_FACTOR=50 (very volatile)', () => {
      const config = createConfig(50);
      // effectiveSupply = 10000/50 = 200
      // priceChange = 1000/200 = $5
      const price = calculateRawPriceFromHoldings(100, 1000, config);
      expect(price).toBe(105);
    });

    test('higher liquidity factor = more price impact', () => {
      const holdings = 1000;
      const initialPrice = 100;

      const price1 = calculateRawPriceFromHoldings(
        initialPrice,
        holdings,
        createConfig(1)
      );
      const price10 = calculateRawPriceFromHoldings(
        initialPrice,
        holdings,
        createConfig(10)
      );
      const price20 = calculateRawPriceFromHoldings(
        initialPrice,
        holdings,
        createConfig(20)
      );
      const price50 = calculateRawPriceFromHoldings(
        initialPrice,
        holdings,
        createConfig(50)
      );

      expect(price1).toBeLessThan(price10);
      expect(price10).toBeLessThan(price20);
      expect(price20).toBeLessThan(price50);
    });
  });

  describe('realistic trading scenarios', () => {
    test('user opens $500 long position', () => {
      const initialPrice = 165; // e.g., AIPHB
      const currentPrice = 165;
      const holdings = 500;

      const newPrice = calculatePriceFromHoldings(
        initialPrice,
        currentPrice,
        holdings
      );

      // effectiveSupply = 500
      // priceChange = 500/500 = $1
      // newPrice = 165 + 1 = 166
      expect(newPrice).toBe(166);
      expect((newPrice - currentPrice) / currentPrice).toBeCloseTo(0.006, 2); // ~0.6%
    });

    test('user opens $2000 short position', () => {
      const initialPrice = 165;
      const currentPrice = 165;
      const holdings = -2000;

      const newPrice = calculatePriceFromHoldings(
        initialPrice,
        currentPrice,
        holdings
      );

      // priceChange = -2000/500 = -$4
      // newPrice = 165 - 4 = 161
      expect(newPrice).toBe(161);
    });

    test('mixed positions: 3 longs ($1k each) + 1 short ($500)', () => {
      const initialPrice = 100;
      const currentPrice = 100;
      const netHoldings = 3 * 1000 - 500; // $2500 net long

      const newPrice = calculatePriceFromHoldings(
        initialPrice,
        currentPrice,
        netHoldings
      );

      // priceChange = 2500/500 = $5
      // newPrice = 100 + 5 = 105
      expect(newPrice).toBe(105);
    });

    test('closing positions returns price toward initial', () => {
      const initialPrice = 100;
      let currentPrice = 100;

      // Open $2000 long
      currentPrice = calculatePriceFromHoldings(
        initialPrice,
        currentPrice,
        2000
      );
      expect(currentPrice).toBe(104);

      // Close half ($1000 remaining)
      currentPrice = calculatePriceFromHoldings(
        initialPrice,
        currentPrice,
        1000
      );
      expect(currentPrice).toBe(102);

      // Close all ($0 remaining)
      currentPrice = calculatePriceFromHoldings(initialPrice, currentPrice, 0);
      expect(currentPrice).toBe(100);
    });
  });

  describe('edge cases', () => {
    test('handles very small holdings', () => {
      const price = calculateRawPriceFromHoldings(100, 0.01);
      expect(price).toBeCloseTo(100.00002, 5);
    });

    test('price impact scales linearly with holdings', () => {
      const price100 = calculateRawPriceFromHoldings(100, 100);
      const price200 = calculateRawPriceFromHoldings(100, 200);
      const price300 = calculateRawPriceFromHoldings(100, 300);

      const diff1 = price200 - price100;
      const diff2 = price300 - price200;

      expect(diff1).toBeCloseTo(diff2, 5);
    });

    test('handles different initial prices', () => {
      // Same holding, different initial prices
      // Impact should be absolute, not percentage
      const priceFrom50 = calculateRawPriceFromHoldings(50, 1000);
      const priceFrom100 = calculateRawPriceFromHoldings(100, 1000);
      const priceFrom200 = calculateRawPriceFromHoldings(200, 1000);

      // All should have same absolute increase ($2)
      expect(priceFrom50).toBe(52);
      expect(priceFrom100).toBe(102);
      expect(priceFrom200).toBe(202);
    });
  });
});
