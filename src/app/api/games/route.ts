/**
 * Games API Route
 * 
 * GET /api/games - Get all games
 */

import { gameService } from '@/lib/game-service';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const games = await gameService.getAllGames();

    return NextResponse.json({
      success: true,
      games,
      count: games.length,
    });
  } catch (error) {
    logger.error('API Error:', error, 'GET /api/games');
    return NextResponse.json(
      { success: false, error: 'Failed to load games' },
      { status: 500 }
    );
  }
}

