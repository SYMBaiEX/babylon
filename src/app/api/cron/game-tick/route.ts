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

import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

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

export async function POST(request: NextRequest) {
  try {
    // 1. Verify this is a legitimate cron request
    if (!verifyVercelCronRequest(request)) {
      logger.warn('Unauthorized cron request attempt', undefined, 'Cron');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const startTime = Date.now();
    logger.info('🎮 Game tick started', undefined, 'Cron');

    // 2. Check if we should skip (maintenance mode, etc.)
    const gameState = await prisma.game.findFirst({
      where: { isContinuous: true },
    });

    if (!gameState || !gameState.isRunning) {
      logger.info('Game is paused - skipping tick', undefined, 'Cron');
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'Game paused',
      });
    }

    // 3. Import game tick logic dynamically (avoid bundling heavy dependencies)
    const { executeGameTick } = await import('@/lib/serverless-game-tick');
    
    // 4. Execute the tick (generates posts, events, updates markets)
    const result = await executeGameTick();

    // 5. Calculate trending tags if 30+ minutes have passed (async, don't block)
    void (async () => {
      try {
        const { calculateTrendingIfNeeded } = await import('@/lib/services/trending-calculation-service');
        const calculated = await calculateTrendingIfNeeded();
        if (calculated) {
          logger.info('Trending tags recalculated', undefined, 'Cron');
        }
      } catch (error) {
        logger.error('Failed to calculate trending tags:', error, 'Cron');
      }
    })();

    const duration = Date.now() - startTime;
    logger.info('✅ Game tick completed', {
      duration: `${duration}ms`,
      posts: result.postsCreated,
      events: result.eventsCreated,
      marketsUpdated: result.marketsUpdated,
    }, 'Cron');

    return NextResponse.json({
      success: true,
      duration,
      result,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('❌ Game tick failed', { error: errorMessage }, 'Cron');
    
    return NextResponse.json({
      success: false,
      error: errorMessage,
    }, { status: 500 });
  }
}

// GET endpoint for manual testing
export async function GET(request: NextRequest) {
  // Only allow in development or with admin token
  const isDev = process.env.NODE_ENV === 'development';
  const adminToken = request.headers.get('x-admin-token');
  const isAdmin = adminToken === process.env.ADMIN_TOKEN;

  if (!isDev && !isAdmin) {
    return NextResponse.json({
      error: 'Use POST for cron execution',
      info: 'This endpoint is triggered by Vercel Cron',
    }, { status: 405 });
  }

  // Allow manual trigger in dev
  return POST(request);
}

