/**
 * Agent Wallet API Routes
 * 
 * GET  /api/agents/[agentId]/wallet - Get balance and history
 * POST /api/agents/[agentId]/wallet - Deposit or withdraw points
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { agentService } from '@/lib/agents/services/AgentService'
import { logger } from '@/lib/logger'
import { authenticateUser } from '@/lib/server-auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const user = await authenticateUser(req)
    const { agentId } = await params

    // Verify ownership
    const agent = await agentService.getAgent(agentId, user.id)
    if (!agent) {
      return NextResponse.json(
        { error: 'Agent not found or unauthorized' },
        { status: 404 }
      )
    }

    // Get transaction history
    const transactions = await prisma.agentPointsTransaction.findMany({
      where: { agentUserId: agentId },
      orderBy: { createdAt: 'desc' },
      take: 100
    })

    return NextResponse.json({
      success: true,
      balance: {
        current: agent.agentPointsBalance,
        totalDeposited: agent.agentTotalDeposited,
        totalWithdrawn: agent.agentTotalWithdrawn,
        totalSpent: agent.agentTotalPointsSpent
      },
      transactions: transactions.map(tx => ({
        id: tx.id,
        type: tx.type,
        amount: tx.amount,
        balanceBefore: tx.balanceBefore,
        balanceAfter: tx.balanceAfter,
        description: tx.description,
        relatedId: tx.relatedId,
        createdAt: tx.createdAt.toISOString()
      }))
    })
  } catch (error: unknown) {
    logger.error('Error getting agent wallet', error, 'AgentsAPI')
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get wallet' },
      { status: 500 }
    )
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const user = await authenticateUser(req)
    const { agentId } = await params
    const body = await req.json()

    const { action, amount } = body

    if (!action || !['deposit', 'withdraw'].includes(action)) {
      return NextResponse.json(
        { error: 'Action must be "deposit" or "withdraw"' },
        { status: 400 }
      )
    }

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json(
        { error: 'Amount must be a positive number' },
        { status: 400 }
      )
    }

    let agent
    if (action === 'deposit') {
      agent = await agentService.depositPoints(agentId, user.id, amount)
      logger.info(`Deposited ${amount} points to agent ${agentId}`, undefined, 'AgentsAPI')
    } else {
      agent = await agentService.withdrawPoints(agentId, user.id, amount)
      logger.info(`Withdrew ${amount} points from agent ${agentId}`, undefined, 'AgentsAPI')
    }

    return NextResponse.json({
      success: true,
      balance: {
        current: agent.agentPointsBalance,
        totalDeposited: agent.agentTotalDeposited,
        totalWithdrawn: agent.agentTotalWithdrawn
      },
      message: `${action === 'deposit' ? 'Deposited' : 'Withdrew'} ${amount} points successfully`
    })
  } catch (error: unknown) {
    logger.error('Error processing wallet transaction', error, 'AgentsAPI')
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process transaction' },
      { status: 500 }
    )
  }
}

