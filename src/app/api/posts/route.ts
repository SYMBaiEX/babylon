/**
 * Posts API Route
 * 
 * GET /api/posts - Get recent posts from database
 */

import { gameService } from '@/lib/game-service';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');
    const actorId = searchParams.get('actorId') || undefined;

    // Prefer realtime history when available
    const realtimeResult = await gameService.getRealtimePosts(limit, offset, actorId || undefined);
    if (realtimeResult && realtimeResult.posts.length > 0) {
      return NextResponse.json({
        success: true,
        posts: realtimeResult.posts,
        total: realtimeResult.total,
        limit,
        offset,
        source: 'realtime',
      });
    }

    let posts;
    
    if (actorId) {
      // Get posts by specific actor
      posts = await gameService.getPostsByActor(actorId, limit);
    } else {
      // Get recent posts
      posts = await gameService.getRecentPosts(limit, offset);
    }
    
    return NextResponse.json({
      success: true,
      posts,
      total: posts.length,
      limit,
      offset,
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load posts' },
      { status: 500 }
    );
  }
}
