/**
 * API Route: /api/markets/predictions
 * Methods: GET (get prediction market questions)
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/api/auth-middleware';
import { getRealtimeEngine } from '@/api/realtime';

/**
 * GET /api/markets/predictions
 * Get prediction market questions (active and resolved)
 * Query params:
 * - status: 'active' | 'resolved' | 'all' (default: 'all')
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status') || 'all';

    const engine = getRealtimeEngine();
    const allQuestions = engine.getAllQuestions();

    let questions = allQuestions;

    if (status === 'active') {
      questions = allQuestions.filter((q) => q.status === 'active');
    } else if (status === 'resolved') {
      questions = allQuestions.filter((q) => q.status === 'resolved');
    }

    return successResponse({
      questions: questions.map((q) => ({
        id: q.id,
        text: q.text,
        scenario: q.scenario,
        status: q.status,
        createdDate: q.createdDate,
        resolutionDate: q.resolutionDate,
        resolvedOutcome: q.resolvedOutcome,
        rank: q.rank,
      })),
      total: questions.length,
      active: allQuestions.filter((q) => q.status === 'active').length,
      resolved: allQuestions.filter((q) => q.status === 'resolved').length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching prediction markets:', error);
    return errorResponse('Failed to fetch prediction markets');
  }
}


