/**
 * API Route: /api/markets/perps
 * Methods: GET (get perpetual markets data)
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/api/auth-middleware';
import { getRealtimeEngine } from '@/api/realtime';

/**
 * GET /api/markets/perps
 * Get all perpetual futures markets with current prices, funding rates, etc.
 */
export async function GET(request: NextRequest) {
  try {
    const engine = getRealtimeEngine();
    const perpsEngine = engine.getPerpsEngine();

    const markets = perpsEngine.getMarkets();

    return successResponse({
      markets: markets.map((market) => ({
        ticker: market.ticker,
        organizationId: market.organizationId,
        name: market.name,
        currentPrice: market.currentPrice,
        change24h: market.change24h,
        changePercent24h: market.changePercent24h,
        high24h: market.high24h,
        low24h: market.low24h,
        volume24h: market.volume24h,
        openInterest: market.openInterest,
        fundingRate: {
          rate: market.fundingRate.rate,
          nextFundingTime: market.fundingRate.nextFundingTime,
          predictedRate: market.fundingRate.predictedRate,
        },
        maxLeverage: market.maxLeverage,
        minOrderSize: market.minOrderSize,
        markPrice: market.markPrice,
        indexPrice: market.indexPrice,
      })),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching perp markets:', error);
    return errorResponse('Failed to fetch perpetual markets');
  }
}


