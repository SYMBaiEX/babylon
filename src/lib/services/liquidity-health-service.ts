/**
 * Liquidity Health Service
 * 
 * @module services/liquidity-health-service
 * 
 * @description
 * Monitors and reports on the health of prediction markets and perpetual markets.
 * Tracks key liquidity metrics like spread, imbalance, and price impact to
 * identify markets that may need attention.
 * 
 * **Key Metrics:**
 * - Spread: Difference between buy and sell prices
 * - Imbalance: Ratio of YES/NO shares (predictions) or Long/Short OI (perps)
 * - Price Impact: How much a trade moves the price
 * - Liquidity Score: Overall health rating (0-100)
 * 
 * @example
 * ```typescript
 * const health = await LiquidityHealthService.assessMarketHealth(marketId);
 * console.log(`Health score: ${health.healthScore}/100`);
 * console.log(`Warnings: ${health.warnings.join(', ')}`);
 * ```
 */

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { PredictionPricing } from '@/lib/prediction-pricing';
import {
  calculateDynamicFundingRate,
  getFundingRateTier,
  type FundingRateResult,
} from '@/lib/perps/funding-rate-calculator';

/**
 * Health assessment for a prediction market
 */
export interface PredictionMarketHealth {
  marketId: string;
  question: string;
  
  // Liquidity metrics
  totalLiquidity: number;
  yesShares: number;
  noShares: number;
  
  // Price metrics
  yesPrice: number;
  noPrice: number;
  
  // Spread (difference between buy and sell effective prices)
  spreadBps: number;  // Basis points
  effectiveYesBid: number;
  effectiveYesAsk: number;
  
  // Imbalance
  imbalanceRatio: number;  // 0 = balanced, 1 = all one side
  imbalanceDirection: 'yes' | 'no' | 'balanced';
  
  // Price impact for standard trades
  priceImpact50: number;   // % impact for $50 trade
  priceImpact100: number;  // % impact for $100 trade
  priceImpact500: number;  // % impact for $500 trade
  
  // Health scoring
  healthScore: number;  // 0-100
  healthTier: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
  
  // Issues
  warnings: string[];
  recommendations: string[];
}

/**
 * Health assessment for a perpetual market
 */
export interface PerpMarketHealth {
  ticker: string;
  organizationId: string;
  organizationName: string;
  
  // Position metrics
  totalOpenInterest: number;
  longOpenInterest: number;
  shortOpenInterest: number;
  
  // Price
  currentPrice: number;
  
  // Funding rate
  fundingRate: FundingRateResult;
  fundingTier: {
    tier: 'low' | 'moderate' | 'high' | 'extreme';
    description: string;
    color: string;
  };
  
  // Imbalance
  longShortRatio: number;  // >1 = more longs, <1 = more shorts
  imbalancePercent: number;
  
  // Volume metrics
  volume24h: number;
  positionCount: number;
  
  // Health scoring
  healthScore: number;  // 0-100
  healthTier: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
  
  // Issues
  warnings: string[];
  recommendations: string[];
}

/**
 * Aggregate health report for all markets
 */
export interface MarketHealthReport {
  timestamp: Date;
  
  // Prediction markets
  predictions: {
    totalMarkets: number;
    totalLiquidity: number;
    avgHealthScore: number;
    marketsNeedingAttention: PredictionMarketHealth[];
    summary: {
      excellent: number;
      good: number;
      fair: number;
      poor: number;
      critical: number;
    };
  };
  
  // Perpetual markets
  perps: {
    totalMarkets: number;
    totalOpenInterest: number;
    avgHealthScore: number;
    marketsNeedingAttention: PerpMarketHealth[];
    summary: {
      excellent: number;
      good: number;
      fair: number;
      poor: number;
      critical: number;
    };
  };
  
  // Overall
  overallHealthScore: number;
  criticalIssues: string[];
}

/**
 * Standard trade size for spread calculation (USD)
 */
