/**
 * Game Tick Cron Job API
 * 
 * @route POST /api/cron/game-tick - Execute game tick
 * @access Cron (CRON_SECRET required)
 * 
 * @description
 * Scheduled cron job that generates game content including posts, events, market
 * updates, and reputation syncs. Runs every minute via Vercel Cron. Uses generation
 * locks to prevent concurrent execution. Max execution time: 300s.
 * 
 * @openapi
 * /api/cron/game-tick:
 *   post:
 *     tags:
 *       - Cron
 *     summary: Execute game tick
 *     description: Scheduled cron job for game content generation (requires CRON_SECRET)
 *     security:
 *       - CronSecret: []
 *     responses:
 *       200:
 *         description: Game tick executed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 generated:
 *                   type: object
 *                 duration:
 *                   type: number
 *       401:
 *         description: Invalid or missing CRON_SECRET
 *       409:
 *         description: Game tick already in progress
 * 
 * @example
 * ```typescript
 * await fetch('/api/cron/game-tick', {
 *   method: 'POST',
 *   headers: { 'Authorization': `Bearer ${CRON_SECRET}` }
 * });
 * ```
 * 
 * @see {@link /lib/serverless-game-tick} Game tick service
 * @see {@link /lib/services/generation-lock-service} Generation lock service
 */

