/**
 * New Markets Feed API
 *
 * @route GET /api/feed/new-markets — recently opened prediction market questions
 *
 * Returns questions opened in the last 24 h with status = 'active'.
 * Lightweight: no post aggregation. Used to inject "New Market" discovery
 * cards into the Latest feed so users can trade directly from the feed.
 */
import {
  getCacheOrFetch,
  publicRateLimit,
  successResponse,
  withErrorHandling,
} from '@babylon/api';
import { and, arcStates, db, desc, eq, gte, lt, questions } from '@babylon/db';
import type { ArcStateType } from '@babylon/shared';
import type { NextRequest } from 'next/server';

const NEW_MARKET_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface NewMarketEntry {
  questionNumber: number;
  text: string;
  resolutionDate: string;
  createdAt: string;
  arcState: ArcStateType | null;
}

export interface NewMarketsResponse {
  success: true;
  markets: NewMarketEntry[];
}

export const GET = withErrorHandling(async (request: NextRequest) => {
  const { error: rateLimitErr, rateLimitInfo } = await publicRateLimit(
    request,
    'read'
  );
  if (rateLimitErr) return rateLimitErr;

  const cacheKey = 'feed:new-markets:v1';

  const result = await getCacheOrFetch<NewMarketEntry[]>(
    cacheKey,
    async () => {
      const now = new Date();
      const cutoff = new Date(now.getTime() - NEW_MARKET_WINDOW_MS);

      const rows = await db
        .select({
          questionNumber: questions.questionNumber,
          text: questions.text,
          resolutionDate: questions.resolutionDate,
          createdAt: questions.createdAt,
          arcState: arcStates.currentState,
        })
        .from(questions)
        .leftJoin(arcStates, eq(arcStates.questionId, questions.id))
        .where(
          and(
            eq(questions.status, 'active'),
            gte(questions.createdAt, cutoff),
            // Only markets resolving within 30 days — very long-horizon ones stay on markets page
            lt(
              questions.resolutionDate,
              new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
            )
          )
        )
        .orderBy(desc(questions.createdAt))
        .limit(5);

      return rows.map((r) => ({
        questionNumber: r.questionNumber,
        text: r.text,
        resolutionDate: r.resolutionDate.toISOString(),
        createdAt: r.createdAt.toISOString(),
        arcState: (r.arcState as ArcStateType | null) ?? null,
      }));
    },
    { namespace: 'feed', ttl: 120 }
  );

  const response = successResponse({
    success: true,
    markets: result,
  } satisfies NewMarketsResponse);

  if (rateLimitInfo) {
    response.headers.set(
      'Cache-Control',
      'public, s-maxage=60, stale-while-revalidate=120'
    );
  }
  return response;
});
