/**
 * NPC Tick Cron Job API
 *
 * @route POST /api/cron/npc-tick - Execute NPC autonomous tick
 * @access Cron (CRON_SECRET required)
 *
 * @description
 * Dedicated cron job for NPC agents (non-player characters).
 * Runs separately from user agent-tick to:
 * 1. Provide NPCs with game context (arc plans, phases, insider status)
 * 2. Use anti-slop quality rules for authentic social media voice
 * 3. Rotate through NPCs to ensure diverse feed coverage
 *
 * This runs at :30 of each minute, after game-tick (:00) updates world state.
 */

import {
  acquireAgentLock,
  agentRuntimeManager,
  autonomousCoordinator,
  releaseAgentLock,
} from '@babylon/agents';
import {
  getCacheOrFetch,
  recordCronExecution,
  relayCronToStaging,
  verifyCronAuth,
} from '@babylon/api';
import type { Game } from '@babylon/db';
import { db } from '@babylon/db';
import { StaticDataRegistry } from '@babylon/engine';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// Vercel function configuration
export const maxDuration = 300; // 5 minutes max for NPC tick
export const dynamic = 'force-dynamic';

/**
 * Number of NPCs to process per tick (rotates through all).
 * Configurable via NPC_TICK_BATCH_SIZE environment variable.
 */
const NPCS_PER_TICK = Number(process.env.NPC_TICK_BATCH_SIZE) || 20;

/**
 * Maximum consecutive errors before aborting the tick (circuit breaker).
 * Prevents cascading failures if there's a systemic issue.
 */
const MAX_CONSECUTIVE_ERRORS = Number(process.env.NPC_TICK_MAX_ERRORS) || 5;

/**
 * GET /api/cron/npc-tick
 * Alias for POST endpoint to support GET requests from cron services.
 */
export async function GET(req: NextRequest) {
  return POST(req);
}

/**
 * POST /api/cron/npc-tick
 *
 * Executes NPC autonomous tick with game awareness.
 * Rotates through NPCs to ensure all get processed over time.
 */
