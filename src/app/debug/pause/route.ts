/**
 * Debug: Pause Game
 * GET /debug/pause - Pause the game (browser-accessible)
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export async function GET(_request: NextRequest) {
  let game = await prisma.game.findFirst({
    where: { isContinuous: true },
  });

  if (!game) {
    return NextResponse.json({
      success: false,
      message: '❌ No game found. Create one first by visiting /debug/start',
    }, { status: 404 });
  }

  if (game.isRunning) {
    game = await prisma.game.update({
      where: { id: game.id },
      data: {
        isRunning: false,
        pausedAt: new Date(),
      },
    });
    logger.info('Game paused', { gameId: game.id }, 'Debug');
  } else {
    logger.info('Game already paused', { gameId: game.id }, 'Debug');
  }

  return NextResponse.json({
    success: true,
    message: '⏸️  Game paused successfully!',
    game: {
      id: game.id,
      isRunning: game.isRunning,
      currentDay: game.currentDay,
      currentDate: game.currentDate.toISOString(),
      lastTickAt: game.lastTickAt?.toISOString(),
      pausedAt: game.pausedAt?.toISOString(),
      activeQuestions: game.activeQuestions,
    },
  });
}

