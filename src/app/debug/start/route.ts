/**
 * Debug: Start Game
 * GET /debug/start - Start the game (browser-accessible)
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { generateSnowflakeId } from '@/lib/snowflake';

export async function GET(_request: NextRequest) {
  let game = await prisma.game.findFirst({
    where: { isContinuous: true },
  });

  if (!game) {
    game = await prisma.game.create({
      data: {
        id: await generateSnowflakeId(),
        isContinuous: true,
        isRunning: true,
        currentDay: 1,
        startedAt: new Date(),
        updatedAt: new Date(),
      },
    });
    logger.info('Game created and started', { gameId: game.id }, 'Debug');
  } else if (!game.isRunning) {
    game = await prisma.game.update({
      where: { id: game.id },
      data: {
        isRunning: true,
        startedAt: game.startedAt || new Date(),
        pausedAt: null,
      },
    });
    logger.info('Game started', { gameId: game.id }, 'Debug');
  } else {
    logger.info('Game already running', { gameId: game.id }, 'Debug');
  }

  return NextResponse.json({
    success: true,
    message: '✅ Game started successfully!',
    game: {
      id: game.id,
      isRunning: game.isRunning,
      currentDay: game.currentDay,
      currentDate: game.currentDate.toISOString(),
      lastTickAt: game.lastTickAt?.toISOString(),
      activeQuestions: game.activeQuestions,
    },
  });
}

