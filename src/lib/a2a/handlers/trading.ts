/**
 * A2A Trading Feature Handlers
 * Handlers for prediction markets and perpetual futures
 */

import type { JsonRpcRequest, JsonRpcResponse } from '@/types/a2a'
import { ErrorCode } from '@/types/a2a'
import type { JsonRpcResult } from '@/types/common'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { Prisma } from '@prisma/client'
import { generateSnowflakeId } from '@/lib/snowflake'
import { PredictionPricing } from '@/lib/prediction-pricing'
import { WalletService } from '@/lib/services/wallet-service'
import { PerpTradeService } from '@/lib/services/perp-trade-service'
import { asUser } from '@/lib/db/context'
import type { AuthenticatedUser } from '@/lib/api/auth-middleware'
import {
  GetPredictionsParamsSchema,
  BuySharesParamsSchema,
  SellSharesParamsSchema,
  OpenPositionParamsSchema,
  ClosePositionParamsSchema,
  GetTradesParamsSchema,
  GetTradeHistoryParamsSchema,
} from '../validation'

export async function handleGetPredictions(_agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const validation = GetPredictionsParamsSchema.safeParse(request.params)
    if (!validation.success) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.INVALID_PARAMS, message: validation.error.message },
        id: request.id
      }
    }
    
    const { status } = validation.data
    
    const markets = await prisma.market.findMany({
      where: status ? { resolved: status === 'resolved' } : undefined,
      take: 100,
      orderBy: { createdAt: 'desc' }
    })
    
    return {
      jsonrpc: '2.0',
      result: {
        predictions: markets.map(m => ({
          id: m.id,
          question: m.question,
          yesShares: Number(m.yesShares),
          noShares: Number(m.noShares),
          liquidity: Number(m.liquidity),
          resolved: m.resolved,
          endDate: m.endDate
        }))
      } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleGetPredictions', error)
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Failed to fetch predictions' },
      id: request.id
    }
  }
}

export async function handleGetPerpetuals(_agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const orgs = await prisma.organization.findMany({
      take: 100,
      orderBy: { currentPrice: 'desc' }
    })
    
    return {
      jsonrpc: '2.0',
      result: {
        perpetuals: orgs.map(o => ({
          name: o.name,
          type: o.type,
          currentPrice: Number(o.currentPrice)
        }))
      } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleGetPerpetuals', error)
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Failed to fetch perpetuals' },
      id: request.id
    }
  }
}

export async function handleBuyShares(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const validation = BuySharesParamsSchema.safeParse(request.params)
    if (!validation.success) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.INVALID_PARAMS, message: validation.error.message },
        id: request.id
      }
    }
    
    const { marketId, outcome, amount } = validation.data
    
    // Get user info for asUser context
    const user = await prisma.user.findUnique({
      where: { id: agentId },
      select: { id: true, walletAddress: true }
    })
    
    if (!user) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.AGENT_NOT_FOUND, message: 'Agent user not found' },
        id: request.id
      }
    }
    
    const authUser: AuthenticatedUser = {
      userId: user.id,
      walletAddress: user.walletAddress || undefined,
      isAgent: true
    }
    
    // Execute trade within user context
    const result = await asUser(authUser, async (db) => {
      const market = await db.market.findUnique({
        where: { id: marketId }
      })
      
      if (!market) {
        throw new Error('Market not found')
      }
      
      if (market.resolved) {
        throw new Error('Market has already resolved')
      }
      
      if (new Date() > market.endDate) {
        throw new Error('Market has expired')
      }
      
      const side = outcome === 'YES' ? 'yes' : 'no'
      
      // Calculate shares using AMM with fees
      const calc = PredictionPricing.calculateBuyWithFees(
        Number(market.yesShares),
        Number(market.noShares),
        side,
        amount
      )
      
      // Check balance
      const hasFunds = await WalletService.hasSufficientBalance(agentId, amount)
      if (!hasFunds) {
        const balance = await WalletService.getBalance(agentId)
        throw new Error(`Insufficient balance. Required: $${amount}, Available: $${balance.balance}`)
      }
      
      // Debit total cost (includes fee) from balance
      await WalletService.debit(
        agentId,
        amount,
        'pred_buy',
        `Bought ${side.toUpperCase()} shares in: ${market.question}`,
        marketId
      )
      
      // Update market shares
      await db.market.update({
        where: { id: marketId },
        data: {
          yesShares: new Prisma.Decimal(calc.newYesShares),
          noShares: new Prisma.Decimal(calc.newNoShares),
          liquidity: {
            increment: new Prisma.Decimal(calc.netAmount),
          },
        },
      })
      
      // Create or update position
      const desiredYesSide = side === 'yes'
      const existingPosition = await db.position.findFirst({
        where: {
          userId: agentId,
          marketId,
          side: desiredYesSide,
        },
      })
      
      let position
      if (existingPosition) {
        const newTotalShares = Number(existingPosition.shares) + calc.sharesBought
        const newAvgPrice =
          (Number(existingPosition.avgPrice) * Number(existingPosition.shares) +
            calc.avgPrice * calc.sharesBought) /
          newTotalShares
        
        position = await db.position.update({
          where: { id: existingPosition.id },
          data: {
            shares: new Prisma.Decimal(newTotalShares),
            avgPrice: new Prisma.Decimal(newAvgPrice),
          },
        })
      } else {
        position = await db.position.create({
          data: {
            id: await generateSnowflakeId(),
            userId: agentId,
            marketId,
            side: desiredYesSide,
            shares: new Prisma.Decimal(calc.sharesBought),
            avgPrice: new Prisma.Decimal(calc.avgPrice),
            updatedAt: new Date(),
          },
        })
      }
      
      return {
        positionId: position.id,
        shares: calc.sharesBought,
        avgPrice: calc.avgPrice,
        cost: amount
      }
    })
    
    return {
      jsonrpc: '2.0',
      result: {
        success: true,
        positionId: result.positionId,
        shares: result.shares,
        avgPrice: result.avgPrice,
        cost: result.cost
      } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleBuyShares', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to buy shares'
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: errorMessage },
      id: request.id
    }
  }
}

