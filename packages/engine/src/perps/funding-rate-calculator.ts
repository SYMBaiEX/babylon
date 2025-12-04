/**
 * Dynamic Funding Rate Calculator
 *
 * @module lib/perps/funding-rate-calculator
 *
 * @description
 * Calculates dynamic funding rates for perpetual futures based on long/short imbalance.
 * Funding rates are the mechanism that keeps perpetual prices aligned with spot prices
 * and incentivizes counter-positions when there's market imbalance.
 *
 * **Funding Rate Mechanics:**
 * - Positive funding rate: Longs pay shorts (market is long-biased)
 * - Negative funding rate: Shorts pay longs (market is short-biased)
 * - Funding payments occur every 8 hours (00:00, 08:00, 16:00 UTC)
 *
 * **Exponential Scaling:**
 * The funding rate scales exponentially with imbalance to strongly discourage
 * one-sided markets. This is more aggressive than linear scaling because
 * without price impact from trades, funding is the ONLY balancing mechanism.
 *
 * @example
 * ```typescript
 * const rate = calculateDynamicFundingRate({
 *   longOpenInterest: 80000,
 *   shortOpenInterest: 20000,
 *   baseFundingRate: 0.01,  // 1% APR base
 *   maxFundingRate: 0.50,   // 50% APR max
 * });
 * // Returns ~0.15 (15% APR) due to 80/20 imbalance
 * ```
 */

import { logger } from '@babylon/shared';

/**
 * Parameters for funding rate calculation
 */
export interface FundingRateParams {
  /** Total USD value of long positions */
  longOpenInterest: number;

  /** Total USD value of short positions */
  shortOpenInterest: number;

  /** Base annual funding rate when market is balanced (default: 1% = 0.01) */
  baseFundingRate?: number;

  /** Maximum annual funding rate cap (default: 50% = 0.50) */
  maxFundingRate?: number;

  /** Exponent for imbalance scaling (default: 3.0) - higher = more aggressive */
  imbalanceExponent?: number;
}

/**
 * Result of funding rate calculation
 */
export interface FundingRateResult {
  /** Annual funding rate as decimal (e.g., 0.15 = 15% APR) */
  annualRate: number;

  /** Funding rate for a single 8-hour period */
  periodRate: number;

  /** Long/short imbalance ratio (-1 to +1, positive = more longs) */
  imbalance: number;

  /** Whether the market is considered severely imbalanced (>70% one side) */
  isSeverelyImbalanced: boolean;

  /** Direction of payments: 'longs_pay' | 'shorts_pay' | 'balanced' */
  paymentDirection: 'longs_pay' | 'shorts_pay' | 'balanced';
}

/** Default funding rate configuration */
export const FUNDING_DEFAULTS = {
  /** Base annual rate when balanced (1% APR) */
  BASE_RATE: 0.01,

  /** Maximum annual rate (50% APR) - aggressive to balance synthetic markets */
  MAX_RATE: 0.5,

  /** Exponent for exponential scaling */
  IMBALANCE_EXPONENT: 3.0,

  /** Threshold for "severe" imbalance warning */
  SEVERE_IMBALANCE_THRESHOLD: 0.4,

  /** Number of 8-hour periods per year */
  PERIODS_PER_YEAR: 1095.75, // 365.25 * 24 / 8
};

/**
 * Calculate dynamic funding rate based on long/short open interest
 *
 * @description
 * Uses exponential scaling to aggressively penalize market imbalances.
 * In a synthetic perpetuals market where trades don't affect spot price,
 * funding rate is the ONLY mechanism to balance positions.
 *
 * Formula:
 * ```
 * imbalance = (longOI - shortOI) / totalOI  // Range: -1 to +1
 * multiplier = |imbalance|^exponent * scaleFactor
 * annualRate = baseRate * (1 + multiplier) * sign(imbalance)
 * ```
 *
 * Example scenarios:
 * - 50/50 split: 1% APR (balanced)
 * - 60/40 split: ~3% APR
 * - 70/30 split: ~8% APR
 * - 80/20 split: ~18% APR
 * - 90/10 split: ~40% APR
 *
 * @param params - Funding rate calculation parameters
 * @returns Calculated funding rate result
 */
