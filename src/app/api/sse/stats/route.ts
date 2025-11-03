/**
 * SSE Stats Route
 * 
 * Returns statistics about connected SSE clients
 * Useful for debugging and monitoring
 */

import { NextResponse } from 'next/server';
import { getEventBroadcaster } from '@/lib/sse/event-broadcaster';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const broadcaster = getEventBroadcaster();
    const stats = broadcaster.getStats();

    return NextResponse.json({
      success: true,
      stats,
      timestamp: Date.now()
    });
  } catch (error) {
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

