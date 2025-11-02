/**
 * API Route: /api/game-assets
 * Methods: GET (get game assets including groupChats)
 * 
 * Vercel-compatible: Reads from public directory via HTTP or returns from database
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    // Get group chats from database instead of file system
    const groupChats = await prisma.chat.findMany({
      where: {
        isGroup: true,
        gameId: 'continuous',
      },
      select: {
        id: true,
        name: true,
        // Map to expected format
      },
    });

    // If you need additional game assets, store them in database or
    // have the client fetch from /data/actors.json directly (public folder)
    const assets = {
      groupChats: groupChats.map(chat => ({
        id: chat.id,
        name: chat.name,
      })),
    };

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
