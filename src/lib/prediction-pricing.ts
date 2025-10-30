/**
 * Prediction Market AMM Pricing
 * Pure math - no dependencies, can be used client or server side
 * 
 * Uses Constant Product Market Maker (CPMM): k = yesShares * noShares
 */

export interface ShareCalculation {
  sharesBought: number;
  avgPrice: number;
  newYesPrice: number;
  newNoPrice: number;
  priceImpact: number;
  totalCost: number;
}

export class PredictionPricing {
  /**
   * Calculate shares when buying (CPMM: k = yesShares * noShares)
   */
  static calculateBuy(
    currentYesShares: number,
    currentNoShares: number,
    side: 'yes' | 'no',
    usdAmount: number
  ): ShareCalculation {
    const k = currentYesShares * currentNoShares;
    const currentTotal = currentYesShares + currentNoShares;
    const currentYesPrice = currentNoShares / currentTotal;
    const currentNoPrice = currentYesShares / currentTotal;

    let newYesShares: number;
    let newNoShares: number;

    if (side === 'yes') {
      newYesShares = currentYesShares + usdAmount;
      newNoShares = k / newYesShares;
    } else {
      newNoShares = currentNoShares + usdAmount;
      newYesShares = k / newNoShares;
    }

    const newTotal = newYesShares + newNoShares;
    const newYesPrice = newNoShares / newTotal;
    const newNoPrice = newYesShares / newTotal;

    const priceImpact =
      side === 'yes'
        ? ((newYesPrice - currentYesPrice) / currentYesPrice) * 100
        : ((newNoPrice - currentNoPrice) / currentNoPrice) * 100;

    return {
      sharesBought: usdAmount,
      avgPrice: 1, // ~$1 per share in CPMM
      newYesPrice,
      newNoPrice,
      priceImpact,
      totalCost: usdAmount,
    };
  }

  static getCurrentPrice(yesShares: number, noShares: number, side: 'yes' | 'no'): number {
    const total = yesShares + noShares;
    return side === 'yes' ? noShares / total : yesShares / total;
  }

  /**
   * Calculate expected payout if position wins
   */
  static calculateExpectedPayout(shares: number): number {
    // Each share pays $1 if wins, $0 if loses
    return shares * 1.0;
  }

  static initializeMarket(initialLiquidity = 1000) {
    return {
      yesShares: initialLiquidity / 2,
      noShares: initialLiquidity / 2,
    };
  }
}

/**
 * Standalone helper function for expected payout calculation
 */
export function calculateExpectedPayout(shares: number): number {
  return PredictionPricing.calculateExpectedPayout(shares);
}

