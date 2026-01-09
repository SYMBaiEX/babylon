/**
 * World Facts Update Cron Job API
 *
 * @route POST /api/cron/world-facts - Update world facts
 * @access Cron (CRON_SECRET required)
 *
 * @description
 * Scheduled cron job that:
 * 1. Fetches RSS feeds from external news sources
 * 2. Generates parody headlines from real news
 * 3. Cleans up old headlines
 * 4. Generates new world facts from game activity (events, markets, questions, actors)
 *
 * Runs twice daily (6 AM and 6 PM UTC) to keep the world context fresh and prevent
 * content repetition across the game. Max execution time: 300s.
 *
 * @openapi
 * /api/cron/world-facts:
 *   post:
 *     tags:
 *       - Cron
 *     summary: Update world facts
 *     description: Fetches RSS feeds and generates parody headlines (requires CRON_SECRET)
 *     security:
 *       - CronSecret: []
 *     responses:
 *       200:
 *         description: World facts updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 headlinesGenerated:
 *                   type: integer
 *                 headlinesCleaned:
 *                   type: integer
 *       401:
 *         description: Invalid or missing CRON_SECRET
 *
 * @example
 * ```typescript
 * await fetch('/api/cron/world-facts', {
 *   method: 'POST',
 *   headers: { 'Authorization': `Bearer ${CRON_SECRET}` }
 * });
 * ```
 *
 * @see {@link /lib/services/rss-feed-service} RSS feed service
 * @see {@link /lib/services/parody-headline-generator} Parody headline generator
 */

import {
  requireCronAuth,
  successResponse,
  verifyCronAuth,
  withErrorHandling,
} from '@babylon/api';
import {
  createParodyHeadlineGenerator,
  rssFeedService,
  worldFactsGenerator,
} from '@babylon/engine';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// Vercel function configuration
export const maxDuration = 300; // 5 minutes max

export const POST = withErrorHandling(async (request: NextRequest) => {
  // Security: Verify cron authorization (fail-closed in production)
  requireCronAuth(request, { jobName: 'WorldFactsCron' });

  const startTime = Date.now();
  logger.info('🌍 World facts update started', undefined, 'Cron');

  // Step 1: Fetch all RSS feeds
  logger.info('Fetching RSS feeds...', undefined, 'Cron');
  const feedResult = await rssFeedService.fetchAllFeeds();
  logger.info(
    `RSS feeds fetched: ${feedResult.fetched} sources, ${feedResult.stored} new headlines, ${feedResult.errors} errors`,
    feedResult,
    'Cron'
  );

  // Step 2: Transform untransformed headlines into parodies
  logger.info('Generating parody headlines...', undefined, 'Cron');
  const untransformedHeadlines =
    await rssFeedService.getUntransformedHeadlines(20); // Process 20 at a time

  const generator = createParodyHeadlineGenerator();
  const parodies = await generator.processHeadlines(untransformedHeadlines);
  logger.info(
    `Generated ${parodies.length} parody headlines`,
    { count: parodies.length },
    'Cron'
  );

  // Step 3: Clean up old headlines (older than 7 days)
  logger.info('Cleaning up old headlines...', undefined, 'Cron');
  const cleaned = await rssFeedService.cleanupOldHeadlines();
  logger.info(
    `Cleaned up ${cleaned} old headlines`,
    { count: cleaned },
    'Cron'
  );

  // Step 4: Generate new world facts from game activity
  // This creates fresh context based on events, markets, questions, and actor activity
  logger.info('Generating new world facts from game activity...', undefined, 'Cron');
  const factsResult = await worldFactsGenerator.generateNewWorldFacts();
  logger.info(
    `Generated ${factsResult.generated} new world facts, archived ${factsResult.archived}`,
    factsResult,
    'Cron'
  );

  const duration = Date.now() - startTime;
  logger.info(
    '✅ World facts update completed',
    {
      duration: `${duration}ms`,
      feedsFetched: feedResult.fetched,
      newHeadlines: feedResult.stored,
      parodiesGenerated: parodies.length,
      headlinesCleaned: cleaned,
      worldFactsGenerated: factsResult.generated,
      worldFactsArchived: factsResult.archived,
    },
    'Cron'
  );

  return successResponse({
    success: true,
    duration,
    stats: {
      feedsFetched: feedResult.fetched,
      newHeadlines: feedResult.stored,
      parodiesGenerated: parodies.length,
      headlinesCleaned: cleaned,
      worldFactsGenerated: factsResult.generated,
      worldFactsArchived: factsResult.archived,
      worldFactsSources: factsResult.sources,
    },
  });
});

// GET endpoint for Vercel Cron (some cron services use GET)
export const GET = withErrorHandling(async (request: NextRequest) => {
  // Security: Verify cron authorization (allows Vercel Cron user-agent)
  if (
    !verifyCronAuth(request, {
      jobName: 'WorldFactsCron',
      allowVercelCronUserAgent: true,
    })
  ) {
    logger.warn('Unauthorized GET request to cron endpoint', undefined, 'Cron');
    return NextResponse.json(
      {
        error:
          'Use POST for cron execution. This endpoint is triggered by Vercel Cron',
      },
      { status: 401 }
    );
  }

  logger.info('GET request forwarded to POST handler', undefined, 'Cron');

  // Forward to POST handler
  return POST(request);
});