export async function handleSellShares(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const validation = SellSharesParamsSchema.safeParse(request.params)
    if (!validation.success) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.INVALID_PARAMS, message: validation.error.message },
        id: request.id
      }
    }
    
    const { positionId, shares } = validation.data
    
    // Get user info for asUser context
    const user = await prisma.user.findUnique({
      where: { id: agentId },
      select: { id: true, walletAddress: true }
    })
    
    if (!user) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.AGENT_NOT_FOUND, message: 'Agent user not found' },
        id: request.id
      }
    }
    
    const authUser: AuthenticatedUser = {
      userId: user.id,
      walletAddress: user.walletAddress || undefined,
      isAgent: true
    }
    
    // Execute sell within user context
    const result = await asUser(authUser, async (db) => {
      // Get position
      const position = await db.position.findUnique({
        where: { id: positionId },
        include: { Market: true }
      })
      
      if (!position) {
        throw new Error('Position not found')
      }
      
      if (position.userId !== agentId) {
        throw new Error('Position does not belong to agent')
      }
      
      const market = position.Market
      if (!market) {
        throw new Error('Market not found for position')
      }
      
      if (market.resolved) {
        throw new Error('Cannot sell from resolved market')
      }
      
      // Validate sufficient shares
      if (Number(position.shares) < shares) {
        throw new Error(`Insufficient shares. Have ${Number(position.shares)}, trying to sell ${shares}`)
      }
      
      const sellSide: 'yes' | 'no' = position.side ? 'yes' : 'no'
      
      // Calculate proceeds using AMM with fees
      const calculation = PredictionPricing.calculateSellWithFees(
        Number(market.yesShares),
        Number(market.noShares),
        sellSide,
        shares
      )
      
      const grossProceeds = calculation.totalCost
      const netProceeds = calculation.netProceeds!
      
      // Credit net proceeds to balance
      await WalletService.credit(
        agentId,
        netProceeds,
        'pred_sell',
        `Sold ${shares} ${sellSide.toUpperCase()} shares in: ${market.question}`,
        market.id
      )
      
      // Update market shares
      await db.market.update({
        where: { id: market.id },
        data: {
          yesShares: new Prisma.Decimal(calculation.newYesShares),
          noShares: new Prisma.Decimal(calculation.newNoShares),
          liquidity: {
            decrement: new Prisma.Decimal(grossProceeds),
          },
        },
      })
      
      // Update or close position
      const remaining = Number(position.shares) - shares
      
      if (remaining <= 0.01) {
        await db.position.delete({
          where: { id: position.id },
        })
      } else {
        await db.position.update({
          where: { id: position.id },
          data: {
            shares: new Prisma.Decimal(remaining),
          },
        })
      }
      
      // Calculate PnL
      const costBasis = Number(position.avgPrice) * shares
      const profitLoss = netProceeds - costBasis
      await WalletService.recordPnL(agentId, profitLoss, 'prediction_sell', market.id)
      
      return {
        proceeds: netProceeds,
        remainingShares: Math.max(0, remaining)
      }
    })
    
    return {
      jsonrpc: '2.0',
      result: {
        success: true,
        proceeds: result.proceeds,
        remainingShares: result.remainingShares
      } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleSellShares', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to sell shares'
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: errorMessage },
      id: request.id
    }
  }
}