import type { NextRequest } from 'next/server'
import { asSystem } from '@/lib/db/context'
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler'
import { AuthorizationError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { executeGameTick } from '@/lib/serverless-game-tick'
import { acquireGenerationLock, releaseGenerationLock } from '@/lib/services/generation-lock-service'
import { checkLookaheadStatus, generateAheadIfNeeded } from '@/lib/services/lookahead-generation-service'
import { BabylonLLMClient } from '@/generator/llm/openai-client'

// Vercel function configuration
// Note: vercel.json overrides this with 800 seconds (13.3 minutes)
export const maxDuration = 800; // 13.3 minutes max for game tick (matches vercel.json)

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
  const lockId = `tick-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  
  // Debug environment context for cron issues (sanitized - no secrets)
  const envSnapshot: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') {
      envSnapshot[key] = value.length > 60 ? `${value.slice(0, 30)}...${value.slice(-10)}` : value;
    }
  }
  logger.info('Cron environment debug snapshot', {
    env: envSnapshot,
    timestamp: new Date().toISOString(),
  }, 'Cron');
  
  // 2. Acquire generation lock to prevent concurrent execution
  if (!await acquireGenerationLock(lockId)) {
    logger.info('Tick skipped - lock held by another process', { lockId }, 'Cron');
    return successResponse({
      success: true,
      skipped: true,
      reason: 'Lock held by another process',
    });
  }

  try {
    logger.info('🎮 Game tick started', { lockId }, 'Cron');

    // 3. Check GAME_START environment variable for manual control
    const gameStartEnv = process.env.GAME_START?.toLowerCase();
    const isGameStartEnabled = gameStartEnv === 'start' || gameStartEnv === 'running' || gameStartEnv === 'true';

    if (!isGameStartEnabled) {
      logger.info('⏸️  Game paused via GAME_START environment variable', {
        GAME_START: process.env.GAME_START,
        message: 'Set GAME_START=start in Vercel to resume game ticks',
      }, 'Cron');
      return successResponse({
        success: true,
        skipped: true,
        reason: 'Game paused (GAME_START env var)',
        GAME_START: process.env.GAME_START,
      });
    }

    // 4. Check if we should skip (maintenance mode, etc.) - system operation
    const gameState = await asSystem(async (db) => {
      logger.info('Cron DB env debug', {
        hasPrismaDatabaseUrl: Boolean(process.env.PRISMA_DATABASE_URL),
        databaseUrlPrefix: process.env.DATABASE_URL?.split('@')[1]?.slice(0, 20),
        directDatabaseUrlPrefix: process.env.DIRECT_DATABASE_URL?.split('@')[1]?.slice(0, 20),
      }, 'Cron');

      const result = await db.game.findFirst({
        where: { isContinuous: true },
      });
      
      // Log the actual database values for debugging
      logger.info('Game state query result', {
        found: !!result,
        id: result?.id,
        isRunning: result?.isRunning,
        isContinuous: result?.isContinuous,
        currentDay: result?.currentDay,
        pausedAt: result?.pausedAt?.toISOString(),
        startedAt: result?.startedAt?.toISOString(),
        lastTickAt: result?.lastTickAt?.toISOString(),
        rawIsRunning: result?.isRunning,
        rawIsRunningType: typeof result?.isRunning,
      }, 'Cron');
      
      return result;
    });

    if (!gameState) {
      logger.warn('⚠️  No game found - skipping tick. Create a game via POST /api/game/control', {
        isContinuous: true,
      }, 'Cron');
      return successResponse({
        success: true,
        skipped: true,
        reason: 'No game found',
      });
    }

    // Explicit check with detailed logging
    const isRunningValue = gameState.isRunning;
    logger.info('Checking game running status', {
      gameId: gameState.id,
      isRunning: isRunningValue,
      isRunningType: typeof isRunningValue,
      isRunningBoolean: isRunningValue === true,
      isRunningFalsy: !isRunningValue,
      currentDay: gameState.currentDay,
      pausedAt: gameState.pausedAt?.toISOString(),
      lastTickAt: gameState.lastTickAt?.toISOString(),
    }, 'Cron');

    if (isRunningValue === false) {
      logger.info('⏸️  Game is paused - bypassing tick skip', {
        gameId: gameState.id,
        isRunning: gameState.isRunning,
        isRunningValue,
        currentDay: gameState.currentDay,
        pausedAt: gameState.pausedAt?.toISOString(),
        lastTickAt: gameState.lastTickAt?.toISOString(),
        message: 'To start the game, use POST /api/game/control with action: "start"',
      }, 'Cron');
      // return successResponse({
      //   success: true,
      //   skipped: true,
      //   reason: 'Game paused',
      //   gameState: {
      //     id: gameState.id,
      //     isRunning: gameState.isRunning,
      //     currentDay: gameState.currentDay,
      //     pausedAt: gameState.pausedAt?.toISOString(),
      //     lastTickAt: gameState.lastTickAt?.toISOString(),
      //   },
      // });
    }

    // 5. Check buffer status - only generate if buffer < 15 minutes
    const bufferStatus = await checkLookaheadStatus();
    
    if (!bufferStatus.needsGeneration) {
      logger.info('Buffer sufficient - skipping content generation', {
        minutesAhead: bufferStatus.minutesAhead,
        latestTimestamp: bufferStatus.latestTimestamp?.toISOString(),
      }, 'Cron');
      
      // Still execute non-content operations (NPC trading, market updates, etc.)
      // These don't need future timestamps and should run every tick
      // Skip content generation since buffer is sufficient
      const result = await executeGameTick(true); // skipContentGeneration = true
      
      const duration = Date.now() - startTime;
      logger.info('✅ Game tick completed (buffer sufficient, content skipped)', {
        duration: `${duration}ms`,
        bufferMinutes: bufferStatus.minutesAhead,
        marketsUpdated: result.marketsUpdated,
      }, 'Cron');

      return successResponse({
        success: true,
        skipped: false,
        bufferSufficient: true,
        bufferMinutes: bufferStatus.minutesAhead,
        duration,
        result,
      });
    }

    // 6. Buffer is low - generate ahead to maintain 15-minute buffer
    logger.info('Buffer low - generating ahead', {
      currentAhead: bufferStatus.minutesAhead,
      target: 15,
      latestTimestamp: bufferStatus.latestTimestamp?.toISOString(),
    }, 'Cron');

    // Use game tick LLM client (excludes Wandb - Wandb is reserved for agents only)
    const llmClient = BabylonLLMClient.forGameTick();
    const lookaheadResult = await generateAheadIfNeeded(llmClient, 15);
    
    logger.info('Lookahead generation complete', {
      generated: lookaheadResult.generated,
      windowsGenerated: lookaheadResult.windowsGenerated,
      newLatestTimestamp: lookaheadResult.newLatestTimestamp?.toISOString(),
    }, 'Cron');

    // 7. Execute normal tick operations (NPC trading, market updates, etc.)
    // Note: Content generation is handled by lookahead service, this handles operational tasks only
    // We pass true to skipContentGeneration to avoid duplicate posts for the current time window
    const result = await executeGameTick(true);

    const duration = Date.now() - startTime;
    logger.info('✅ Game tick completed', {
      duration: `${duration}ms`,
      bufferMinutes: bufferStatus.minutesAhead,
      windowsGenerated: lookaheadResult.windowsGenerated,
      posts: result.postsCreated, // Will be 0 from this call, but lookahead generated them
      events: result.eventsCreated,
      marketsUpdated: result.marketsUpdated,
    }, 'Cron');

    return successResponse({
      success: true,
      duration,
      bufferMinutes: bufferStatus.minutesAhead,
      lookahead: {
        generated: lookaheadResult.generated,
        windowsGenerated: lookaheadResult.windowsGenerated,
      },
      result,
    });
    
  } finally {
    // Always release lock, even on error
    await releaseGenerationLock(lockId);
  }
});

// GET endpoint for Vercel Cron (some cron services use GET)
export const GET = withErrorHandling(async (request: NextRequest) => {
  // Allow Vercel Cron requests (identified by user-agent or special headers)
  const userAgent = request.headers.get('user-agent')?.toLowerCase() || '';
  const isVercelCron = userAgent.includes('vercel-cron');
  const hasVercelHeader = request.headers.has('x-vercel-id');
  
  // Also allow in development or with admin token for manual testing
  const isDev = process.env.NODE_ENV === 'development';
  const adminToken = request.headers.get('x-admin-token');
  const hasAdminSecret = !!process.env.ADMIN_TOKEN;
  const isAdmin = hasAdminSecret && adminToken === process.env.ADMIN_TOKEN;

  // Allow if it's Vercel Cron, has Vercel headers, dev mode, or admin
  if (!isVercelCron && !hasVercelHeader && !isDev && !isAdmin) {
    logger.warn('Unauthorized GET request to cron endpoint', {
      userAgent,
      hasVercelHeader,
      isDev,
      hasAdminSecret
    }, 'Cron');
    throw new AuthorizationError('Use POST for cron execution. This endpoint is triggered by Vercel Cron', 'cron', 'execute');
  }

  logger.info('GET request forwarded to POST handler', { userAgent, isVercelCron, hasVercelHeader }, 'Cron');
  
  // Forward to POST handler
  return POST(request);
});
