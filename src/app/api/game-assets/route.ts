/**
 * API Route: /api/game-assets
 * Methods: GET (get game assets including groupChats)
 */

import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const assetsPath = join(process.cwd(), 'games', 'game-assets.json');
    
    if (!existsSync(assetsPath)) {
      return NextResponse.json(
        { success: false, error: 'Game assets not found' },
        { status: 404 }
      );
    }

    const content = readFileSync(assetsPath, 'utf-8');
    const assets = JSON.parse(content);

    return NextResponse.json({
      success: true,
      assets,
    });
  } catch (error) {
    logger.error('Error loading game assets:', error, 'GET /api/game-assets');
    return NextResponse.json(
      { success: false, error: 'Failed to load game assets' },
      { status: 500 }
    );
  }
}

