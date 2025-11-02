/**
 * Agent Wallet API
 * GET /api/agents/wallet
 * Returns wallet balance for authenticated agent
 */

import type { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/api/auth-middleware';
import { verifyAgentSession } from '../auth/route';
import { WalletService } from '@/services/WalletService';
import { PrismaClient } from '@prisma/client';
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

    // Find or create user for this agent (agents use username = agentId)
    let dbUser = await prisma.user.findUnique({
      where: { username: agentId },
    });

    if (!dbUser) {
      // Create user for agent if it doesn't exist
      dbUser = await prisma.user.create({
        data: {
          username: agentId,
          displayName: agentId,
          virtualBalance: 10000, // Start agents with 10k
          totalDeposited: 10000,
          bio: `Autonomous AI agent: ${agentId}`,
        },
      });
      logger.info(`Created user for agent: ${agentId}`, { userId: dbUser.id }, 'AgentWallet');
    }

    // Get balance info
    const balanceInfo = await WalletService.getBalance(dbUser.id);

    return successResponse({
      balance: balanceInfo.balance,
      totalDeposited: balanceInfo.totalDeposited,
      totalWithdrawn: balanceInfo.totalWithdrawn,
      lifetimePnL: balanceInfo.lifetimePnL,
      userId: dbUser.id,
    });
  } catch (error) {
    logger.error('Error fetching agent wallet:', error, 'GET /api/agents/wallet');
    return errorResponse('Failed to fetch wallet', 500);
  }
}

