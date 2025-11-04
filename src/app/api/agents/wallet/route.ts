/**
 * Agent Wallet API
 * GET /api/agents/wallet
 * Returns wallet balance for authenticated agent
 */

import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/database-service';
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler';
import { AuthorizationError } from '@/lib/errors';
import { verifyAgentSession } from '@/lib/auth/agent-auth';
import { logger } from '@/lib/logger';
import { WalletService } from '@/lib/services/wallet-service';

/**
 * GET /api/agents/wallet
 * Returns wallet balance for authenticated agent
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  // Get session token from Authorization header
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AuthorizationError('Missing or invalid authorization header', 'wallet', 'read');
  }

  const sessionToken = authHeader.substring(7);
  const session = verifyAgentSession(sessionToken);

  if (!session) {
    throw new AuthorizationError('Invalid or expired session token', 'wallet', 'read');
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

  logger.info('Agent wallet fetched successfully', { agentId, balance: balanceInfo.balance }, 'GET /api/agents/wallet');

  return successResponse({
    balance: balanceInfo.balance,
    totalDeposited: balanceInfo.totalDeposited,
    totalWithdrawn: balanceInfo.totalWithdrawn,
    lifetimePnL: balanceInfo.lifetimePnL,
    userId: dbUser.id,
  });
});






