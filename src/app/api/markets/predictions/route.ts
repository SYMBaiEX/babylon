/**
 * Prediction Markets API
 * 
 * GET /api/markets/predictions - Get active prediction questions
 * Query params: ?userId=xxx - Include user positions if authenticated
 */

import { db } from '@/lib/database-service';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { PrismaClient } from '@prisma/client';
import type { NextRequest } from 'next/server';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    const questions = await db.getActiveQuestions();
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');
    
    // Get all markets to check if they exist and get share counts
    const marketIds = questions.map(q => String(q.id));
    const markets = await prisma.market.findMany({
      where: {
        id: { in: marketIds },
      },
    });
    const marketMap = new Map(markets.map(m => [m.id, m]));
    
    // Get user positions if userId provided
    const userPositionsMap = new Map();
    if (userId) {
      const positions = await prisma.position.findMany({
        where: {
          userId: userId,
          marketId: { in: marketIds },
        },
        include: {
          market: true,
        },
      });
      
      // Create map of marketId -> position data
      positions.forEach(p => {
        const market = p.market;
        const totalShares = Number(market.yesShares) + Number(market.noShares);
        const currentYesPrice = totalShares > 0 ? Number(market.yesShares) / totalShares : 0.5;
        const currentNoPrice = totalShares > 0 ? Number(market.noShares) / totalShares : 0.5;
        
        userPositionsMap.set(p.marketId, {
          id: p.id,
          side: p.side ? 'YES' : 'NO',
          shares: Number(p.shares),
          avgPrice: Number(p.avgPrice),
          currentPrice: p.side ? currentYesPrice : currentNoPrice,
          currentValue: Number(p.shares) * (p.side ? currentYesPrice : currentNoPrice),
          costBasis: Number(p.shares) * Number(p.avgPrice),
          unrealizedPnL: (Number(p.shares) * (p.side ? currentYesPrice : currentNoPrice)) - (Number(p.shares) * Number(p.avgPrice)),
        });
      });
    }
    
    return NextResponse.json({
      success: true,
      questions: questions.map(q => {
        const marketId = String(q.id);
        const market = marketMap.get(marketId);
        const userPosition = userPositionsMap.get(marketId);
        
        return {
          id: q.id, // Use actual question ID (string), not questionNumber
          questionNumber: q.questionNumber, // Also include questionNumber for reference
          text: q.text,
          status: q.status,
          createdDate: q.createdDate,
          resolutionDate: q.resolutionDate,
          resolvedOutcome: q.resolvedOutcome,
          scenario: q.scenarioId,
          yesShares: market ? Number(market.yesShares) : 0,
          noShares: market ? Number(market.noShares) : 0,
          // Include user position if exists
          userPosition: userPosition || null,
        };
      }),
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
