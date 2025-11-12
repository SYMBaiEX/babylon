#!/usr/bin/env bun
/**
 * Development Ticker
 * 
 * Simple script that calls the serverless game tick every minute during local development.
 * In production, Vercel Cron handles this.
 * 
 * Usage: bun run dev:ticker
 */

import { logger } from '@/lib/logger';
import { executeGameTick } from '@/lib/serverless-game-tick';

let tickCount = 0;
let isRunning = false;

async function runTick() {
  if (isRunning) {
    logger.warn('Previous tick still running, skipping...', {}, 'DevTicker');
    return;
  }

  isRunning = true;
  tickCount++;

  try {
    logger.info(`=== Tick #${tickCount} ===`, {}, 'DevTicker');
    
    const result = await executeGameTick();
    
    logger.info('Tick complete', {
      tick: tickCount,
      posts: result.postsCreated,
      events: result.eventsCreated,
      marketsUpdated: result.marketsUpdated,
      questionsResolved: result.questionsResolved,
    }, 'DevTicker');
  } catch (error) {
    logger.error('Tick failed', { error, tick: tickCount }, 'DevTicker');
  } finally {
    isRunning = false;
  }
}

async function main() {
  logger.info('🎮 Babylon Development Ticker', {}, 'DevTicker');
  logger.info('Calling serverless game tick every 60 seconds...', {}, 'DevTicker');
  logger.info('(In production, Vercel Cron handles this)', {}, 'DevTicker');
  logger.info('', {}, 'DevTicker');

  // Run first tick immediately
  await runTick();

  // Then every minute
  const interval = setInterval(runTick, 60000);

  // Handle shutdown
  process.on('SIGINT', () => {
    logger.info('Shutting down dev ticker...', {}, 'DevTicker');
    clearInterval(interval);
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    logger.info('Shutting down dev ticker...', {}, 'DevTicker');
    clearInterval(interval);
    process.exit(0);
  });

  // Keep process alive
  await new Promise(() => {});
}

main().catch((error) => {
  logger.error('Dev ticker crashed', { error }, 'DevTicker');
  process.exit(1);
});


