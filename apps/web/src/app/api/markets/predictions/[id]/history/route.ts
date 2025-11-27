/**
 * Prediction Market Price History API
 *
 * @route GET /api/markets/predictions/[id]/history - Get price history
 * @access Public
 *
 * @description
 * Returns price history for a prediction market including yes/no prices, share
 * counts, liquidity, and event types. Useful for charting and analytics.
 *
 * @openapi
 * /api/markets/predictions/{id}/history:
 *   get:
 *     tags:
 *       - Markets
 *     summary: Get prediction market price history
 *     description: Returns price history with yes/no prices, shares, and liquidity data
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Market/question ID
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 marketId:
 *                   type: string
 *                 history:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       yesPrice:
 *                         type: number
 *                       noPrice:
 *                         type: number
 *                       yesShares:
 *                         type: number
 *                       noShares:
 *                         type: number
 *                       liquidity:
 *                         type: number
 *                       eventType:
 *                         type: string
 *                       source:
 *                         type: string
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *
 * @example
 * ```typescript
 * const response = await fetch(`/api/markets/predictions/${marketId}/history?limit=100`);
 * const { history } = await response.json();
 * ```
 *
 * @see {@link /lib/services/prediction-price-history-service} Price history service
 */

import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { successResponse, withErrorHandling } from '@/lib/errors/error-handler';
import { PredictionPriceHistoryService } from '@/lib/services/prediction-price-history-service';
import { PredictionMarketIdSchema } from '@/lib/validation/schemas';

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
    context: { params: Promise<{ id: string }> }
  ) => {
    const { id: marketId } = PredictionMarketIdSchema.parse(
      await context.params
    );
    const { searchParams } = new URL(request.url);
    const { limit } = QuerySchema.parse({ limit: searchParams.get('limit') });

    const history = await PredictionPriceHistoryService.getHistory(
      marketId,
      limit
    );

    return successResponse({
      marketId,
      history: history.reverse().map((point) => ({
        id: point.id,
        yesPrice: point.yesPrice,
        noPrice: point.noPrice,
        yesShares: Number(point.yesShares),
        noShares: Number(point.noShares),
        liquidity: Number(point.liquidity),
        eventType: point.eventType,
        source: point.source,
        timestamp: point.createdAt.toISOString(),
      })),
    });
  }
);
