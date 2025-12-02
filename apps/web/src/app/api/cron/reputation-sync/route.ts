/**
 * Reputation Sync Cron Job API
 *
 * @route POST /api/cron/reputation-sync - Sync reputation to ERC-8004
 * @access Cron (CRON_SECRET required)
 *
 * @description
 * Scheduled cron job that syncs reputation scores to ERC-8004 via Agent0 SDK.
 * Publishes reputation as feedback signals on-chain and updates local metrics.
 * Runs daily with more frequent updates for new accounts. Max execution time: 300s.
 *
 * @openapi
 * /api/cron/reputation-sync:
 *   post:
 *     tags:
 *       - Cron
 *     summary: Sync reputation to ERC-8004
 *     description: Syncs reputation scores to blockchain via Agent0 SDK (requires CRON_SECRET)
 *     security:
 *       - CronSecret: []
 *     responses:
 *       200:
 *         description: Reputation sync completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 synced:
 *                   type: integer
 *                 failed:
 *                   type: integer
 *                 duration:
 *                   type: number
 *       401:
 *         description: Invalid or missing CRON_SECRET
 *
 * @example
 * ```typescript
 * await fetch('/api/cron/reputation-sync', {
 *   method: 'POST',
 *   headers: { 'Authorization': `Bearer ${CRON_SECRET}` }
 * });
 * ```
 *
 * @see {@link /lib/reputation/erc8004-reputation-sync} ERC-8004 sync service
 */

import type { NextRequest } from 'next/server';
import { AuthorizationError } from '@babylon/api';
import { successResponse, withErrorHandling } from '@babylon/api';
import { logger } from '@babylon/shared';
import {
  batchSyncReputationsToERC8004,
  syncAllReputationsToERC8004,
} from '@babylon/agents';
import { relayCronToStaging } from '@babylon/api';

// Vercel function configuration
export const maxDuration = 300; // 5 minutes max

// Verify this is a legitimate Vercel Cron request
function verifyVercelCronRequest(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // In development, allow without secret for easy testing
  if (process.env.NODE_ENV === 'development') {
    if (!cronSecret) {
      logger.info(
        'Development mode - allowing cron without CRON_SECRET',
        undefined,
        'ReputationSyncCron'
      );
      return true;
    }
    if (
      authHeader === 'Bearer development' ||
      authHeader === `Bearer ${cronSecret}`
    ) {
      return true;
    }
  }

  // If CRON_SECRET is not configured, allow but warn
  if (!cronSecret) {
    logger.warn(
      '⚠️  CRON_SECRET not configured! Cron endpoint is accessible without authentication.',
      { environment: process.env.NODE_ENV },
      'ReputationSyncCron'
    );
    return true;
  }

  // Verify authorization header matches secret
  if (authHeader !== `Bearer ${cronSecret}`) {
    return false;
  }

  return true;
}

export const POST = withErrorHandling(async (request: NextRequest) => {
  // Verify cron request
  if (!verifyVercelCronRequest(request)) {
    throw new AuthorizationError(
      'Invalid cron secret',
      'cron',
      'reputation-sync'
    );
  }

  const startTime = Date.now();
  logger.info(
    '🔄 Starting reputation sync cron job',
    undefined,
    'ReputationSyncCron'
  );

  await relayCronToStaging(request, 'reputation-sync');

  try {
    // Parse query parameters for batch processing
    const { searchParams } = new URL(request.url);
    const batchMode = searchParams.get('batch') === 'true';
    const limit = Number.parseInt(searchParams.get('limit') || '100', 10);
    const offset = Number.parseInt(searchParams.get('offset') || '0', 10);
    const forceRecalculate = searchParams.get('force') === 'true';

    let result;

    if (batchMode) {
      // Process a specific batch (useful for large syncs)
      logger.info(
        `Processing batch: limit=${limit}, offset=${offset}`,
        undefined,
        'ReputationSyncCron'
      );
      result = await batchSyncReputationsToERC8004({
        limit,
        offset,
        forceRecalculate,
        prioritizeNew: offset === 0,
      });
    } else {
      // Full sync (processes all users)
      logger.info(
        'Processing full reputation sync',
        undefined,
        'ReputationSyncCron'
      );
      result = await syncAllReputationsToERC8004();
    }

    const duration = Date.now() - startTime;

    logger.info(
      '✅ Reputation sync completed',
      {
        duration,
        total: result.total,
        synced: result.synced,
        failed: result.failed,
        skipped: result.skipped,
      },
      'ReputationSyncCron'
    );

    return successResponse({
      success: true,
      duration,
      result: {
        total: result.total,
        synced: result.synced,
        failed: result.failed,
        skipped: result.skipped,
      },
      batchMode,
      limit: batchMode ? limit : undefined,
      offset: batchMode ? offset : undefined,
    });
  } catch (error) {
    logger.error(
      '❌ Reputation sync cron failed',
      { error },
      'ReputationSyncCron'
    );
    throw error;
  }
});