export async function POST(_req: NextRequest) {
  // Verify cron authorization
  if (!verifyCronAuth(_req, { jobName: 'NPCTick' })) {
    logger.warn('Unauthorized npc-tick request attempt', undefined, 'NPCTick');
    return NextResponse.json(
      { error: 'Unauthorized cron request' },
      { status: 401 }
    );
  }

  const startTime = Date.now();
  const processId = `npc-tick-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  logger.info('NPC tick started', { processId }, 'NPCTick');

  // Relay to staging if configured
  const relayResult = await relayCronToStaging(_req, 'npc-tick');
  if (relayResult.forwarded) {
    logger.info(
      'Cron execution relayed to staging - skipping local execution',
      { status: relayResult.status, error: relayResult.error },
      'NPCTick'
    );
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: 'Relayed to staging environment',
      relayStatus: relayResult.status,
      processed: 0,
    });
  }

  // Check GAME_START environment variable
  const gameStartEnv = process.env.GAME_START?.toLowerCase();
  if (gameStartEnv === 'false' || gameStartEnv === '0') {
    logger.info(
      'Game disabled via GAME_START env var - skipping NPC tick',
      { GAME_START: process.env.GAME_START },
      'NPCTick'
    );
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: 'Game disabled via GAME_START environment variable',
      processed: 0,
    });
  }

  // Check Game status from database (cached for 60s to reduce DB load)
  const gameState = await getCacheOrFetch<Game | null>(
    'continuous-game',
    async () =>
      db.game.findFirst({
        where: { isContinuous: true },
      }),
    { namespace: 'npc-tick', ttl: 60 }
  );

  if (!gameState) {
    logger.info('NPC tick skipped (No continuous game found)', {}, 'NPCTick');
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: 'No continuous game found',
      duration: Date.now() - startTime,
      processed: 0,
    });
  }

  if (!gameState.isRunning) {
    logger.info(
      'NPC tick paused (Game is not running)',
      { gameId: gameState.id },
      'NPCTick'
    );
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: 'Game is paused',
      gameId: gameState.id,
      duration: Date.now() - startTime,
      processed: 0,
    });
  }

  // Get all NPCs from the StaticDataRegistry (excludes test actors)
  const allNpcs = StaticDataRegistry.getAllActors().filter(
    (a) => !a.name.toLowerCase().includes('test')
  );

  if (allNpcs.length === 0) {
    logger.warn('No NPCs found in registry', {}, 'NPCTick');
    return NextResponse.json({
      success: true,
      processed: 0,
      duration: Date.now() - startTime,
      warning: 'No NPCs found in registry',
    });
  }

  // Rotate through NPCs using modulo-based iteration for robust wrap-around
  const tickNumber = Math.floor(Date.now() / 60000);
  const startIndex = (tickNumber * NPCS_PER_TICK) % allNpcs.length;
  const npcsThisTick: typeof allNpcs = [];

  // Use modulo to handle wrap-around correctly regardless of array size
  const count = Math.min(NPCS_PER_TICK, allNpcs.length);
  for (let i = 0; i < count; i++) {
    const npc = allNpcs[(startIndex + i) % allNpcs.length];
    if (npc) {
      npcsThisTick.push(npc);
    }
  }

  logger.info(
    `NPC tick processing ${npcsThisTick.length} NPCs`,
    {
      startIndex,
      totalNpcs: allNpcs.length,
      npcsThisTick: npcsThisTick.map((n) => n.name),
    },
    'NPCTick'
  );

  const results: Array<{
    npcId: string;
    name: string;
    status: string;
    error?: string;
    duration: number;
    actions?: number;
  }> = [];
  let totalActionsExecuted = 0;
  let errors = 0;
  let consecutiveErrors = 0;
  let skippedDueToLock = 0;
  let abortedDueToCircuitBreaker = false;

  for (const npc of npcsThisTick) {
    // Circuit breaker: abort if too many consecutive errors
    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      abortedDueToCircuitBreaker = true;
      logger.error(
        `Circuit breaker triggered after ${consecutiveErrors} consecutive errors`,
        { processId, npcsRemaining: npcsThisTick.length - results.length },
        'NPCTick'
      );
      break;
    }
    const npcStartTime = Date.now();

    // Try to acquire lock for this NPC
    const lockAcquired = await acquireAgentLock(npc.id, processId);
    if (!lockAcquired) {
      skippedDueToLock++;
      logger.info(
        `Skipping NPC ${npc.name} - still running from previous tick`,
        { npcId: npc.id },
        'NPCTick'
      );
      results.push({
        npcId: npc.id,
        name: npc.name,
        status: 'skipped',
        error: 'locked',
        duration: Date.now() - npcStartTime,
      });
      continue;
    }

    try {
      // Get ElizaOS runtime for this NPC
      // NPCs should be registered by NPCBootstrapService at startup
      const runtime = await agentRuntimeManager.getRuntime(npc.id);

      // Execute autonomous tick with isNpc=true
      // This triggers NPC game context injection via the MultiStepExecutor
      const tickResult = await autonomousCoordinator.executeAutonomousTick(
        npc.id,
        runtime,
        false, // recordTrajectories - disabled for NPCs
        true // isNpc = true (triggers NPC game context)
      );

      const actionCount =
        tickResult.actionsExecuted.trades +
        tickResult.actionsExecuted.posts +
        tickResult.actionsExecuted.comments +
        tickResult.actionsExecuted.messages +
        tickResult.actionsExecuted.groupMessages;

      totalActionsExecuted += actionCount;

      results.push({
        npcId: npc.id,
        name: npc.name,
        status: tickResult.success ? 'success' : 'completed',
        duration: Date.now() - npcStartTime,
        actions: actionCount,
      });

      // Reset consecutive error counter on success
      consecutiveErrors = 0;

      logger.info(
        `NPC ${npc.name} tick completed`,
        {
          npcId: npc.id,
          actions: actionCount,
          duration: Date.now() - npcStartTime,
        },
        'NPCTick'
      );
    } catch (error) {
      errors++;
      consecutiveErrors++;
      logger.error(
        `Error processing NPC ${npc.name}`,
        {
          npcId: npc.id,
          error: error instanceof Error ? error.message : String(error),
          consecutiveErrors,
        },
        'NPCTick'
      );

      results.push({
        npcId: npc.id,
        name: npc.name,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - npcStartTime,
      });
    } finally {
      // Always release the lock
      await releaseAgentLock(npc.id, processId);
    }
  }

  const duration = Date.now() - startTime;

  logger.info(
    `NPC tick completed in ${duration}ms`,
    {
      npcsProcessed: results.length - skippedDueToLock,
      npcsSkippedLocked: skippedDueToLock,
      totalActions: totalActionsExecuted,
      errors,
    },
    'NPCTick'
  );

  // Record metrics
  recordCronExecution('npc-tick', new Date(startTime), {
    success: !abortedDueToCircuitBreaker,
    processed: results.length - skippedDueToLock,
    totalActions: totalActionsExecuted,
    errorCount: errors,
    skippedLocked: skippedDueToLock,
    abortedDueToCircuitBreaker,
  });

  return NextResponse.json({
    success: !abortedDueToCircuitBreaker,
    processed: results.length - skippedDueToLock,
    skippedLocked: skippedDueToLock,
    duration,
    totalActions: totalActionsExecuted,
    errors,
    abortedDueToCircuitBreaker,
    results,
  });
}
