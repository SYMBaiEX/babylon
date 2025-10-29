/**
 * Prediction Market Pricing (AMM)
 * 
 * Uses a constant product market maker (CPMM) for prediction markets:
 * - k = yesShares * noShares (constant)
 * - Buying YES increases yesShares, price goes up
 * - Buying NO increases noShares, price goes down
 * - Fair price = noShares / (yesShares + noShares)
 */

export interface ShareCalculation {
  sharesBought: number;
  avgPrice: number;
  newYesPrice: number; // After trade
  newNoPrice: number; // After trade
  priceImpact: number; // % price moved
  totalCost: number;
}

export class PredictionPricing {
  /**
   * Calculate shares received when buying
   * Uses constant product formula: k = yesShares * noShares
   */
  static calculateBuy(
    currentYesShares: number,
    currentNoShares: number,
    side: 'yes' | 'no',
    usdAmount: number
  ): ShareCalculation {
    const k = currentYesShares * currentNoShares;
    const currentTotal = currentYesShares + currentNoShares;

    // Current price before trade
    const currentYesPrice = currentNoShares / currentTotal;
    const currentNoPrice = currentYesShares / currentTotal;

    let newYesShares: number;
    let newNoShares: number;
    let sharesBought: number;

    if (side === 'yes') {
      // Buying YES shares
      // Add usdAmount to YES pool
      newYesShares = currentYesShares + usdAmount;
      // Maintain constant product
      newNoShares = k / newYesShares;
      sharesBought = usdAmount; // In CPMM, you get 1 share per $1 spent
    } else {
      // Buying NO shares
      newNoShares = currentNoShares + usdAmount;
      newYesShares = k / newNoShares;
      sharesBought = usdAmount;
    }

    const newTotal = newYesShares + newNoShares;
    const newYesPrice = newNoShares / newTotal;
    const newNoPrice = newYesShares / newTotal;

    // Price impact (how much price moved)
    const priceImpact =
      side === 'yes'
        ? ((newYesPrice - currentYesPrice) / currentYesPrice) * 100
        : ((newNoPrice - currentNoPrice) / currentNoPrice) * 100;

    return {
      sharesBought,
      avgPrice: usdAmount / sharesBought, // Always ~$1 per share
      newYesPrice,
      newNoPrice,
      priceImpact,
      totalCost: usdAmount,
    };
  }

  /**
   * Calculate proceeds when selling shares
   */
  static calculateSell(
    currentYesShares: number,
    currentNoShares: number,
    side: 'yes' | 'no',
    sharesToSell: number
  ): ShareCalculation {
    const k = currentYesShares * currentNoShares;
    const currentTotal = currentYesShares + currentNoShares;

    // Current price before trade
    const currentYesPrice = currentNoShares / currentTotal;
    const currentNoPrice = currentYesShares / currentTotal;

    let newYesShares: number;
    let newNoShares: number;
    let usdProceeds: number;

    if (side === 'yes') {
      // Selling YES shares
      newYesShares = currentYesShares - sharesToSell;
      newNoShares = k / newYesShares;
      usdProceeds = sharesToSell; // Get back ~$1 per share
    } else {
      // Selling NO shares
      newNoShares = currentNoShares - sharesToSell;
      newYesShares = k / newNoShares;
      usdProceeds = sharesToSell;
    }

    const newTotal = newYesShares + newNoShares;
    const newYesPrice = newNoShares / newTotal;
    const newNoPrice = newYesShares / newTotal;

    const priceImpact =
      side === 'yes'
        ? ((currentYesPrice - newYesPrice) / currentYesPrice) * 100
        : ((currentNoPrice - newNoPrice) / currentNoPrice) * 100;

    return {
      sharesBought: -sharesToSell, // Negative for selling
      avgPrice: usdProceeds / sharesToSell,
      newYesPrice,
      newNoPrice,
      priceImpact,
      totalCost: usdProceeds,
    };
  }

  /**
   * Calculate current price for a side
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
   */
  static calculateExpectedPayout(shares: number): number {
    // Each share pays $1 if wins, $0 if loses
    return shares;
  }

  /**
   * Initialize market with initial liquidity
   */
  static initializeMarket(
    initialLiquidity: number = 1000
  ): { yesShares: number; noShares: number } {
    // Start at 50/50 odds
    return {
      yesShares: initialLiquidity / 2,
      noShares: initialLiquidity / 2,
    };
  }
}

