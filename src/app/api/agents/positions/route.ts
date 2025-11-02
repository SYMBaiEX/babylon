/**
 * Agent Positions API
 * GET /api/agents/positions
 * Returns positions for authenticated agent
 */

import type { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/api/auth-middleware';
import { verifyAgentSession } from '../auth/route';
import { PrismaClient } from '@prisma/client';
import { getPerpsEngine } from '@/lib/perps-service';
import { logger } from '@/lib/logger';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    // Get session token from Authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errorResponse('Missing or invalid authorization header', 401);
    }

    const sessionToken = authHeader.substring(7);
    const session = verifyAgentSession(sessionToken);

    if (!session) {
      return errorResponse('Invalid or expired session token', 401);
    }

    const agentId = session.agentId;

    // Find user for this agent (agents use username = agentId)
    const dbUser = await prisma.user.findUnique({
      where: { username: agentId },
    });

    if (!dbUser) {
      return errorResponse('Agent user not found', 404);
    }

    // Get perpetual positions
    const perpsEngine = getPerpsEngine();
    const perpPositions = perpsEngine.getUserPositions(dbUser.id);

    // Get prediction market positions
    const predictionPositions = await prisma.position.findMany({
      where: {
        userId: dbUser.id,
      },
      include: {
        market: {
          select: {
            id: true,
            question: true,
            endDate: true,
            resolved: true,
            resolution: true,
            yesShares: true,
            noShares: true,
          },
        },
      },
    });

    // Calculate stats
    const perpStats = {
      totalPositions: perpPositions.length,
      totalPnL: perpPositions.reduce((sum, p) => sum + p.unrealizedPnL, 0),
      totalFunding: perpPositions.reduce((sum, p) => sum + p.fundingPaid, 0),
    };

    return successResponse({
      perpetuals: {
        positions: perpPositions,
        stats: perpStats,
      },
      predictions: {
        positions: predictionPositions.map((p) => ({
          id: p.id,
          marketId: p.marketId,
          side: p.side,
          shares: Number(p.shares),
          avgPrice: Number(p.avgPrice),
          currentValue: Number(p.currentValue),
          pnl: Number(p.pnl),
          market: p.market,
        })),
        stats: {
          totalPositions: predictionPositions.length,
          totalPnL: predictionPositions.reduce((sum, p) => sum + Number(p.pnl), 0),
        },
      },
    });
  } catch (error) {
    logger.error('Error fetching agent positions:', error, 'GET /api/agents/positions');
    return errorResponse('Failed to fetch positions', 500);
  }
}