export async function handleOpenPosition(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const validation = OpenPositionParamsSchema.safeParse(request.params)
    if (!validation.success) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.INVALID_PARAMS, message: validation.error.message },
        id: request.id
      }
    }
    
    const { ticker, side, amount, leverage } = validation.data
    
    // Get user info for AuthenticatedUser
    const user = await prisma.user.findUnique({
      where: { id: agentId },
      select: { id: true, walletAddress: true }
    })
    
    if (!user) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.AGENT_NOT_FOUND, message: 'Agent user not found' },
        id: request.id
      }
    }
    
    const authUser: AuthenticatedUser = {
      userId: user.id,
      walletAddress: user.walletAddress || undefined,
      isAgent: true
    }
    
    // Normalize side to lowercase
    const normalizedSide = side.toLowerCase() as 'long' | 'short'
    
    // Use PerpTradeService to open position
    const result = await PerpTradeService.openPosition(authUser, {
      ticker,
      side: normalizedSide,
      size: amount,
      leverage,
    })
    
    return {
      jsonrpc: '2.0',
      result: {
        success: true,
        positionId: result.position.id,
        entryPrice: result.position.entryPrice,
        size: result.position.size,
        leverage: result.position.leverage
      } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleOpenPosition', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to open position'
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: errorMessage },
      id: request.id
    }
  }
}

export async function handleClosePosition(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const validation = ClosePositionParamsSchema.safeParse(request.params)
    if (!validation.success) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.INVALID_PARAMS, message: validation.error.message },
        id: request.id
      }
    }
    
    const { positionId } = validation.data
    
    // Get user info for AuthenticatedUser
    const user = await prisma.user.findUnique({
      where: { id: agentId },
      select: { id: true, walletAddress: true }
    })
    
    if (!user) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.AGENT_NOT_FOUND, message: 'Agent user not found' },
        id: request.id
      }
    }
    
    const authUser: AuthenticatedUser = {
      userId: user.id,
      walletAddress: user.walletAddress || undefined,
      isAgent: true
    }
    
    // Use PerpTradeService to close position
    const result = await PerpTradeService.closePosition(authUser, positionId)
    
    return {
      jsonrpc: '2.0',
      result: {
        success: true,
        exitPrice: result.position.currentPrice,
        pnl: result.realizedPnL
      } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleClosePosition', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to close position'
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: errorMessage },
      id: request.id
    }
  }
}

export async function handleGetTrades(_agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const validation = GetTradesParamsSchema.safeParse(request.params)
    if (!validation.success) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.INVALID_PARAMS, message: validation.error.message },
        id: request.id
      }
    }
    
    const { limit } = validation.data
    
    const trades = await prisma.balanceTransaction.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' }
    })
    
    return {
      jsonrpc: '2.0',
      result: { trades } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleGetTrades', error)
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Failed to fetch trades' },
      id: request.id
    }
  }
}

export async function handleGetTradeHistory(_agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const validation = GetTradeHistoryParamsSchema.safeParse(request.params)
    if (!validation.success) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.INVALID_PARAMS, message: validation.error.message },
        id: request.id
      }
    }
    
    const { userId, limit } = validation.data
    
    const trades = await prisma.balanceTransaction.findMany({
      where: { userId },
      take: limit,
      orderBy: { createdAt: 'desc' }
    })
    
    return {
      jsonrpc: '2.0',
      result: { trades } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleGetTradeHistory', error)
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Failed to fetch trade history' },
      id: request.id
    }
  }
}

