/**
 * Market Volatility Simulation Tests
 *
 * Verifies that simulated market volatility produces realistic price movements:
 * - Fat tails (occasional large moves)
 * - Volatility clustering (volatile periods persist)
 * - Mean reversion (prices tend toward initial over time)
 * - Asymmetry (crashes faster than rallies)
 */

import { describe, expect, test } from 'bun:test';

// Replicate the generateVolatilityMove logic for testing
interface VolatilityState {
  recentVolatility: number;
  momentum: number;
  lastMove: number;
}

function generateVolatilityMove(
  state: VolatilityState,
  initialPrice: number,
  currentPrice: number
): number {
  const baseVolatility = state.recentVolatility;
  const volatilityMultiplier = 0.5 + Math.random();
  const currentVolatility = baseVolatility * volatilityMultiplier;

  let move: number;
  const fatTailChance = Math.random();

  if (fatTailChance < 0.01) {
    const direction = Math.random() > 0.5 ? 1 : -1;
    move = direction * currentVolatility * (3 + Math.random() * 3);
  } else if (fatTailChance < 0.05) {
    move = (Math.random() - 0.5) * 2 * currentVolatility * (2 + Math.random());
  } else if (fatTailChance < 0.15) {
    move =
      (Math.random() - 0.5) *
      2 *
      currentVolatility *
      (1.5 + Math.random() * 0.5);
  } else {
    move = (Math.random() - 0.5) * 2 * currentVolatility;
  }

  move += state.momentum * (0.5 + Math.random() * 0.5);

  const priceRatio = currentPrice / initialPrice;
  if (priceRatio > 1.5) {
    move -= 0.001 * (priceRatio - 1);
  } else if (priceRatio < 0.7) {
    move += 0.001 * (1 - priceRatio);
  }

  if (move < 0) {
    move *= 1.2;
  }

  const maxMove = 0.05;
  return Math.max(-maxMove, Math.min(move, maxMove));
}

