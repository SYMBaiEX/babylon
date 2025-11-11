/**
 * Debug: Pause Game
 * GET /debug/pause - Pause the game (browser-accessible)
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export async function GET(_request: NextRequest) {
  try {
    // Check database connection first
    try {
      await prisma.$queryRawUnsafe('SELECT 1');
    } catch (dbError) {
      logger.error('Database connection failed:', dbError, 'Debug');
      return NextResponse.json(
        {
          success: false,
          error: 'Database connection failed',
          message: 'Cannot connect to database. Check DATABASE_URL environment variable.',
          details: dbError instanceof Error ? dbError.message : String(dbError),
        },
        { status: 503 }
      );
    }

    // Get the continuous game
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
      // Pause the running game
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
  } catch (error) {
    logger.error('Error pausing game:', error, 'Debug');
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to pause game',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

