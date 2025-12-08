/**
 * Prediction Market AMM Pricing (CPMM)
 *
 * Framework-free math utilities for YES/NO markets.
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

export interface ShareCalculationWithFees extends ShareCalculation {
  fee: number;
  netAmount: number;
  totalWithFee?: number;
  netProceeds?: number;
}

export class PredictionPricing {
  static getCurrentPrice(
    yesShares: number,
    noShares: number,
    side: 'yes' | 'no'
  ): number {
    const total = yesShares + noShares;
    if (total <= 0) return 0.5;
    return side === 'yes' ? noShares / total : yesShares / total;
  }

  static calculateExpectedPayout(shares: number, avgPrice: number): number {
    return shares * (1 + avgPrice);
  }

  /**
   * Initialize a market with symmetric liquidity.
   */
  static initializeMarket(initialLiquidity = 10_000) {
    const half = initialLiquidity / 2;
    return { yesShares: half, noShares: half };
  }

  static calculateBuy(
    currentYesShares: number,
    currentNoShares: number,
    side: 'yes' | 'no',
    usdAmount: number
  ): ShareCalculation {
    if (usdAmount <= 0) throw new Error('Trade amount must be positive');
    const k = currentYesShares * currentNoShares;
    if (k <= 0) throw new Error('Market has insufficient liquidity');

    let newYesShares: number;
    let newNoShares: number;
    let sharesBought: number;

    if (side === 'yes') {
      newNoShares = currentNoShares + usdAmount;
      newYesShares = k / newNoShares;
      sharesBought = currentYesShares - newYesShares;
    } else {
      newYesShares = currentYesShares + usdAmount;
      newNoShares = k / newYesShares;
      sharesBought = currentNoShares - newNoShares;
    }

    if (sharesBought <= 0)
      throw new Error('Calculated shares must be positive');

    const newTotal = newYesShares + newNoShares;
    const newYesPrice = newNoShares / newTotal;
    const newNoPrice = newYesShares / newTotal;
    const currentTotal = currentYesShares + currentNoShares;
    const currentYesPrice = currentNoShares / currentTotal;
    const currentNoPrice = currentYesShares / currentTotal;

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

  static calculateSell(
    currentYesShares: number,
    currentNoShares: number,
    side: 'yes' | 'no',
    sharesToSell: number
  ): ShareCalculation {
    if (sharesToSell <= 0) throw new Error('Shares to sell must be positive');
    const k = currentYesShares * currentNoShares;
    if (k <= 0) throw new Error('Market has insufficient liquidity');

    let newYesShares: number;
    let newNoShares: number;
    let proceeds: number;

    if (side === 'yes') {
      newYesShares = currentYesShares + sharesToSell;
      newNoShares = k / newYesShares;
      proceeds = currentNoShares - newNoShares;
    } else {
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
    const currentTotal = currentYesShares + currentNoShares;
    const currentYesPrice = currentNoShares / currentTotal;
    const currentNoPrice = currentYesShares / currentTotal;

    const priceImpact =
      side === 'yes'
        ? ((newYesPrice - currentYesPrice) / currentYesPrice) * 100
        : ((newNoPrice - currentNoPrice) / currentNoPrice) * 100;

    return {
      sharesBought: sharesToSell,
      avgPrice: proceeds / sharesToSell,
      newYesPrice,
      newNoPrice,
      priceImpact,
      totalCost: proceeds,
      newYesShares,
      newNoShares,
    };
  }

  static calculateBuyWithFees(
    currentYesShares: number,
    currentNoShares: number,
    side: 'yes' | 'no',
    totalAmount: number,
    feeRate: number
  ): ShareCalculationWithFees {
    const fee = totalAmount * feeRate;
    const netAmount = totalAmount - fee;
    const base = this.calculateBuy(
      currentYesShares,
      currentNoShares,
      side,
      netAmount
    );
    return {
      ...base,
      fee,
      netAmount,
      totalWithFee: totalAmount,
      totalCost: netAmount,
    };
  }

  static calculateSellWithFees(
    currentYesShares: number,
    currentNoShares: number,
    side: 'yes' | 'no',
    sharesToSell: number,
    feeRate: number
  ): ShareCalculationWithFees {
    const base = this.calculateSell(
      currentYesShares,
      currentNoShares,
      side,
      sharesToSell
    );
    const gross = base.totalCost;
    const fee = gross * feeRate;
    const netProceeds = gross - fee;
    return {
      ...base,
      fee,
      netAmount: netProceeds,
      netProceeds,
      totalCost: gross,
    };
  }
}

export function calculateExpectedPayout(
  shares: number,
  avgPrice: number
): number {
  return PredictionPricing.calculateExpectedPayout(shares, avgPrice);
}