describe('Market Volatility Simulation', () => {
  describe('generateVolatilityMove', () => {
    const defaultState: VolatilityState = {
      recentVolatility: 0.003,
      momentum: 0,
      lastMove: 0,
    };

    test('generates moves within reasonable bounds', () => {
      const moves: number[] = [];
      for (let i = 0; i < 1000; i++) {
        const move = generateVolatilityMove({ ...defaultState }, 100, 100);
        moves.push(move);
      }

      // All moves should be within ±5%
      expect(moves.every((m) => Math.abs(m) <= 0.05)).toBe(true);

      // Most moves should be small (< 1%)
      const smallMoves = moves.filter((m) => Math.abs(m) < 0.01);
      expect(smallMoves.length).toBeGreaterThan(800); // >80% should be small
    });

    test('produces fat tails (occasional large moves)', () => {
      const moves: number[] = [];
      for (let i = 0; i < 10000; i++) {
        const move = generateVolatilityMove({ ...defaultState }, 100, 100);
        moves.push(move);
      }

      // Should have some large moves (> 1%)
      const largeMoves = moves.filter((m) => Math.abs(m) > 0.01);
      expect(largeMoves.length).toBeGreaterThan(100); // At least 1%

      // Should have very large moves (> 2%) occasionally
      const veryLargeMoves = moves.filter((m) => Math.abs(m) > 0.02);
      expect(veryLargeMoves.length).toBeGreaterThan(10); // At least 0.1%
    });

    test('respects momentum', () => {
      const upMomentum: VolatilityState = {
        recentVolatility: 0.003,
        momentum: 0.005, // Strong upward momentum
        lastMove: 0.005,
      };

      const moves: number[] = [];
      for (let i = 0; i < 1000; i++) {
        const move = generateVolatilityMove(upMomentum, 100, 100);
        moves.push(move);
      }

      // Average move should be positive due to momentum
      const avgMove = moves.reduce((a, b) => a + b, 0) / moves.length;
      expect(avgMove).toBeGreaterThan(0);
    });

    test('applies mean reversion when price is high', () => {
      const moves: number[] = [];
      for (let i = 0; i < 1000; i++) {
        const move = generateVolatilityMove(
          { ...defaultState },
          100,
          200 // Price is 2x initial
        );
        moves.push(move);
      }

      // Average move should be slightly negative (mean reversion)
      const avgMove = moves.reduce((a, b) => a + b, 0) / moves.length;
      expect(avgMove).toBeLessThan(0);
    });

    test('applies mean reversion when price is low', () => {
      const moves: number[] = [];
      for (let i = 0; i < 1000; i++) {
        const move = generateVolatilityMove(
          { ...defaultState },
          100,
          50 // Price is 0.5x initial
        );
        moves.push(move);
      }

      // Average move should be slightly positive (mean reversion)
      const avgMove = moves.reduce((a, b) => a + b, 0) / moves.length;
      expect(avgMove).toBeGreaterThan(0);
    });

    test('crashes are faster than rallies (asymmetry)', () => {
      // Generate many moves and compare magnitude of up vs down
      const upMoves: number[] = [];
      const downMoves: number[] = [];

      for (let i = 0; i < 10000; i++) {
        const move = generateVolatilityMove({ ...defaultState }, 100, 100);
        if (move > 0) upMoves.push(move);
        else downMoves.push(Math.abs(move));
      }

      // Average down move should be larger than average up move
      const avgUp = upMoves.reduce((a, b) => a + b, 0) / upMoves.length;
      const avgDown = downMoves.reduce((a, b) => a + b, 0) / downMoves.length;

      expect(avgDown).toBeGreaterThan(avgUp * 1.1); // At least 10% faster
    });
  });

  describe('price evolution over time', () => {
    test('price stays within bounds over many ticks', () => {
      const initialPrice = 100;
      let currentPrice = 100;
      const state: VolatilityState = {
        recentVolatility: 0.003,
        momentum: 0,
        lastMove: 0,
      };

      // Simulate 1000 ticks (about 16 hours of game time)
      for (let i = 0; i < 1000; i++) {
        const move = generateVolatilityMove(state, initialPrice, currentPrice);
        currentPrice = currentPrice * (1 + move);

        // Update state
        state.lastMove = move;
        state.momentum = move * 0.3;
        state.recentVolatility =
          state.recentVolatility * 0.8 + Math.abs(move) * 0.2;
      }

      // Price should still be reasonable (not at extremes)
      expect(currentPrice).toBeGreaterThan(initialPrice * 0.25);
      expect(currentPrice).toBeLessThan(initialPrice * 4);
    });

    test('volatility clustering occurs', () => {
      const state: VolatilityState = {
        recentVolatility: 0.003,
        momentum: 0,
        lastMove: 0,
      };

      const volatilities: number[] = [];

      for (let i = 0; i < 100; i++) {
        const move = generateVolatilityMove(state, 100, 100);
        state.lastMove = move;
        state.momentum = move * 0.3;
        state.recentVolatility =
          state.recentVolatility * 0.8 + Math.abs(move) * 0.2;
        volatilities.push(state.recentVolatility);
      }

      // Volatility should vary over time (not constant)
      const minVol = Math.min(...volatilities);
      const maxVol = Math.max(...volatilities);
      expect(maxVol / minVol).toBeGreaterThan(1.5); // At least 50% variation
    });
  });

  describe('statistical properties', () => {
    test('distribution is not uniform', () => {
      const moves: number[] = [];
      for (let i = 0; i < 10000; i++) {
        const move = generateVolatilityMove(
          { recentVolatility: 0.003, momentum: 0, lastMove: 0 },
          100,
          100
        );
        moves.push(move);
      }

      // Count moves in different buckets
      const tiny = moves.filter((m) => Math.abs(m) < 0.001).length;
      const small = moves.filter(
        (m) => Math.abs(m) >= 0.001 && Math.abs(m) < 0.005
      ).length;
      const medium = moves.filter(
        (m) => Math.abs(m) >= 0.005 && Math.abs(m) < 0.01
      ).length;
      const large = moves.filter((m) => Math.abs(m) >= 0.01).length;

      // Should follow roughly: many small, fewer medium, few large
      expect(tiny + small).toBeGreaterThan(medium + large);
      expect(medium).toBeGreaterThan(large);
    });
  });
});
