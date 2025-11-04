/**
 * Agent Positions API
 * GET /api/agents/positions
 * Returns positions for authenticated agent
 */

import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/database-service';
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler';
import { AuthorizationError, NotFoundError } from '@/lib/errors';
import { verifyAgentSession } from '@/lib/auth/agent-auth';
import { getPerpsEngine } from '@/lib/perps-service';
import { logger } from '@/lib/logger';

/**
 * GET /api/agents/positions
 * Returns positions for authenticated agent
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  // Get session token from Authorization header
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AuthorizationError('Missing or invalid authorization header', 'positions', 'read');
  }

  const sessionToken = authHeader.substring(7);
  const session = verifyAgentSession(sessionToken);

  if (!session) {
    throw new AuthorizationError('Invalid or expired session token', 'positions', 'read');
  }

  const agentId = session.agentId;

  // Find user for this agent (agents use username = agentId)
  const dbUser = await prisma.user.findUnique({
    where: { username: agentId },
  });

  if (!dbUser) {
    throw new NotFoundError('Agent user', agentId);
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

  const predictionPositionsData = predictionPositions.map((p) => {
    // Calculate current price from market shares
    const totalShares = Number(p.market.yesShares) + Number(p.market.noShares);
    const currentYesPrice = totalShares > 0 ? Number(p.market.yesShares) / totalShares : 0.5;
    const currentNoPrice = totalShares > 0 ? Number(p.market.noShares) / totalShares : 0.5;
    const currentPrice = p.side ? currentYesPrice : currentNoPrice;

    // Calculate current value and PnL
    const shares = Number(p.shares);
    const avgPrice = Number(p.avgPrice);
    const currentValue = shares * currentPrice;
    const costBasis = shares * avgPrice;
    const pnl = currentValue - costBasis;

    return {
      id: p.id,
      marketId: p.marketId,
      side: p.side,
      shares: shares,
      avgPrice: avgPrice,
      currentValue: currentValue,
      pnl: pnl,
      market: p.market,
    };
  });

  const predictionStats = {
    totalPositions: predictionPositions.length,
    totalPnL: predictionPositionsData.reduce((sum, p) => sum + p.pnl, 0),
  };

  logger.info('Agent positions fetched successfully', {
    agentId,
    perpPositions: perpStats.totalPositions,
    predictionPositions: predictionStats.totalPositions
  }, 'GET /api/agents/positions');

  return successResponse({
    perpetuals: {
      positions: perpPositions,
      stats: perpStats,
    },
    predictions: {
      positions: predictionPositionsData,
      stats: predictionStats,
    },
  });
});

