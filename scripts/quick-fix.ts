#!/usr/bin/env bun
/**
 * Quick Fix - Initialize game and generate first batch of content
 */

import { prisma } from '../src/lib/prisma';
import { logger } from '../src/lib/logger';

async function main() {
  logger.info('🔧 Quick Fix - Initializing game content', undefined, 'QuickFix');
  
  // 1. Check if game exists
  let game = await prisma.game.findFirst({ where: { isContinuous: true } });
  
  if (!game) {
    logger.info('Creating game state...', undefined, 'QuickFix');
    game = await prisma.game.create({
      data: {
        isContinuous: true,
        isRunning: true,
        currentDate: new Date(),
        currentDay: 1,
        speed: 60000,
      },
    });
    logger.info('✅ Game state created', undefined, 'QuickFix');
  } else if (!game.isRunning) {
    logger.info('Game is paused, setting to running...', undefined, 'QuickFix');
    game = await prisma.game.update({
      where: { id: game.id },
      data: { isRunning: true },
    });
    logger.info('✅ Game set to running', undefined, 'QuickFix');
  } else {
    logger.info('✅ Game state exists and is running', undefined, 'QuickFix');
  }
  
  // 2. Check actors
  const actorCount = await prisma.actor.count();
  logger.info(`Actors: ${actorCount}`, undefined, 'QuickFix');
  
  if (actorCount === 0) {
    logger.error('❌ No actors! Run: bun run db:seed', undefined, 'QuickFix');
    process.exit(1);
  }
  
  // 3. Check questions
  const questionCount = await prisma.question.count();
  logger.info(`Questions: ${questionCount}`, undefined, 'QuickFix');
  
  if (questionCount === 0) {
    logger.info('No questions yet - daemon will create them on first tick', undefined, 'QuickFix');
  }
  
  // 4. Trigger content generation via cron endpoint
  logger.info('\n🎮 Triggering content generation...', undefined, 'QuickFix');
  
  try {
    const response = await fetch('http://localhost:3000/api/cron/game-tick', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer development',
      },
    });
    
    const result = await response.json();
    
    if (result.success) {
      logger.info('✅ Content generated!', result.result, 'QuickFix');
      
      // Verify posts were created
      const postCount = await prisma.post.count();
      logger.info(`\n📊 Posts in database: ${postCount}`, undefined, 'QuickFix');
      
      if (postCount > 0) {
        logger.info('🎉 SUCCESS! Feed should now have content.', undefined, 'QuickFix');
        logger.info('\nRefresh your browser at http://localhost:3000/feed', undefined, 'QuickFix');
      } else {
        logger.warn('⚠️  Tick executed but no posts created', undefined, 'QuickFix');
        logger.info('Check [GAME] logs for LLM generation errors', undefined, 'QuickFix');
      }
    } else {
      logger.error('❌ Content generation failed:', result, 'QuickFix');
    }
    
  } catch (error: any) {
    if (error.code === 'ECONNREFUSED') {
      logger.error('❌ Cannot connect to http://localhost:3000', undefined, 'QuickFix');
      logger.error('Start web server first: bun run dev', undefined, 'QuickFix');
    } else {
      logger.error('❌ Failed to trigger content:', error, 'QuickFix');
    }
    process.exit(1);
  }
  
  await prisma.$disconnect();
}

main().catch((error) => {
  logger.error('Quick fix failed:', error, 'QuickFix');
  process.exit(1);
});

