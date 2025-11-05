#!/usr/bin/env bun
/**
 * Game Control CLI
 * 
 * Simple script to start/pause the game
 * 
 * Usage:
 *   bun run game:start   - Start the game
 *   bun run game:pause   - Pause the game
 *   bun run game:status  - Check game status
 */

import { logger } from '@/lib/logger';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

async function controlGame(action: 'start' | 'pause') {
  try {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (ADMIN_TOKEN) {
      headers['x-admin-token'] = ADMIN_TOKEN;
    }

    const response = await fetch(`${API_URL}/api/game/control`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action }),
    });

    const data = await response.json();

    if (!response.ok) {
      logger.error(`Failed to ${action} game:`, data.error || data.message, 'Game Control');
      process.exit(1);
    }

    logger.info(`✅ Game ${action === 'start' ? 'started' : 'paused'} successfully!`, {
      isRunning: data.game.isRunning,
      currentDay: data.game.currentDay,
      lastTickAt: data.game.lastTickAt,
    }, 'Game Control');
  } catch (error) {
    logger.error(`Error ${action}ing game:`, error, 'Game Control');
    process.exit(1);
  }
}

async function getStatus() {
  try {
    const response = await fetch(`${API_URL}/api/game/control`);
    const data = await response.json();

    if (!response.ok) {
      logger.error('Failed to get game status:', data.error || data.message, 'Game Control');
      process.exit(1);
    }

    if (!data.game) {
      logger.warn('⚠️  No game found. Use "bun run game:start" to create and start one.', undefined, 'Game Control');
      return;
    }

    const game = data.game;
    logger.info('📊 Game Status:', undefined, 'Game Control');
    logger.info(`   Running: ${game.isRunning ? '✅ YES' : '⏸️  PAUSED'}`, undefined, 'Game Control');
    logger.info(`   Current Day: ${game.currentDay}`, undefined, 'Game Control');
    logger.info(`   Current Date: ${new Date(game.currentDate).toLocaleString()}`, undefined, 'Game Control');
    logger.info(`   Active Questions: ${game.activeQuestions}`, undefined, 'Game Control');
    logger.info(`   Last Tick: ${game.lastTickAt ? new Date(game.lastTickAt).toLocaleString() : 'Never'}`, undefined, 'Game Control');
    logger.info(`   Started At: ${game.startedAt ? new Date(game.startedAt).toLocaleString() : 'N/A'}`, undefined, 'Game Control');
    
    if (game.pausedAt) {
      logger.info(`   Paused At: ${new Date(game.pausedAt).toLocaleString()}`, undefined, 'Game Control');
    }
  } catch (error) {
    logger.error('Error getting game status:', error, 'Game Control');
    process.exit(1);
  }
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

main().catch((error) => {
  logger.error('Script failed:', error, 'Game Control');
  process.exit(1);
});