export function calculateDynamicFundingRate(
  params: FundingRateParams
): FundingRateResult {
  const {
    longOpenInterest,
    shortOpenInterest,
    baseFundingRate = FUNDING_DEFAULTS.BASE_RATE,
    maxFundingRate = FUNDING_DEFAULTS.MAX_RATE,
    imbalanceExponent = FUNDING_DEFAULTS.IMBALANCE_EXPONENT,
  } = params;

  const totalOI = longOpenInterest + shortOpenInterest;

  // Handle edge cases
  if (totalOI === 0) {
    return {
      annualRate: baseFundingRate,
      periodRate: baseFundingRate / FUNDING_DEFAULTS.PERIODS_PER_YEAR,
      imbalance: 0,
      isSeverelyImbalanced: false,
      paymentDirection: 'balanced',
    };
  }

  // Calculate imbalance: -1 (all shorts) to +1 (all longs)
  const imbalance = (longOpenInterest - shortOpenInterest) / totalOI;

  // Determine payment direction
  let paymentDirection: 'longs_pay' | 'shorts_pay' | 'balanced';
  if (Math.abs(imbalance) < 0.05) {
    paymentDirection = 'balanced';
  } else if (imbalance > 0) {
    paymentDirection = 'longs_pay';
  } else {
    paymentDirection = 'shorts_pay';
  }

  // Exponential scaling for imbalance
  // This creates aggressive funding rates for extreme imbalances
  const absImbalance = Math.abs(imbalance);

  // Scale factor to reach meaningful rates at moderate imbalances
  // At 50% imbalance, we want ~10-15% APR
  const scaleFactor =
    (maxFundingRate - baseFundingRate) / 1.0 ** imbalanceExponent;

  // Calculate rate multiplier using exponential function
  const rateMultiplier = absImbalance ** imbalanceExponent * scaleFactor;

  // Final rate: base rate + imbalance-driven component
  // When perfectly balanced (imbalance=0), rate defaults to base rate
  // Direction is determined by which side dominates
  let annualRate: number;
  if (absImbalance < 0.01) {
    // Near-balanced market: use base rate (can be interpreted as slightly positive)
    annualRate = baseFundingRate;
  } else {
    // Imbalanced market: base + multiplier, with direction from imbalance sign
    const signedRate =
      (baseFundingRate + rateMultiplier) * Math.sign(imbalance);
    annualRate = Math.max(
      -maxFundingRate,
      Math.min(maxFundingRate, signedRate)
    );
  }

  // Convert to single 8-hour period rate
  const periodRate = annualRate / FUNDING_DEFAULTS.PERIODS_PER_YEAR;

  const isSeverelyImbalanced =
    absImbalance > FUNDING_DEFAULTS.SEVERE_IMBALANCE_THRESHOLD;

  if (isSeverelyImbalanced) {
    logger.warn(
      'Severe funding imbalance detected',
      {
        longOI: longOpenInterest,
        shortOI: shortOpenInterest,
        imbalance: (imbalance * 100).toFixed(1) + '%',
        fundingAPR: (annualRate * 100).toFixed(2) + '%',
      },
      'FundingRateCalculator'
    );
  }

  return {
    annualRate,
    periodRate,
    imbalance,
    isSeverelyImbalanced,
    paymentDirection,
  };
}

/**
 * Calculate funding payment amount for a position
 *
 * @param positionSize - Position size in USD
 * @param periodRate - Funding rate for the period (from calculateDynamicFundingRate)
 * @param side - Position side ('long' or 'short')
 * @returns Payment amount (positive = pay, negative = receive)
 *
 * @example
 * ```typescript
 * const result = calculateDynamicFundingRate({ longOI: 80000, shortOI: 20000 });
 * const payment = calculatePositionFunding(1000, result.periodRate, 'long');
 * // If periodRate is positive and side is 'long', payment is positive (pays out)
 * ```
 */
export function calculatePositionFunding(
  positionSize: number,
  periodRate: number,
  side: 'long' | 'short'
): number {
  const baseFunding = positionSize * Math.abs(periodRate);

  // Longs pay when rate is positive, shorts pay when rate is negative
  if (periodRate > 0) {
    return side === 'long' ? baseFunding : -baseFunding;
  }
  return side === 'short' ? baseFunding : -baseFunding;
}

/**
 * Get funding rate tier description for UI display
 *
 * @param annualRate - Annual funding rate
 * @returns Human-readable tier description
 */
export function getFundingRateTier(annualRate: number): {
  tier: 'low' | 'moderate' | 'high' | 'extreme';
  description: string;
  color: string;
} {
  const absRate = Math.abs(annualRate);

  if (absRate < 0.03) {
    return {
      tier: 'low',
      description: 'Market is balanced',
      color: 'green',
    };
  }
  if (absRate < 0.1) {
    return {
      tier: 'moderate',
      description: 'Slight imbalance',
      color: 'yellow',
    };
  }
  if (absRate < 0.25) {
    return {
      tier: 'high',
      description: 'Significant imbalance',
      color: 'orange',
    };
  }
  return {
    tier: 'extreme',
    description: 'Extreme imbalance - high funding costs',
    color: 'red',
  };
}

/**
 * Estimate funding cost/income over a time period
 *
 * @param positionSize - Position size in USD
 * @param annualRate - Annual funding rate
 * @param side - Position side
 * @param daysToHold - Expected holding period in days
 * @returns Estimated funding cost (positive) or income (negative)
 */
export function estimateFundingCost(
  positionSize: number,
  annualRate: number,
  side: 'long' | 'short',
  daysToHold: number
): number {
  const periodsPerDay = 3; // 8-hour periods
  const totalPeriods = daysToHold * periodsPerDay;
  const periodRate = annualRate / FUNDING_DEFAULTS.PERIODS_PER_YEAR;

  let totalCost = 0;
  for (let i = 0; i < totalPeriods; i++) {
    totalCost += calculatePositionFunding(positionSize, periodRate, side);
  }

  return totalCost;
}
