#!/usr/bin/env bun
/**
 * Game Control (Direct Database)
 * 
 * Direct database script to start/pause the game (works without running server)
 * 
 * Usage:
 *   bun run scripts/game-control-db.ts start   - Start the game
 *   bun run scripts/game-control-db.ts pause   - Pause the game
 *   bun run scripts/game-control-db.ts status  - Check game status
 */

import { logger } from '@/lib/logger';
import { db, games, eq, closeDatabase } from '@/db';
import { generateSnowflakeId } from '@/lib/snowflake';

async function controlGame(action: 'start' | 'pause') {
  // Get the continuous game
  const result = await db.select()
    .from(games)
    .where(eq(games.isContinuous, true))
    .limit(1);

  let game = result[0];

  if (!game) {
    // Create the game if it doesn't exist
    const gameId = await generateSnowflakeId();
    const created = await db.insert(games)
      .values({
        id: gameId,
        isContinuous: true,
        isRunning: action === 'start',
        currentDay: 1,
        startedAt: action === 'start' ? new Date() : null,
        updatedAt: new Date(),
      })
      .returning();
    game = created[0]!;
    logger.info(`✅ Game created and ${action === 'start' ? 'started' : 'paused'}!`, { gameId: game.id }, 'Game Control');
  } else {
    // Update the existing game
    const isRunning = action === 'start';
    const updateData: {
      isRunning: boolean;
      startedAt?: Date | null;
      pausedAt?: Date | null;
      updatedAt: Date;
    } = {
      isRunning,
      updatedAt: new Date(),
    };

    if (action === 'start') {
      updateData.startedAt = game.startedAt || new Date();
      updateData.pausedAt = null;
    } else {
      updateData.pausedAt = new Date();
    }

    const updated = await db.update(games)
      .set(updateData)
      .where(eq(games.id, game.id))
      .returning();
    game = updated[0]!;

    logger.info(`✅ Game ${action === 'start' ? 'started' : 'paused'}!`, { 
      gameId: game.id,
      isRunning: game.isRunning,
      currentDay: game.currentDay 
    }, 'Game Control');
  }

  logger.info('Game Details:', {
    id: game.id,
    isRunning: game.isRunning,
    currentDay: game.currentDay,
    lastTickAt: game.lastTickAt?.toISOString() || 'Never',
  }, 'Game Control');

  await closeDatabase();
}

async function getStatus() {
  const result = await db.select()
    .from(games)
    .where(eq(games.isContinuous, true))
    .limit(1);

  const game = result[0];

  if (!game) {
    logger.warn('⚠️  No game found. Use "bun run game:start" to create and start one.', undefined, 'Game Control');
    await closeDatabase();
    return;
  }

  logger.info('', undefined, 'Game Control');
  logger.info('═'.repeat(60), undefined, 'Game Control');
  logger.info('📊 Game Status', undefined, 'Game Control');
  logger.info('═'.repeat(60), undefined, 'Game Control');
  logger.info(`   Status: ${game.isRunning ? '✅ RUNNING' : '⏸️  PAUSED'}`, undefined, 'Game Control');
  logger.info(`   Current Day: ${game.currentDay}`, undefined, 'Game Control');
  logger.info(`   Current Date: ${game.currentDate.toLocaleString()}`, undefined, 'Game Control');
  logger.info(`   Active Questions: ${game.activeQuestions}`, undefined, 'Game Control');
  logger.info(`   Speed: ${game.speed}ms between ticks`, undefined, 'Game Control');
  logger.info(`   Last Tick: ${game.lastTickAt ? game.lastTickAt.toLocaleString() : 'Never'}`, undefined, 'Game Control');
  
  if (game.startedAt) {
    logger.info(`   Started At: ${game.startedAt.toLocaleString()}`, undefined, 'Game Control');
  }
  
  if (game.pausedAt) {
    logger.info(`   Paused At: ${game.pausedAt.toLocaleString()}`, undefined, 'Game Control');
  }
  
  logger.info('═'.repeat(60), undefined, 'Game Control');
  logger.info('', undefined, 'Game Control');

  if (!game.isRunning) {
    logger.info('💡 To start the game, run: bun run game:start', undefined, 'Game Control');
  } else {
    logger.info('💡 To pause the game, run: bun run game:pause', undefined, 'Game Control');
  }
  
  await closeDatabase();
}

async function main() {
  const action = process.argv[2];

  if (!action) {
    logger.info('Usage:', undefined, 'Game Control');
    logger.info('  bun run game:start   - Start the game', undefined, 'Game Control');
    logger.info('  bun run game:pause   - Pause the game', undefined, 'Game Control');
    logger.info('  bun run game:status  - Check game status', undefined, 'Game Control');
    process.exit(1);
  }

  switch (action) {
    case 'start':
      await controlGame('start');
      break;
    case 'pause':
      await controlGame('pause');
      break;
    case 'status':
      await getStatus();
      break;
    default:
      logger.error(`Unknown action: ${action}`, undefined, 'Game Control');
      logger.info('Valid actions: start, pause, status', undefined, 'Game Control');
      process.exit(1);
  }
}

main();