const SPREAD_CALC_SIZE = 50;

/**
 * Health tier thresholds
 */
const HEALTH_TIERS = {
  EXCELLENT: 80,
  GOOD: 60,
  FAIR: 40,
  POOR: 20,
  // Below 20 = CRITICAL
};

/**
 * Liquidity Health Service
 * 
 * Monitors market health and provides actionable insights.
 */
export class LiquidityHealthService {
  /**
   * Assess health of a single prediction market
   */
  static async assessPredictionMarket(marketId: string): Promise<PredictionMarketHealth | null> {
    const market = await prisma.market.findUnique({
      where: { id: marketId },
      select: {
        id: true,
        question: true,
        yesShares: true,
        noShares: true,
        liquidity: true,
        resolved: true,
      },
    });

    if (!market || market.resolved) {
      return null;
    }

    const yesShares = Number(market.yesShares);
    const noShares = Number(market.noShares);
    const totalLiquidity = yesShares + noShares;

    // Calculate prices
    const yesPrice = PredictionPricing.getCurrentPrice(yesShares, noShares, 'yes');
    const noPrice = PredictionPricing.getCurrentPrice(yesShares, noShares, 'no');

    // Calculate spread (effective bid/ask difference)
    const { spreadBps, effectiveBid, effectiveAsk } = this.calculateSpread(yesShares, noShares);

    // Calculate imbalance
    const imbalanceRatio = Math.abs(yesShares - noShares) / totalLiquidity;
    const imbalanceDirection = yesShares > noShares * 1.1 ? 'yes' 
      : noShares > yesShares * 1.1 ? 'no' 
      : 'balanced';

    // Calculate price impacts for various trade sizes
    const priceImpact50 = this.calculatePriceImpact(yesShares, noShares, 50);
    const priceImpact100 = this.calculatePriceImpact(yesShares, noShares, 100);
    const priceImpact500 = this.calculatePriceImpact(yesShares, noShares, 500);

    // Assess health
    const { healthScore, warnings, recommendations } = this.assessPredictionHealth({
      totalLiquidity,
      imbalanceRatio,
      spreadBps,
      priceImpact100,
    });

    const healthTier = this.getHealthTier(healthScore);

    return {
      marketId,
      question: market.question,
      totalLiquidity,
      yesShares,
      noShares,
      yesPrice,
      noPrice,
      spreadBps,
      effectiveYesBid: effectiveBid,
      effectiveYesAsk: effectiveAsk,
      imbalanceRatio,
      imbalanceDirection,
      priceImpact50,
      priceImpact100,
      priceImpact500,
      healthScore,
      healthTier,
      warnings,
      recommendations,
    };
  }

