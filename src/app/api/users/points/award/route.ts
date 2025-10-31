/**
 * Points Award API Route
 *
 * Awards points to users for various achievements and milestones
 * Tracks transactions for transparency
 */

import { NextRequest } from 'next/server'
import { PrismaClient, Prisma } from '@prisma/client'
import { authenticate, errorResponse, successResponse } from '@/lib/api/auth-middleware'

const prisma = new PrismaClient()

interface AwardPointsRequest {
  userId: string
  amount: number
  reason: string
}

/**
 * POST /api/users/points/award
 * Award points to a user
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate the requesting user
    const authUser = await authenticate(request)

    // Parse request body
    const body: AwardPointsRequest = await request.json()
    const { userId, amount, reason } = body

    if (!userId || !amount || !reason) {
      return errorResponse('User ID, amount, and reason are required', 400)
    }

    if (amount <= 0) {
      return errorResponse('Amount must be positive', 400)
    }

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        virtualBalance: true,
      },
    })

    if (!user) {
      return errorResponse('User not found', 404)
    }

    // Award points by creating a deposit transaction
    const transaction = await prisma.balanceTransaction.create({
      data: {
        userId: user.id,
        amount: new Prisma.Decimal(amount),
        transactionType: 'deposit',
        description: reason,
        status: 'completed',
        completedAt: new Date(),
      },
    })

    // Update user's virtual balance
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        virtualBalance: {
          increment: amount,
        },
        totalDeposited: {
          increment: amount,
        },
      },
      select: {
        id: true,
        virtualBalance: true,
        totalDeposited: true,
      },
    })

    return successResponse({
      message: `Successfully awarded ${amount} points`,
      transaction: {
        id: transaction.id,
        amount: transaction.amount.toString(),
        reason: transaction.description,
        timestamp: transaction.createdAt,
      },
      user: {
        id: updatedUser.id,
        virtualBalance: updatedUser.virtualBalance.toString(),
        totalDeposited: updatedUser.totalDeposited.toString(),
      },
    })
  } catch (error) {
    console.error('Points award error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Failed to award points',
      500
    )
  }
}

/**
 * GET /api/users/points/award?userId={userId}
 * Get points award history for a user
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate the requesting user
    const authUser = await authenticate(request)

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return errorResponse('User ID is required', 400)
    }

    // Fetch deposit transactions (points awards)
    const transactions = await prisma.balanceTransaction.findMany({
      where: {
        userId,
        transactionType: 'deposit',
        status: 'completed',
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        amount: true,
        description: true,
        createdAt: true,
        completedAt: true,
      },
    })

    return successResponse({
      transactions: transactions.map(tx => ({
        id: tx.id,
        amount: tx.amount.toString(),
        reason: tx.description,
        timestamp: tx.createdAt,
        completedAt: tx.completedAt,
      })),
    })
  } catch (error) {
    console.error('Fetch points history error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Failed to fetch points history',
      500
    )
  }
}
