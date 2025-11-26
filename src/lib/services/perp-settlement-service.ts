/**
 * Perpetuals Settlement Service
 * 
 * @description Bridges off-chain trading engine with on-chain contracts for
 * perpetual futures positions. Supports multiple settlement modes for different
 * use cases.
 * 
 * Modes:
 * - offchain: No blockchain settlement (fast MVP)
 * - onchain: Every trade settles to blockchain (decentralized)
 * - hybrid: Periodic batch settlement (best of both worlds)
 */

import { logger } from '@/lib/logger';
import { db, perpPositions, eq, asc, count } from '@/db';
import { PERP_CONFIG, isOnChainEnabled, isHybridMode } from '@/lib/config/perp-modes';
import { createPublicClient, createWalletClient, http, type Address, type Hash } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

import type { PerpPosition } from '@/shared/perps-types';

// Type for partial position data needed for settlement
interface SettlementPosition {
  id: string
  userId: string
  ticker: string
  side: 'long' | 'short'
  size: number
  leverage: number
  entryPrice: number
  closedAt: Date | null
}

// Perpetual Market Facet ABI (minimal)
const PERP_FACET_ABI = [
  {
    name: 'openPosition',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_marketId', type: 'bytes32' },
      { name: '_side', type: 'uint8' },
      { name: '_size', type: 'uint256' },
      { name: '_collateral', type: 'uint256' },
      { name: '_maxPrice', type: 'uint256' }
    ],
    outputs: []
  },
  {
    name: 'closePosition',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_marketId', type: 'bytes32' }
    ],
    outputs: []
  }
] as const;

/**
 * Settlement result
 * 
 * @description Contains settlement operation result including success status,
 * transaction hash, error information, and gas usage.
 */
export interface SettlementResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
  gasUsed?: bigint;
}

/**
 * Perpetuals Settlement Service Class
 * 
 * @description Static service class for settling perpetual futures positions
 * to blockchain. Handles position opening/closing settlement and batch processing
 * for hybrid mode.
 */
export class PerpSettlementService {
  /**
   * Batch timer for hybrid mode periodic settlement
   * @private
   */
  private static batchTimer: NodeJS.Timeout | null = null;
  
  /**
   * Set of unsettled position IDs for hybrid mode
   * @private
   */
  private static unsettledPositions: Set<string> = new Set();

  /**
   * Initialize settlement service (for hybrid mode)
   * 
   * @description Initializes periodic batch settlement for hybrid mode.
   * Sets up interval timer to process unsettled positions periodically.
   * 
   * @returns {void}
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
   * 
   * @description Cleans up batch timer for hybrid mode. Should be called
   * on application shutdown.
   * 
   * @returns {void}
   */
  static shutdown(): void {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
  }

  /**
   * Settle position opening to blockchain
   * 
   * @description Settles a position opening to the blockchain. In offchain mode,
   * returns success immediately. In hybrid mode, queues for batch settlement.
   * In onchain mode, immediately settles to blockchain.
   * 
   * @param {PerpPosition} position - Position to settle
   * @returns {Promise<SettlementResult>} Settlement result
   */
  static async settleOpenPosition(
    position: PerpPosition
  ): Promise<SettlementResult> {
    if (!isOnChainEnabled()) {
      return { success: true }; // Skip settlement in offchain mode
    }

    // In hybrid mode, queue for batch settlement
    if (isHybridMode()) {
      this.unsettledPositions.add(position.id);
      await this.markPositionUnsettled(position.id);
      return { success: true }; // Queued successfully
    }

    // In onchain mode, settle immediately
    const settlementPos: SettlementPosition = {
      id: position.id,
      userId: position.userId,
      ticker: position.ticker,
      side: position.side as 'long' | 'short',
      size: Number(position.size),
      leverage: position.leverage,
      entryPrice: Number(position.entryPrice),
      closedAt: null,
    };
    return await this.settleToContract('open', settlementPos);
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

    // In hybrid mode, queue for batch settlement
    if (isHybridMode()) {
      this.unsettledPositions.add(position.id);
      await this.markPositionUnsettled(position.id);
      return { success: true }; // Queued successfully
    }

    // In onchain mode, settle immediately
    // For close operations, closedAt is set to current date
    const settlementPos: SettlementPosition = {
      id: position.id,
      userId: position.userId,
      ticker: position.ticker,
      side: position.side as 'long' | 'short',
      size: Number(position.size),
      leverage: position.leverage,
      entryPrice: Number(position.entryPrice),
      closedAt: new Date(), // Set to current date for close operation
    };
    return await this.settleToContract('close', settlementPos);
  }

  /**
   * Execute batch settlement (hybrid mode)
   */
  private static async executeBatchSettlement(): Promise<void> {
    if (!isHybridMode()) {
      return;
    }

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
          pos
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
  }

  /**
   * Settle to on-chain contract
   * 
   * Executes blockchain transaction to settle position on Diamond contract
   */
  private static async settleToContract(
    action: 'open' | 'close',
    position: SettlementPosition
  ): Promise<SettlementResult> {
    const diamondAddress = PERP_CONFIG.diamondAddress;
    if (!diamondAddress) {
      throw new Error('Diamond address not configured for on-chain settlement');
    }

    const privateKey = process.env.BABYLON_SETTLEMENT_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('BABYLON_SETTLEMENT_PRIVATE_KEY not configured for settlement');
    }

