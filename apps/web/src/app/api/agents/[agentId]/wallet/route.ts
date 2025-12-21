/**
 * Agent Points Wallet API
 *
 * @route GET /api/agents/[agentId]/wallet - Get wallet balance
 * @route POST /api/agents/[agentId]/wallet - Deposit/withdraw points
 * @access Authenticated (owner only)
 *
 * @description
 * Manages agent points wallet, view balance, and transaction history.
 * Points are used for all agent operations: chat, trading, posting, etc.
 *
 * @openapi
 * /api/agents/{agentId}/wallet:
 *   get:
 *     tags:
 *       - Agents
 *     summary: Get wallet balance
 *     description: Returns wallet balance and transaction history (owner only)
 *     security:
 *       - PrivyAuth: []
 *     parameters:
 *       - in: path
 *         name: agentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Agent user ID
 *     responses:
 *       200:
 *         description: Wallet info retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 balance:
 *                   type: object
 *                   properties:
 *                     current:
 *                       type: number
 *                     totalDeposited:
 *                       type: number
 *                     totalSpent:
 *                       type: number
 *                 transactions:
 *                   type: array
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not agent owner
 *       404:
 *         description: Agent not found
 *   post:
 *     tags:
 *       - Agents
 *     summary: Deposit/withdraw points
 *     description: Deposits or withdraws points from agent wallet (owner only)
 *     security:
 *       - PrivyAuth: []
 *     parameters:
 *       - in: path
 *         name: agentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Agent user ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - action
 *               - amount
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [deposit, withdraw]
 *               amount:
 *                 type: number
 *                 minimum: 0.01
 *     responses:
 *       200:
 *         description: Transaction completed successfully
 *       400:
 *         description: Invalid action or amount
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not agent owner
 *       404:
 *         description: Agent not found
 *
 * @example
 * ```typescript
 * // Get balance
 * const { balance } = await fetch(`/api/agents/${agentId}/wallet`, {
 *   headers: { 'Authorization': `Bearer ${token}` }
 * }).then(r => r.json());
 *
 * // Deposit points
 * await fetch(`/api/agents/${agentId}/wallet`, {
 *   method: 'POST',
 *   headers: { 'Authorization': `Bearer ${token}` },
 *   body: JSON.stringify({ action: 'deposit', amount: 100 })
 * });
 * ```
 * @throws {500} Internal server error or insufficient balance
 *
 * @example
 * ```typescript
 * // Get wallet info
 * const wallet = await fetch(`/api/agents/${agentId}/wallet`, {
 *   headers: { 'Authorization': `Bearer ${token}` }
 * });
 * const { balance, transactions } = await wallet.json();
 *
 * // Deposit points
 * await fetch(`/api/agents/${agentId}/wallet`, {
 *   method: 'POST',
 *   body: JSON.stringify({
 *     action: 'deposit',
 *     amount: 500
 *   })
 * });
 *
 * // Withdraw points
 * await fetch(`/api/agents/${agentId}/wallet`, {
 *   method: 'POST',
 *   body: JSON.stringify({
 *     action: 'withdraw',
 *     amount: 100
 *   })
 * });
 * ```
 *
 * @see {@link /lib/agents/services/AgentService} Points management
 * @see {@link /src/app/agents/[agentId]/page.tsx} Wallet UI
 */

import { agentService, getAgentConfig } from '@babylon/agents';
import { authenticateUser } from '@babylon/api';
import { db, eq, users } from '@babylon/db';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const user = await authenticateUser(req);
  const { agentId } = await params;

  // Verify ownership
  await agentService.getAgent(agentId, user.id);

  // Get agent config for balance info
  const config = await getAgentConfig(agentId);

  // Get user's trading balance (source for ops budget)
  const userResult = await db
    .select({ virtualBalance: users.virtualBalance })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  const userBalance = Number(userResult[0]?.virtualBalance ?? 0);

  const transactions = await db.agentPointsTransaction.findMany({
    where: { agentUserId: agentId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return NextResponse.json({
    success: true,
    balance: {
      current: config?.pointsBalance ?? 0,
      totalDeposited: config?.totalDeposited ?? 0,
      totalWithdrawn: config?.totalWithdrawn ?? 0,
      totalSpent: config?.totalPointsSpent ?? 0,
    },
    userBalance: userBalance,
    transactions: transactions.map((tx) => ({
      id: tx.id,
      type: tx.type,
      amount: tx.amount,
      balanceBefore: tx.balanceBefore,
      balanceAfter: tx.balanceAfter,
      description: tx.description,
      relatedId: tx.relatedId,
      createdAt: tx.createdAt.toISOString(),
    })),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const user = await authenticateUser(req);
  const { agentId } = await params;
  const body = await req.json();

  const { action, amount } = body;

  if (action === 'deposit') {
    await agentService.depositPoints(agentId, user.id, amount);
    logger.info(
      `Deposited $${amount} ops budget to agent ${agentId}`,
      undefined,
      'AgentsAPI'
    );
  } else {
    await agentService.withdrawPoints(agentId, user.id, amount);
    logger.info(
      `Withdrew $${amount} ops budget from agent ${agentId}`,
      undefined,
      'AgentsAPI'
    );
  }

  // Re-fetch config and user balance
  const updatedConfig = await getAgentConfig(agentId);
  const userResult = await db
    .select({ virtualBalance: users.virtualBalance })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  const userBalance = Number(userResult[0]?.virtualBalance ?? 0);

  return NextResponse.json({
    success: true,
    balance: {
      current: updatedConfig?.pointsBalance ?? 0,
      totalDeposited: updatedConfig?.totalDeposited ?? 0,
      totalWithdrawn: updatedConfig?.totalWithdrawn ?? 0,
    },
    userBalance: userBalance,
    message: `${action === 'deposit' ? 'Deposited' : 'Withdrew'} $${amount.toFixed(2)} successfully`,
  });
}
