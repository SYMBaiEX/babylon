import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { withErrorHandling, successResponse } from '@/lib/errors/error-handler';
import { PredictionPriceHistoryService } from '@/lib/services/prediction-price-history-service';
import { IdParamSchema } from '@/lib/validation/schemas';

const QuerySchema = z.object({
  limit: z
    .preprocess((value) => (value === null ? undefined : value), z.coerce.number().min(1).max(1000))
    .optional()
    .default(200),
});

export const GET = withErrorHandling(async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) => {
  const { id: marketId } = IdParamSchema.parse(await context.params);
  const { searchParams } = new URL(request.url);
  const { limit } = QuerySchema.parse({ limit: searchParams.get('limit') });

  const history = await PredictionPriceHistoryService.getHistory(marketId, limit);

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
});
