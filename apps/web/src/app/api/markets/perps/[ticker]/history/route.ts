/**
 * Perpetual Market Price History API
 *
 * @route GET /api/markets/perps/[ticker]/history - Get price history
 * @access Public
 *
 * @description
 * Returns price history for a perpetual market including price, change,
 * and OHLCV data. Useful for charting and analytics.
 *
 * @openapi
 * /api/markets/perps/{ticker}/history:
 *   get:
 *     tags:
 *       - Markets
 *     summary: Get perpetual market price history
 *     description: Returns price history with OHLCV data for charting
 *     parameters:
 *       - in: path
 *         name: ticker
 *         required: true
 *         schema:
 *           type: string
 *         description: Market ticker symbol (e.g., AAPL, TSLA)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 1000
 *           default: 200
 *         description: Number of history points to return
 *     responses:
 *       200:
 *         description: Price history retrieved successfully
 *       404:
 *         description: Market not found
 *
 * @example
 * ```typescript
 * const response = await fetch(`/api/markets/perps/${ticker}/history?limit=100`);
 * const { history } = await response.json();
 * ```
 */

import { successResponse, withErrorHandling } from '@babylon/api';
import { db, perpMarketSnapshots, stockPrices } from '@babylon/db';
import { desc, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

const ParamsSchema = z.object({
  ticker: z.string().min(1).max(20),
});

const QuerySchema = z.object({
  limit: z
    .preprocess(
      (value) => (value === null ? undefined : value),
      z.coerce.number().min(1).max(1000)
    )
    .optional()
    .default(200),
});

export const GET = withErrorHandling(
  async (
    request: NextRequest,
    context: { params: Promise<{ ticker: string }> }
  ) => {
    const { ticker } = ParamsSchema.parse(await context.params);
    const { searchParams } = new URL(request.url);
    const { limit } = QuerySchema.parse({ limit: searchParams.get('limit') });

    // Look up the organizationId from the perp market snapshot
    const [marketSnapshot] = await db
      .select({ organizationId: perpMarketSnapshots.organizationId })
      .from(perpMarketSnapshots)
      .where(eq(perpMarketSnapshots.ticker, ticker))
      .limit(1);

    if (!marketSnapshot) {
      return successResponse({
        ticker,
        history: [],
        message: 'Market not found',
      });
    }

    // Get price history from stockPrices table
    const history = await db
      .select({
        id: stockPrices.id,
        price: stockPrices.price,
        change: stockPrices.change,
        changePercent: stockPrices.changePercent,
        timestamp: stockPrices.timestamp,
        openPrice: stockPrices.openPrice,
        highPrice: stockPrices.highPrice,
        lowPrice: stockPrices.lowPrice,
        volume: stockPrices.volume,
      })
      .from(stockPrices)
      .where(eq(stockPrices.organizationId, marketSnapshot.organizationId))
      .orderBy(desc(stockPrices.timestamp))
      .limit(limit);

    // If we don't have enough recent data, also check older data
    if (history.length < 10) {
      const allHistory = await db
        .select({
          id: stockPrices.id,
          price: stockPrices.price,
          change: stockPrices.change,
          changePercent: stockPrices.changePercent,
          timestamp: stockPrices.timestamp,
          openPrice: stockPrices.openPrice,
          highPrice: stockPrices.highPrice,
          lowPrice: stockPrices.lowPrice,
          volume: stockPrices.volume,
        })
        .from(stockPrices)
        .where(eq(stockPrices.organizationId, marketSnapshot.organizationId))
        .orderBy(desc(stockPrices.timestamp))
        .limit(limit);

      return successResponse({
        ticker,
        organizationId: marketSnapshot.organizationId,
        history: allHistory.reverse().map((point) => ({
          id: point.id,
          price: point.price,
          change: point.change,
          changePercent: point.changePercent,
          timestamp: point.timestamp.toISOString(),
          openPrice: point.openPrice,
          highPrice: point.highPrice,
          lowPrice: point.lowPrice,
          volume: point.volume,
        })),
      });
    }

    return successResponse({
      ticker,
      organizationId: marketSnapshot.organizationId,
      history: history.reverse().map((point) => ({
        id: point.id,
        price: point.price,
        change: point.change,
        changePercent: point.changePercent,
        timestamp: point.timestamp.toISOString(),
        openPrice: point.openPrice,
        highPrice: point.highPrice,
        lowPrice: point.lowPrice,
        volume: point.volume,
      })),
    });
  }
);
