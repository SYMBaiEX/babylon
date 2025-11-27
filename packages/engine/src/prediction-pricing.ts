/**
 * Prediction Market AMM Pricing
 *
 * @description Pure math implementation of Automated Market Maker (AMM) pricing
 * for prediction markets. Uses Constant Product Market Maker (CPMM) formula:
 * k = yesShares * noShares. No dependencies, can be used client or server side.
 *
 * Provides functions for calculating share purchases, sales, prices, and fees.
 */

import { FEE_CONFIG } from './config/fees';

/**
 * Share calculation result
 *
 * @description Contains the results of a share purchase or sale calculation,
 * including shares bought/sold, prices, price impact, and new market state.
 */
export interface ShareCalculation {
  sharesBought: number;
  avgPrice: number;
  newYesPrice: number;
  newNoPrice: number;
  priceImpact: number;
  totalCost: number;
  newYesShares: number;
  newNoShares: number;
}

/**
 * Share calculation result with fees
 *
 * @description Extends ShareCalculation with fee information, including fee
 * amount, net amount after fees, and total cost/proceeds.
 */
export interface ShareCalculationWithFees extends ShareCalculation {
  fee: number;
  netAmount: number; // Amount after fee
  totalWithFee?: number; // Total including fee (for buying)
  netProceeds?: number; // Net proceeds after fee (for selling)
}

/**
 * Prediction Market Pricing Class
 *
 * @description Provides static methods for calculating prediction market
 * pricing using CPMM (Constant Product Market Maker) formula. Handles both
 * buying and selling shares with fee calculations.
 */
export class PredictionPricing {
  /**
   * Calculate shares when buying (CPMM: k = yesShares * noShares)
   *
   * @description Calculates how many shares can be purchased for a given USD
   * amount using CPMM pricing. User pays USD which increases opposite side
   * reserves, and receives shares from same side reserves.
   *
   * @param {number} currentYesShares - Current YES shares in market
   * @param {number} currentNoShares - Current NO shares in market
   * @param {'yes' | 'no'} side - Side to buy (YES or NO)
   * @param {number} usdAmount - USD amount to spend
   * @returns {ShareCalculation} Calculation result with shares, prices, and impact
   * @throws {Error} If amount is invalid or market has insufficient liquidity
   *
   * @example
   * ```typescript
   * const calc = PredictionPricing.calculateBuy(1000, 1000, 'yes', 100);
   * // Returns: { sharesBought: ~90, avgPrice: ~1.11, newYesPrice: ~0.55, ... }
   * ```
   */
  static calculateBuy(
    currentYesShares: number,
    currentNoShares: number,
    side: 'yes' | 'no',
    usdAmount: number
  ): ShareCalculation {
    if (usdAmount <= 0) {
      throw new Error('Trade amount must be positive');
    }

    const k = currentYesShares * currentNoShares;
    if (k <= 0) {
      throw new Error('Market has insufficient liquidity');
    }

    const currentTotal = currentYesShares + currentNoShares;
    const currentYesPrice = currentNoShares / currentTotal;
    const currentNoPrice = currentYesShares / currentTotal;

    let newYesShares: number;
    let newNoShares: number;
    let sharesBought: number;

    // CPMM: User pays USD, gets shares
    // USD goes to opposite side reserves, shares come from same side reserves
    if (side === 'yes') {
      // User pays USD → increases NO reserves
      // User gets YES shares → decreases YES reserves
      newNoShares = currentNoShares + usdAmount;
      newYesShares = k / newNoShares;
      sharesBought = currentYesShares - newYesShares;
    } else {
      // User pays USD → increases YES reserves
      // User gets NO shares → decreases NO reserves
      newYesShares = currentYesShares + usdAmount;
      newNoShares = k / newYesShares;
      sharesBought = currentNoShares - newNoShares;
    }

    if (sharesBought <= 0) {
      throw new Error('Calculated shares purchased must be positive');
    }

    const newTotal = newYesShares + newNoShares;
    const newYesPrice = newNoShares / newTotal;
    const newNoPrice = newYesShares / newTotal;

    const priceImpact =
      side === 'yes'
        ? ((newYesPrice - currentYesPrice) / currentYesPrice) * 100
        : ((newNoPrice - currentNoPrice) / currentNoPrice) * 100;

    return {
      sharesBought,
      avgPrice: usdAmount / sharesBought,
      newYesPrice,
      newNoPrice,
      priceImpact,
      totalCost: usdAmount,
      newYesShares,
      newNoShares,
    };
  }

