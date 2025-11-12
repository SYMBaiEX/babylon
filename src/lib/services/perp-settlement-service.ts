/**
 * Perpetuals Settlement Service
 *
 * Bridges off-chain trading engine (PR #128) with on-chain contracts (PR #129)
 *
 * Modes:
 * - offchain: No blockchain settlement (fast MVP)
 * - onchain: Every trade settles to blockchain (decentralized)
 * - hybrid: Periodic batch settlement (best of both)
 */

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { PERP_CONFIG, isOnChainEnabled, isHybridMode } from '@/lib/config/perp-modes';

import type { PerpPosition } from '@/shared/perps-types';

export interface SettlementResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
  gasUsed?: bigint;
}

export class PerpSettlementService {
  private static batchTimer: NodeJS.Timeout | null = null;
  private static unsettledPositions: Set<string> = new Set();

  /**
   * Initialize settlement service (for hybrid mode)
   */
  static initialize(): void {
    if (!isHybridMode()) {
      return;
    }

    // Start periodic batch settlement
    this.batchTimer = setInterval(
      () => this.executeBatchSettlement(),
      PERP_CONFIG.hybridBatchInterval
    );

    logger.info('Hybrid settlement service initialized', {
      batchInterval: PERP_CONFIG.hybridBatchInterval,
      batchSize: PERP_CONFIG.hybridBatchSize,
    }, 'PerpSettlementService');
  }

  /**
   * Shutdown settlement service
   */
  static shutdown(): void {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
  }

