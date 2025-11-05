/**
 * Vercel Cron Job: Game Tick
 * 
 * This endpoint is called by Vercel Cron to generate game content.
 * Replaces the continuous daemon with scheduled serverless invocations.
 * 
 * Configuration in vercel.json:
 * - Runs every minute
 * - Generates posts, events, updates markets
 * - Max execution time: 60s
 * 
 * Security: Uses Vercel Cron secret for authentication
 */

import type { NextRequest } from 'next/server'
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler'
import { AuthorizationError } from '@/lib/errors'
import { prisma } from '@/lib/database-service'
import { logger } from '@/lib/logger'

// Verify this is a legitimate Vercel Cron request
function verifyVercelCronRequest(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  // In development, allow without secret for easy testing
  if (process.env.NODE_ENV === 'development') {
    if (!cronSecret) {
      logger.info('Development mode - allowing cron without CRON_SECRET', undefined, 'Cron');
      return true;
    }
    // If secret is set in dev, check it (but also allow 'development' keyword)
    if (authHeader === 'Bearer development' || authHeader === `Bearer ${cronSecret}`) {
      return true;
    }
  }
  
  // If CRON_SECRET is not configured, allow but warn (fail-open for missing config)
  if (!cronSecret) {
    logger.warn(
      '⚠️  CRON_SECRET not configured! Cron endpoint is accessible without authentication. ' +
      'Set CRON_SECRET environment variable in production for security.',
      { 
        environment: process.env.NODE_ENV,
        hasAuthHeader: !!authHeader 
      },
      'Cron'
    );
    return true; // Allow execution but warn
  }
  
  // If CRON_SECRET is set, verify it matches (fail-closed for wrong credentials)
  if (authHeader !== `Bearer ${cronSecret}`) {
    logger.error(
      'CRON authentication failed - invalid secret provided',
      { hasAuthHeader: !!authHeader },
      'Cron'
    );
    return false;
  }
  
  return true;
}

export const POST = withErrorHandling(async (request: NextRequest) => {
  // 1. Verify this is a legitimate cron request
  if (!verifyVercelCronRequest(request)) {
    logger.warn('Unauthorized cron request attempt', undefined, 'Cron');
    throw new AuthorizationError('Unauthorized cron request', 'cron', 'execute');
  }

  const startTime = Date.now();
  logger.info('🎮 Game tick started', undefined, 'Cron');

  // 2. Check if we should skip (maintenance mode, etc.)
  const gameState = await prisma.game.findFirst({
    where: { isContinuous: true },
  });

  if (!gameState || !gameState.isRunning) {
    logger.info('Game is paused - skipping tick', undefined, 'Cron');
    return successResponse({
      success: true,
      skipped: true,
      reason: 'Game paused',
    });
  }

  // 3. Import game tick logic dynamically (avoid bundling heavy dependencies)
  const { executeGameTick } = await import('@/lib/serverless-game-tick');

  // 4. Execute the tick (generates posts, events, updates markets)
  const result = await executeGameTick();

  const duration = Date.now() - startTime;
  logger.info('✅ Game tick completed', {
    duration: `${duration}ms`,
    posts: result.postsCreated,
    events: result.eventsCreated,
    marketsUpdated: result.marketsUpdated,
  }, 'Cron');

  return successResponse({
    success: true,
    duration,
    result,
  });
});

// GET endpoint for Vercel Cron (Vercel Cron uses GET requests by default)
export const GET = withErrorHandling(async (request: NextRequest) => {
  // Allow Vercel Cron requests (identified by user-agent header)
  const userAgent = request.headers.get('user-agent');
  const isVercelCron = userAgent?.includes('vercel-cron');
  
  // Also allow in development or with admin token for manual testing
  const isDev = process.env.NODE_ENV === 'development';
  const adminToken = request.headers.get('x-admin-token');
  const hasAdminSecret = !!process.env.ADMIN_TOKEN;
  const isAdmin = hasAdminSecret && adminToken === process.env.ADMIN_TOKEN;

  if (!isVercelCron && !isDev && !isAdmin) {
    throw new AuthorizationError('Use POST for cron execution. This endpoint is triggered by Vercel Cron', 'cron', 'execute');
  }

  // Forward to POST handler
  return POST(request);
});

