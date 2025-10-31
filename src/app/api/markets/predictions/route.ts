/**
 * Prediction Markets API
 * 
 * GET /api/markets/predictions - Get active prediction questions
 */

import { db } from '@/lib/database-service';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const questions = await db.getActiveQuestions();
    
    return NextResponse.json({
      success: true,
      questions: questions.map(q => ({
        id: q.questionNumber,
        text: q.text,
        status: q.status,
        createdDate: q.createdDate,
        resolutionDate: q.resolutionDate,
        resolvedOutcome: q.resolvedOutcome,
        scenario: q.scenarioId,
        yesShares: 0, // TODO: Track from positions
        noShares: 0,
      })),
      count: questions.length,
    });
  } catch (error) {
    logger.error('API Error:', error, 'GET /api/markets/predictions');
    return NextResponse.json(
      { success: false, error: 'Failed to load predictions' },
      { status: 500 }
    );
  }
}