  /**
   * Assess health of a perpetual market
   */
  static async assessPerpMarket(organizationId: string): Promise<PerpMarketHealth | null> {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        ticker: true,
        currentPrice: true,
      },
    });

    if (!org) {
      return null;
    }

    // Get all open positions for this market
    const positions = await prisma.perpPosition.findMany({
      where: {
        organizationId,
        closedAt: null,
      },
      select: {
        id: true,
        side: true,
        size: true,
        entryPrice: true,
        openedAt: true,
      },
    });

    // Calculate open interest
    const longs = positions.filter(p => p.side === 'long');
    const shorts = positions.filter(p => p.side === 'short');
    const longOI = longs.reduce((sum, p) => sum + Number(p.size), 0);
    const shortOI = shorts.reduce((sum, p) => sum + Number(p.size), 0);
    const totalOI = longOI + shortOI;

    // Calculate funding rate
    const fundingRate = calculateDynamicFundingRate({
      longOpenInterest: longOI,
      shortOpenInterest: shortOI,
    });
    const fundingTier = getFundingRateTier(fundingRate.annualRate);

    // Calculate long/short ratio
    const longShortRatio = shortOI > 0 ? longOI / shortOI : longOI > 0 ? Infinity : 1;
    const imbalancePercent = totalOI > 0 ? Math.abs(longOI - shortOI) / totalOI * 100 : 0;

    // Calculate 24h volume (positions opened in last 24h)
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentPositions = positions.filter(p => new Date(p.openedAt) > dayAgo);
    const volume24h = recentPositions.reduce((sum, p) => sum + Number(p.size), 0);

    // Assess health
    const { healthScore, warnings, recommendations } = this.assessPerpHealth({
      totalOI,
      imbalancePercent,
      fundingRate,
      positionCount: positions.length,
    });

    const healthTier = this.getHealthTier(healthScore);

    return {
      ticker: org.ticker || org.id,
      organizationId: org.id,
      organizationName: org.name,
      totalOpenInterest: totalOI,
      longOpenInterest: longOI,
      shortOpenInterest: shortOI,
      currentPrice: org.currentPrice ?? 100,
      fundingRate,
      fundingTier,
      longShortRatio,
      imbalancePercent,
      volume24h,
      positionCount: positions.length,
      healthScore,
      healthTier,
      warnings,
      recommendations,
    };
  }

  /**
   * Generate full health report for all markets
   */
  static async generateHealthReport(): Promise<MarketHealthReport> {
    const timestamp = new Date();
    const criticalIssues: string[] = [];

    // Get all active prediction markets
    const predictionMarkets = await prisma.market.findMany({
      where: { resolved: false },
      select: { id: true },
    });

    const predictionHealths: PredictionMarketHealth[] = [];
    for (const market of predictionMarkets) {
      const health = await this.assessPredictionMarket(market.id);
      if (health) {
        predictionHealths.push(health);
      }
    }

    // Get all companies (perp markets)
    const companies = await prisma.organization.findMany({
      where: { type: 'company' },
      select: { id: true },
    });

    const perpHealths: PerpMarketHealth[] = [];
    for (const company of companies) {
      const health = await this.assessPerpMarket(company.id);
      if (health) {
        perpHealths.push(health);
      }
    }

    // Aggregate prediction stats
    const predictionSummary = {
      excellent: predictionHealths.filter(h => h.healthTier === 'excellent').length,
      good: predictionHealths.filter(h => h.healthTier === 'good').length,
      fair: predictionHealths.filter(h => h.healthTier === 'fair').length,
      poor: predictionHealths.filter(h => h.healthTier === 'poor').length,
      critical: predictionHealths.filter(h => h.healthTier === 'critical').length,
    };

    const predictionTotalLiquidity = predictionHealths.reduce((sum, h) => sum + h.totalLiquidity, 0);
    const predictionAvgHealth = predictionHealths.length > 0
      ? predictionHealths.reduce((sum, h) => sum + h.healthScore, 0) / predictionHealths.length
      : 100;

    // Aggregate perp stats
    const perpSummary = {
      excellent: perpHealths.filter(h => h.healthTier === 'excellent').length,
      good: perpHealths.filter(h => h.healthTier === 'good').length,
      fair: perpHealths.filter(h => h.healthTier === 'fair').length,
      poor: perpHealths.filter(h => h.healthTier === 'poor').length,
      critical: perpHealths.filter(h => h.healthTier === 'critical').length,
    };

    const perpTotalOI = perpHealths.reduce((sum, h) => sum + h.totalOpenInterest, 0);
    const perpAvgHealth = perpHealths.length > 0
      ? perpHealths.reduce((sum, h) => sum + h.healthScore, 0) / perpHealths.length
      : 100;

    // Identify markets needing attention
    const predictionAttention = predictionHealths
      .filter(h => h.healthTier === 'poor' || h.healthTier === 'critical')
      .sort((a, b) => a.healthScore - b.healthScore);

    const perpAttention = perpHealths
      .filter(h => h.healthTier === 'poor' || h.healthTier === 'critical')
      .sort((a, b) => a.healthScore - b.healthScore);

    // Collect critical issues
    for (const market of predictionAttention.filter(h => h.healthTier === 'critical')) {
      criticalIssues.push(`Prediction "${market.question.substring(0, 50)}..." has critical liquidity issues`);
    }
    for (const market of perpAttention.filter(h => h.healthTier === 'critical')) {
      criticalIssues.push(`Perp market ${market.ticker} has severe imbalance (${market.imbalancePercent.toFixed(0)}%)`);
    }

    const overallHealthScore = (predictionAvgHealth + perpAvgHealth) / 2;

    logger.info(
      `Market health report generated`,
      {
        predictions: {
          total: predictionHealths.length,
          avgHealth: predictionAvgHealth.toFixed(1),
          critical: predictionSummary.critical,
        },
        perps: {
          total: perpHealths.length,
          avgHealth: perpAvgHealth.toFixed(1),
          critical: perpSummary.critical,
        },
        overall: overallHealthScore.toFixed(1),
      },
      'LiquidityHealthService'
    );

    return {
      timestamp,
      predictions: {
        totalMarkets: predictionHealths.length,
        totalLiquidity: predictionTotalLiquidity,
        avgHealthScore: predictionAvgHealth,
        marketsNeedingAttention: predictionAttention,
        summary: predictionSummary,
      },
      perps: {
        totalMarkets: perpHealths.length,
        totalOpenInterest: perpTotalOI,
        avgHealthScore: perpAvgHealth,
        marketsNeedingAttention: perpAttention,
        summary: perpSummary,
      },
      overallHealthScore,
      criticalIssues,
    };
  }

  /**
   * Calculate effective spread for a prediction market
   */
  private static calculateSpread(
    yesShares: number,
    noShares: number
  ): { spreadBps: number; effectiveBid: number; effectiveAsk: number } {
    // For spread calculation, we see what price you get when buying vs selling
    // the standard trade size
    
    // Price to buy YES (you pay more)
    const buyCalc = PredictionPricing.calculateBuy(yesShares, noShares, 'yes', SPREAD_CALC_SIZE);
    const effectiveAsk = buyCalc.avgPrice;

    // Price when selling YES (you get less)
    // We need sufficient YES shares to sell
    const sellShares = SPREAD_CALC_SIZE / buyCalc.avgPrice;
    let effectiveBid: number;
    
    // Check if there are enough shares to calculate sell price
    if (yesShares > sellShares) {
      const sellCalc = PredictionPricing.calculateSell(yesShares, noShares, 'yes', sellShares);
      effectiveBid = sellCalc.avgPrice;
    } else {
      // Can't sell, use theoretical bid
      effectiveBid = PredictionPricing.getCurrentPrice(yesShares, noShares, 'yes') * 0.95;
    }

    // Spread in basis points
    const spreadBps = ((effectiveAsk - effectiveBid) / effectiveBid) * 10000;

    return {
      spreadBps: Math.max(0, spreadBps),
      effectiveBid,
      effectiveAsk,
    };
  }

  /**
   * Calculate price impact for a given trade size
   */
  private static calculatePriceImpact(
    yesShares: number,
    noShares: number,
    tradeSize: number
  ): number {
    const calc = PredictionPricing.calculateBuy(yesShares, noShares, 'yes', tradeSize);
    return Math.abs(calc.priceImpact);
  }

  /**
   * Assess prediction market health
   */
  private static assessPredictionHealth(params: {
    totalLiquidity: number;
    imbalanceRatio: number;
    spreadBps: number;
    priceImpact100: number;
  }): { healthScore: number; warnings: string[]; recommendations: string[] } {
    const warnings: string[] = [];
    const recommendations: string[] = [];
    let healthScore = 100;

    // Liquidity check
    if (params.totalLiquidity < 2000) {
      healthScore -= 40;
      warnings.push(`Very low liquidity: ${params.totalLiquidity.toFixed(0)} points`);
      recommendations.push('Add more liquidity to improve trading experience');
    } else if (params.totalLiquidity < 5000) {
      healthScore -= 20;
      warnings.push(`Low liquidity: ${params.totalLiquidity.toFixed(0)} points`);
    } else if (params.totalLiquidity < 10000) {
      healthScore -= 10;
    }

    // Imbalance check
    if (params.imbalanceRatio > 0.8) {
      healthScore -= 30;
      warnings.push(`Extreme imbalance: ${(params.imbalanceRatio * 100).toFixed(0)}%`);
      recommendations.push('Market heavily skewed to one side');
    } else if (params.imbalanceRatio > 0.6) {
      healthScore -= 15;
      warnings.push(`High imbalance: ${(params.imbalanceRatio * 100).toFixed(0)}%`);
    } else if (params.imbalanceRatio > 0.4) {
      healthScore -= 5;
    }

    // Spread check
    if (params.spreadBps > 1000) {
      healthScore -= 20;
      warnings.push(`Wide spread: ${params.spreadBps.toFixed(0)} bps`);
      recommendations.push('High trading costs due to wide spread');
    } else if (params.spreadBps > 500) {
      healthScore -= 10;
      warnings.push(`Elevated spread: ${params.spreadBps.toFixed(0)} bps`);
    }

    // Price impact check
    if (params.priceImpact100 > 10) {
      healthScore -= 15;
      warnings.push(`High price impact for $100 trade: ${params.priceImpact100.toFixed(1)}%`);
    } else if (params.priceImpact100 > 5) {
      healthScore -= 5;
    }

    return {
      healthScore: Math.max(0, healthScore),
      warnings,
      recommendations,
    };
  }

  /**
   * Assess perpetual market health
   */
  private static assessPerpHealth(params: {
    totalOI: number;
    imbalancePercent: number;
    fundingRate: FundingRateResult;
    positionCount: number;
  }): { healthScore: number; warnings: string[]; recommendations: string[] } {
    const warnings: string[] = [];
    const recommendations: string[] = [];
    let healthScore = 100;

    // Open interest check (low OI means thin market)
    if (params.totalOI < 1000) {
      healthScore -= 20;
      warnings.push(`Low open interest: $${params.totalOI.toFixed(0)}`);
    } else if (params.totalOI < 5000) {
      healthScore -= 10;
    }

    // Imbalance check
    if (params.imbalancePercent > 80) {
      healthScore -= 35;
      warnings.push(`Extreme imbalance: ${params.imbalancePercent.toFixed(0)}%`);
      recommendations.push('Consider positions on the minority side for funding income');
    } else if (params.imbalancePercent > 60) {
      healthScore -= 20;
      warnings.push(`High imbalance: ${params.imbalancePercent.toFixed(0)}%`);
    } else if (params.imbalancePercent > 40) {
      healthScore -= 10;
    }

    // Funding rate check
    if (params.fundingRate.isSeverelyImbalanced) {
      healthScore -= 15;
      warnings.push(`High funding rate: ${(params.fundingRate.annualRate * 100).toFixed(1)}% APR`);
      const direction = params.fundingRate.paymentDirection === 'longs_pay' ? 'longs' : 'shorts';
      recommendations.push(`${direction} are paying high funding costs`);
    }

    // Position diversity check
    if (params.positionCount < 3 && params.totalOI > 0) {
      healthScore -= 10;
      warnings.push(`Few active positions: ${params.positionCount}`);
    }

    return {
      healthScore: Math.max(0, healthScore),
      warnings,
      recommendations,
    };
  }

  /**
   * Get health tier from score
   */
  private static getHealthTier(score: number): 'excellent' | 'good' | 'fair' | 'poor' | 'critical' {
    if (score >= HEALTH_TIERS.EXCELLENT) return 'excellent';
    if (score >= HEALTH_TIERS.GOOD) return 'good';
    if (score >= HEALTH_TIERS.FAIR) return 'fair';
    if (score >= HEALTH_TIERS.POOR) return 'poor';
    return 'critical';
  }
}

