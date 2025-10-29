/**
 * Stats API Route
 * 
 * GET /api/stats - Get database stats
 */

import { gameService } from '@/lib/game-service';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const stats = await gameService.getStats();
    const status = gameService.getStatus();
    
    return NextResponse.json({
      success: true,
      stats,
      engineStatus: status,
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get stats' },
      { status: 500 }
    );
  }
}