  /**
   * Calculate proceeds when selling shares (CPMM: k = yesShares * noShares)
   *
   * @description Calculates how much USD can be received for selling shares
   * using CPMM pricing. User returns shares which increases same side reserves,
   * and receives USD from opposite side reserves.
   *
   * @param {number} currentYesShares - Current YES shares in market
   * @param {number} currentNoShares - Current NO shares in market
   * @param {'yes' | 'no'} side - Side to sell (YES or NO)
   * @param {number} sharesToSell - Number of shares to sell
   * @returns {ShareCalculation} Calculation result with proceeds, prices, and impact
   * @throws {Error} If shares amount is invalid or market has insufficient liquidity
   *
   * @example
   * ```typescript
   * const calc = PredictionPricing.calculateSell(1000, 1000, 'yes', 100);
   * // Returns: { sharesBought: -100, avgPrice: ~0.91, totalCost: ~91, ... }
   * ```
   */
  static calculateSell(
    currentYesShares: number,
    currentNoShares: number,
    side: 'yes' | 'no',
    sharesToSell: number
  ): ShareCalculation {
    if (sharesToSell <= 0) {
      throw new Error('Shares to sell must be positive');
    }

    const k = currentYesShares * currentNoShares;
    if (k <= 0) {
      throw new Error('Market has insufficient liquidity');
    }

    const currentTotal = currentYesShares + currentNoShares;
    const currentYesPrice = currentNoShares / currentTotal;
    const currentNoPrice = currentYesShares / currentTotal;

    let newYesShares: number;
    let newNoShares: number;
    let proceeds: number;

    // CPMM: User returns shares, gets USD
    // Shares go back to same side reserves, USD comes from opposite side reserves
    if (side === 'yes') {
      // User returns YES shares → increases YES reserves
      // User gets USD → decreases NO reserves
      newYesShares = currentYesShares + sharesToSell;
      newNoShares = k / newYesShares;
      proceeds = currentNoShares - newNoShares;
    } else {
      // User returns NO shares → increases NO reserves
      // User gets USD → decreases YES reserves
      newNoShares = currentNoShares + sharesToSell;
      newYesShares = k / newNoShares;
      proceeds = currentYesShares - newYesShares;
    }

    if (!Number.isFinite(proceeds) || proceeds <= 0) {
      throw new Error('Calculated proceeds must be positive');
    }

    const newTotal = newYesShares + newNoShares;
    const newYesPrice = newNoShares / newTotal;
    const newNoPrice = newYesShares / newTotal;

    // Calculate proceeds (how much USD user gets back)
    const priceImpact =
      side === 'yes'
        ? ((currentYesPrice - newYesPrice) / currentYesPrice) * 100
        : ((currentNoPrice - newNoPrice) / currentNoPrice) * 100;

    return {
      sharesBought: -sharesToSell, // Negative because we're selling
      avgPrice: proceeds / sharesToSell,
      newYesPrice,
      newNoPrice,
      priceImpact,
      totalCost: proceeds, // Proceeds for selling
      newYesShares,
      newNoShares,
    };
  }

  /**
   * Get current price for a side
   *
   * @description Calculates the current market price (odds) for YES or NO
   * based on share distribution. Price represents the probability/odds.
   *
   * @param {number} yesShares - Current YES shares
   * @param {number} noShares - Current NO shares
   * @param {'yes' | 'no'} side - Side to get price for
   * @returns {number} Current price (0-1, representing probability)
   *
   * @example
   * ```typescript
   * const yesPrice = PredictionPricing.getCurrentPrice(1000, 1000, 'yes');
   * // Returns: 0.5 (50% probability)
   * ```
   */
  static getCurrentPrice(
    yesShares: number,
    noShares: number,
    side: 'yes' | 'no'
  ): number {
    const total = yesShares + noShares;
    return side === 'yes' ? noShares / total : yesShares / total;
  }

  /**
   * Calculate expected payout if position wins
   *
   * @description Calculates the expected payout if a position resolves in the
   * holder's favor. In prediction markets, winning shares pay their stake
   * plus principal (1 unit per share).
   *
   * @param {number} shares - Number of shares held
   * @param {number} avgPrice - Average purchase price per share
   * @returns {number} Expected payout if position wins
   *
   * @example
   * ```typescript
   * const payout = PredictionPricing.calculateExpectedPayout(100, 0.6);
   * // Returns: 160 (100 shares × (1 + 0.6))
   * ```
   */
  static calculateExpectedPayout(shares: number, avgPrice: number): number {
    // Liquidity shares pay their stake plus principal when the market resolves in their favor
    return shares * (1 + avgPrice);
  }

