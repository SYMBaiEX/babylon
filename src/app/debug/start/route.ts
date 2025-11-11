/**
 * Debug: Start Game
 * GET /debug/start - Start the game (browser-accessible)
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

    // Get or create the continuous game
    let game = await prisma.game.findFirst({
      where: { isContinuous: true },
    });

    if (!game) {
      // Create the game if it doesn't exist
      game = await prisma.game.create({
        data: {
          isContinuous: true,
          isRunning: true,
          currentDay: 1,
          startedAt: new Date(),
        },
      });
      logger.info('Game created and started', { gameId: game.id }, 'Debug');
    } else if (!game.isRunning) {
      // Start the paused game
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
  } catch (error) {
    logger.error('Error starting game:', error, 'Debug');
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to start game',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