  /**
   * Settle position opening to blockchain
   */
  static async settleOpenPosition(
    position: PerpPosition
  ): Promise<SettlementResult> {
    if (!isOnChainEnabled()) {
      return { success: true }; // Skip settlement in offchain mode
    }

    try {
      // In hybrid mode, queue for batch settlement
      if (isHybridMode()) {
        this.unsettledPositions.add(position.id);
        await this.markPositionUnsettled(position.id);
        return { success: true }; // Queued successfully
      }

      // In onchain mode, settle immediately
      return await this.settleToContract('open', position);
    } catch (error) {
      logger.error('Failed to settle open position', {
        positionId: position.id,
        error,
      }, 'PerpSettlementService');

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Settle position closing to blockchain
   */
  static async settleClosePosition(
    position: PerpPosition
  ): Promise<SettlementResult> {
    if (!isOnChainEnabled()) {
      return { success: true }; // Skip settlement in offchain mode
    }

    try {
      // In hybrid mode, queue for batch settlement
      if (isHybridMode()) {
        this.unsettledPositions.add(position.id);
        await this.markPositionUnsettled(position.id);
        return { success: true }; // Queued successfully
      }

      // In onchain mode, settle immediately
      return await this.settleToContract('close', position);
    } catch (error) {
      logger.error('Failed to settle close position', {
        positionId: position.id,
        error,
      }, 'PerpSettlementService');

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Execute batch settlement (hybrid mode)
   */
  private static async executeBatchSettlement(): Promise<void> {
    if (!isHybridMode()) {
      return;
    }

    try {
      // Get unsettled positions from database
      const positions = await this.getUnsettledPositionsFromDb(
        PERP_CONFIG.hybridBatchSize
      );

      if (positions.length === 0) {
        logger.debug('No unsettled positions to settle', undefined, 'PerpSettlementService');
        return;
      }

      logger.info('Starting batch settlement', {
        count: positions.length,
      }, 'PerpSettlementService');

      // Settle each position
      const results = await Promise.allSettled(
        positions.map((pos) =>
          this.settleToContract(
            pos.closedAt ? 'close' : 'open',
            pos as unknown as PerpPosition
          )
        )
      );

      // Track successes and failures
      let successCount = 0;
      let failureCount = 0;

      results.forEach((result, index) => {
        const position = positions[index];
        if (!position) return;

        if (result.status === 'fulfilled' && result.value.success) {
          successCount++;
          this.unsettledPositions.delete(position.id);
          this.markPositionSettled(position.id, result.value.transactionHash);
        } else {
          failureCount++;
          logger.error('Position settlement failed', {
            positionId: position.id,
            error: result.status === 'rejected' ? result.reason : result.value.error,
          }, 'PerpSettlementService');
        }
      });

      logger.info('Batch settlement completed', {
        success: successCount,
        failed: failureCount,
        remainingInMemory: this.unsettledPositions.size,
      }, 'PerpSettlementService');
    } catch (error) {
      logger.error('Batch settlement failed', error, 'PerpSettlementService');
    }
  }

  /**
   * Settle to on-chain contract (implementation placeholder)
   */
  private static async settleToContract(
    action: 'open' | 'close',
    position: PerpPosition
  ): Promise<SettlementResult> {
    // TODO: Implement actual contract interaction
    // This will be completed when integrating with Diamond contracts

    logger.debug('Settling to contract (placeholder)', {
      action,
      positionId: position.id,
      ticker: position.ticker,
      size: position.size,
    }, 'PerpSettlementService');

    // For now, return success (will implement actual contract calls)
    return {
      success: true,
      transactionHash: '0x' + '0'.repeat(64), // Placeholder
    };

    /*
    // Future implementation:
    const diamondAddress = PERP_CONFIG.diamondAddress;
    if (!diamondAddress) {
      throw new Error('Diamond address not configured');
    }

    // Get contract instance
    const perpFacet = await getPerpetualMarketFacet(diamondAddress);

    if (action === 'open') {
      const tx = await perpFacet.openPosition(
        position.ticker,
        position.side === 'long',
        BigInt(Math.floor(position.size * 1e18)),
        position.leverage
      );
      const receipt = await tx.wait();
      return {
        success: true,
        transactionHash: receipt.transactionHash,
        gasUsed: receipt.gasUsed,
      };
    } else {
      const tx = await perpFacet.closePosition(position.id);
      const receipt = await tx.wait();
      return {
        success: true,
        transactionHash: receipt.transactionHash,
        gasUsed: receipt.gasUsed,
      };
    }
    */
  }

  /**
   * Mark position as unsettled in database
   */
  private static async markPositionUnsettled(positionId: string): Promise<void> {
    try {
      await prisma.perpPosition.update({
        where: { id: positionId },
        data: {
          settledToChain: false,
          settlementTxHash: null,
          settledAt: null,
          
        },
      });
    } catch (error) {
      logger.warn('Failed to mark position as unsettled', {
        positionId,
        error,
      }, 'PerpSettlementService');
    }
  }

  /**
   * Mark position as settled in database
   */
  private static async markPositionSettled(
    positionId: string,
    transactionHash?: string
  ): Promise<void> {
    try {
      await prisma.perpPosition.update({
        where: { id: positionId },
        data: {
          settledToChain: true,
          settlementTxHash: transactionHash || null,
          settledAt: new Date(),
        },
      });

      logger.info('Position marked as settled', {
        positionId,
        transactionHash,
      }, 'PerpSettlementService');
    } catch (error) {
      logger.warn('Failed to mark position as settled', {
        positionId,
        transactionHash,
        error,
      }, 'PerpSettlementService');
    }
  }

  /**
   * Get unsettled positions from database
   */
  private static async getUnsettledPositionsFromDb(limit: number): Promise<Array<{
    id: string;
    userId: string;
    ticker: string;
    side: string;
    size: number;
    leverage: number;
    entryPrice: number;
    closedAt: Date | null;
  }>> {
    return await prisma.perpPosition.findMany({
      where: {
        settledToChain: false,
      },
      take: limit,
      orderBy: {
        openedAt: 'asc',
      },
      select: {
        id: true,
        userId: true,
        ticker: true,
        side: true,
        size: true,
        leverage: true,
        entryPrice: true,
        closedAt: true,
      },
    });
  }

  /**
   * Get settlement stats
   */
  static async getSettlementStats(): Promise<{
    mode: string;
    unsettledCount: number;
    totalPositions: number;
    settlementRate: number;
  }> {
    const totalPositions = await prisma.perpPosition.count();
    const unsettledCount = await prisma.perpPosition.count({
      where: { settledToChain: false },
    });

    return {
      mode: PERP_CONFIG.settlementMode,
      unsettledCount,
      totalPositions,
      settlementRate: totalPositions > 0 ? ((totalPositions - unsettledCount) / totalPositions) * 100 : 100,
    };
  }
}

// Initialize service on module load (for hybrid mode)
if (typeof window === 'undefined') {
  // Server-side only
  PerpSettlementService.initialize();
}