  /**
   * Initialize a new prediction market
   *
   * @description Creates initial market state with equal YES/NO shares for
   * a new prediction market. Sets up initial liquidity.
   *
   * Liquidity Considerations:
   * - Higher liquidity = lower price impact per trade
   * - With 10,000 liquidity, a $100 trade has ~2% price impact
   * - With 1,000 liquidity, a $100 trade has ~20% price impact
   * - Minimum recommended: 10,000 for acceptable user experience
   *
   * @param {number} [initialLiquidity=10000] - Initial total liquidity (default: 10,000)
   * @returns {object} Initial market state with yesShares and noShares
   *
   * @example
   * ```typescript
   * const market = PredictionPricing.initializeMarket(20000);
   * // Returns: { yesShares: 10000, noShares: 10000 }
   * ```
   */
  static initializeMarket(initialLiquidity = 10000) {
    return {
      yesShares: initialLiquidity / 2,
      noShares: initialLiquidity / 2,
    };
  }

  /**
   * Calculate buy with trading fees
   *
   * @description Calculates share purchase with trading fees included. User
   * provides total amount to spend, fees are deducted, then shares are
   * calculated from the net amount.
   *
   * @param {number} currentYesShares - Current YES shares in market
   * @param {number} currentNoShares - Current NO shares in market
   * @param {'yes' | 'no'} side - Side to buy (YES or NO)
   * @param {number} totalAmount - Total USD amount to spend (including fees)
   * @returns {ShareCalculationWithFees} Calculation result with fees included
   *
   * @example
   * ```typescript
   * const calc = PredictionPricing.calculateBuyWithFees(1000, 1000, 'yes', 100);
   * // Fee deducted from 100, then shares calculated from net amount
   * ```
   */
  static calculateBuyWithFees(
    currentYesShares: number,
    currentNoShares: number,
    side: 'yes' | 'no',
    totalAmount: number
  ): ShareCalculationWithFees {
    // Calculate fee
    const fee = totalAmount * FEE_CONFIG.TRADING_FEE_RATE;
    const netAmount = totalAmount - fee;

    // Calculate shares with net amount
    const baseCalc = PredictionPricing.calculateBuy(
      currentYesShares,
      currentNoShares,
      side,
      netAmount
    );

    return {
      ...baseCalc,
      fee,
      netAmount,
      totalWithFee: totalAmount,
      totalCost: netAmount,
    };
  }

  /**
   * Calculate sell with trading fees
   *
   * @description Calculates share sale proceeds with trading fees included.
   * Calculates gross proceeds first, then deducts fee to get net proceeds.
   *
   * @param {number} currentYesShares - Current YES shares in market
   * @param {number} currentNoShares - Current NO shares in market
   * @param {'yes' | 'no'} side - Side to sell (YES or NO)
   * @param {number} sharesToSell - Number of shares to sell
   * @returns {ShareCalculationWithFees} Calculation result with fees included
   *
   * @example
   * ```typescript
   * const calc = PredictionPricing.calculateSellWithFees(1000, 1000, 'yes', 100);
   * // Calculates gross proceeds, deducts fee, returns net proceeds
   * ```
   */
  static calculateSellWithFees(
    currentYesShares: number,
    currentNoShares: number,
    side: 'yes' | 'no',
    sharesToSell: number
  ): ShareCalculationWithFees {
    // Calculate base proceeds
    const baseCalc = PredictionPricing.calculateSell(
      currentYesShares,
      currentNoShares,
      side,
      sharesToSell
    );

    const grossProceeds = baseCalc.totalCost;
    const fee = grossProceeds * FEE_CONFIG.TRADING_FEE_RATE;
    const netProceeds = grossProceeds - fee;

    return {
      ...baseCalc,
      fee,
      netAmount: netProceeds,
      netProceeds,
      totalCost: grossProceeds,
    };
  }
}

/**
 * Standalone helper function for expected payout calculation
 *
 * @description Convenience function for calculating expected payout. Wraps
 * PredictionPricing.calculateExpectedPayout for easier usage.
 *
 * @param {number} shares - Number of shares held
 * @param {number} avgPrice - Average purchase price per share
 * @returns {number} Expected payout if position wins
 */
export function calculateExpectedPayout(
  shares: number,
  avgPrice: number
): number {
  return PredictionPricing.calculateExpectedPayout(shares, avgPrice);
}