    const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || process.env.BASE_SEPOLIA_RPC_URL;
    if (!rpcUrl) {
      throw new Error('RPC_URL not configured for blockchain settlement');
    }

    logger.info('Settling position to blockchain', {
      action,
      positionId: position.id,
      ticker: position.ticker,
      size: position.size,
      diamondAddress
    }, 'PerpSettlementService');

    const account = privateKeyToAccount(privateKey as Address);
    
    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(rpcUrl)
    });

    const walletClient = createWalletClient({
      account,
      chain: baseSepolia,
      transport: http(rpcUrl)
    });

    // Generate market ID from ticker (keccak256 hash)
    const marketId = `0x${Buffer.from(position.ticker).toString('hex').padEnd(64, '0')}` as Hash;

    if (action === 'open') {
      // Convert position side to contract enum (0 = LONG, 1 = SHORT)
      const side = position.side.toUpperCase() === 'LONG' ? 0 : 1;
      
      // Convert sizes to wei (18 decimals)
      const sizeWei = BigInt(Math.floor(position.size * 1e18));
      const collateralWei = BigInt(Math.floor((position.size / position.leverage) * 1e18));
      
      // Max price for slippage protection (10% slippage allowed)
      const maxPriceWei = BigInt(Math.floor(position.entryPrice * 1.1 * 1e8));

      const hash = await walletClient.writeContract({
        address: diamondAddress as Address,
        abi: PERP_FACET_ABI,
        functionName: 'openPosition',
        args: [marketId, side, sizeWei, collateralWei, maxPriceWei],
        chain: baseSepolia
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      logger.info('Position opened on-chain', {
        positionId: position.id,
        transactionHash: receipt.transactionHash,
        gasUsed: receipt.gasUsed,
        status: receipt.status
      }, 'PerpSettlementService');

      return {
        success: receipt.status === 'success',
        transactionHash: receipt.transactionHash,
        gasUsed: receipt.gasUsed
      };
    } else {
      // Close position
      const hash = await walletClient.writeContract({
        address: diamondAddress as Address,
        abi: PERP_FACET_ABI,
        functionName: 'closePosition',
        args: [marketId],
        chain: baseSepolia
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      logger.info('Position closed on-chain', {
        positionId: position.id,
        transactionHash: receipt.transactionHash,
        gasUsed: receipt.gasUsed,
        status: receipt.status
      }, 'PerpSettlementService');

      return {
        success: receipt.status === 'success',
        transactionHash: receipt.transactionHash,
        gasUsed: receipt.gasUsed
      };
    }
  }

  /**
   * Mark position as unsettled in database
   */
  private static async markPositionUnsettled(positionId: string): Promise<void> {
    const result = await db.update(perpPositions)
      .set({
        settledToChain: false,
        settlementTxHash: null,
        settledAt: null,
      })
      .where(eq(perpPositions.id, positionId))
      .returning({ id: perpPositions.id });

    if (result.length === 0) {
      logger.debug(
        'Position not found during unsettle (may have been deleted)',
        { positionId },
        'PerpSettlementService'
      );
      // Position doesn't exist - remove from tracking
      this.unsettledPositions.delete(positionId);
    }
  }

  /**
   * Mark position as settled in database
   */
  private static async markPositionSettled(
    positionId: string,
    transactionHash?: string
  ): Promise<void> {
    const result = await db.update(perpPositions)
      .set({
        settledToChain: true,
        settlementTxHash: transactionHash ?? null,
        settledAt: new Date(),
      })
      .where(eq(perpPositions.id, positionId))
      .returning({ id: perpPositions.id });

    if (result.length === 0) {
      logger.debug(
        'Position not found during settle (may have been deleted)',
        { positionId, transactionHash },
        'PerpSettlementService'
      );
      // Position doesn't exist - remove from tracking
      this.unsettledPositions.delete(positionId);
      return;
    }

    logger.info('Position marked as settled', {
      positionId,
      transactionHash,
    }, 'PerpSettlementService');
  }

  /**
   * Get unsettled positions from database
   */
  private static async getUnsettledPositionsFromDb(limit: number): Promise<SettlementPosition[]> {
    const positions = await db.select({
      id: perpPositions.id,
      userId: perpPositions.userId,
      ticker: perpPositions.ticker,
      side: perpPositions.side,
      size: perpPositions.size,
      leverage: perpPositions.leverage,
      entryPrice: perpPositions.entryPrice,
      closedAt: perpPositions.closedAt,
    })
      .from(perpPositions)
      .where(eq(perpPositions.settledToChain, false))
      .limit(limit)
      .orderBy(asc(perpPositions.openedAt));

    return positions.map(p => ({
      id: p.id,
      userId: p.userId,
      ticker: p.ticker,
      side: p.side as 'long' | 'short',
      size: Number(p.size),
      leverage: Number(p.leverage),
      entryPrice: Number(p.entryPrice),
      closedAt: p.closedAt,
    }));
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
    const [totalResult, unsettledResult] = await Promise.all([
      db.select({ count: count() }).from(perpPositions),
      db.select({ count: count() })
        .from(perpPositions)
        .where(eq(perpPositions.settledToChain, false)),
    ]);

    const totalPositions = Number(totalResult[0]?.count ?? 0);
    const unsettledCount = Number(unsettledResult[0]?.count ?? 0);

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
