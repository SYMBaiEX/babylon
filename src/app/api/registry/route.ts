/**
 * Registry API Route
 *
 * Fetches all registered users/agents from the database
 * Supports filtering and sorting
 */

import type { NextRequest } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { successResponse, errorResponse } from '@/lib/api/auth-middleware'
import { ReputationService } from '@/lib/services/reputation-service'
import { logger } from '@/lib/logger'

const prisma = new PrismaClient()

interface RegistryFilters {
  onChainOnly?: boolean
  sortBy?: 'username' | 'createdAt' | 'nftTokenId'
  sortOrder?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

/**
 * GET /api/registry
 * Fetch all registered users with optional filtering
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    // Parse query parameters
    const filters: RegistryFilters = {
      onChainOnly: searchParams.get('onChainOnly') === 'true',
      sortBy: (searchParams.get('sortBy') as RegistryFilters['sortBy']) || 'createdAt',
      sortOrder: (searchParams.get('sortOrder') as RegistryFilters['sortOrder']) || 'desc',
      limit: parseInt(searchParams.get('limit') || '100'),
      offset: parseInt(searchParams.get('offset') || '0'),
    }

    // Build where clause
    const where = filters.onChainOnly ? { onChainRegistered: true } : {}

    // Build order by clause
    const orderBy = filters.sortBy ? {
      [filters.sortBy]: filters.sortOrder,
    } : { createdAt: 'desc' as const }

    // Fetch users from database
    const users = await prisma.user.findMany({
      where,
      orderBy,
      take: filters.limit,
      skip: filters.offset,
      select: {
        id: true,
        username: true,
        displayName: true,
        bio: true,
        profileImageUrl: true,
        walletAddress: true,
        isActor: true,
        onChainRegistered: true,
        nftTokenId: true,
        registrationTxHash: true,
        createdAt: true,
        virtualBalance: true,
        lifetimePnL: true,
        // Include relationship counts
        _count: {
          select: {
            positions: true,
            comments: true,
            reactions: true,
          },
        },
      },
    })

    // Get total count for pagination
    const totalCount = await prisma.user.count({ where })

    // Fetch reputation scores for all users (in parallel)
    const usersWithReputation = await Promise.all(
      users.map(async (user) => {
        let reputation: number | null = null
        if (user.onChainRegistered && user.nftTokenId) {
          try {
            reputation = await ReputationService.getOnChainReputation(user.id)
          } catch (error) {
            logger.error(`Failed to fetch reputation for user ${user.id}:`, error, 'GET /api/registry')
            // Continue without reputation if fetch fails
          }
        }

        return {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          bio: user.bio,
          profileImageUrl: user.profileImageUrl,
          walletAddress: user.walletAddress,
          isActor: user.isActor,
          onChainRegistered: user.onChainRegistered,
          nftTokenId: user.nftTokenId,
          registrationTxHash: user.registrationTxHash,
          createdAt: user.createdAt,
          virtualBalance: user.virtualBalance.toString(),
          lifetimePnL: user.lifetimePnL.toString(),
          reputation,
          stats: {
            positions: user._count.positions,
            comments: user._count.comments,
            reactions: user._count.reactions,
          },
        }
      })
    )

    return successResponse({
      users: usersWithReputation,
      pagination: {
        total: totalCount,
        limit: filters.limit || 100,
        offset: filters.offset || 0,
        hasMore: (filters.offset || 0) + users.length < totalCount,
      },
    })
  } catch (error) {
    logger.error('Registry fetch error:', error, 'GET /api/registry')
    return errorResponse(
      error instanceof Error ? error.message : 'Failed to fetch registry',
      500
    )
  }
}
