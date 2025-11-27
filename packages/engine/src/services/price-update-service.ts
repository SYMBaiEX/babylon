import {
  createPublicClient,
  createWalletClient,
  encodePacked,
  http,
  keccak256,
  parseAbi,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { CHAIN } from '@babylon/shared';
import { db, eq, getDbInstance, organizations } from '@babylon/db';
import { isOnChainEnabled } from '@babylon/shared';
import { logger } from '@babylon/shared';
import { getReadyPerpsEngine } from '@babylon/engine';
import { broadcastToChannel } from '@babylon/api';
import { PRICE_STORAGE_FACET_ABI } from '@babylon/shared';
import type { JsonValue } from '@babylon/api';

export type PriceUpdateSource = 'user_trade' | 'npc_trade' | 'event' | 'system';

export interface PriceUpdateInput {
  organizationId: string;
  newPrice: number;
  source: PriceUpdateSource;
  reason?: string;
  metadata?: Record<string, JsonValue>;
}

export interface AppliedPriceUpdate {
  organizationId: string;
  oldPrice: number;
  newPrice: number;
  change: number;
  changePercent: number;
  source: PriceUpdateSource;
  reason?: string;
  metadata?: Record<string, JsonValue>;
  timestamp: string;
}

/**
 * Derive perpetual market ID from organization ID
 * Market IDs are keccak256(symbol + timestamp + blockNumber) in contract,
 * but for price storage we use a deterministic hash based on symbol
 */
function deriveMarketId(organizationId: string): `0x${string}` {
  // Convert organization ID to ticker symbol (e.g., "ORG-123" -> "ORG123PERP")
  const ticker = organizationId.toUpperCase().replace(/-/g, '') + 'PERP';
  // Use deterministic hash (without timestamp/block for consistency)
  // In production, you may want to store actual market IDs when markets are created
  return keccak256(encodePacked(['string'], [ticker]));
}

/**
 * Convert price to Chainlink format (8 decimals)
 */
function toChainlinkFormat(price: number): bigint {
  return BigInt(Math.round(price * 1e8));
}

export class PriceUpdateService {
  /**
   * Apply a batch of price updates, ensuring persistence + engine sync + SSE broadcast + on-chain storage
   */
  static async applyUpdates(
    updates: PriceUpdateInput[]
  ): Promise<AppliedPriceUpdate[]> {
    if (updates.length === 0) return [];

    const perpsEngine = await getReadyPerpsEngine();

    const appliedUpdates: AppliedPriceUpdate[] = [];
    const priceMap = new Map<string, number>();

    for (const update of updates) {
      if (!Number.isFinite(update.newPrice) || update.newPrice <= 0) {
        logger.warn(
          'Skipping invalid price update',
          { update },
          'PriceUpdateService'
        );
        continue;
      }

      const [organization] = await db
        .select({
          id: organizations.id,
          currentPrice: organizations.currentPrice,
        })
        .from(organizations)
        .where(eq(organizations.id, update.organizationId))
        .limit(1);

      if (!organization) {
        logger.warn(
          'Organization not found for price update',
          { organizationId: update.organizationId },
          'PriceUpdateService'
        );
        continue;
      }

      const oldPrice = Number(organization.currentPrice ?? update.newPrice);
      const change = update.newPrice - oldPrice;
      const changePercent = oldPrice === 0 ? 0 : (change / oldPrice) * 100;

      await db
        .update(organizations)
        .set({ currentPrice: update.newPrice, updatedAt: new Date() })
        .where(eq(organizations.id, organization.id));

      await getDbInstance().recordPriceUpdate(
        organization.id,
        update.newPrice,
        change,
        changePercent
      );

      priceMap.set(organization.id, update.newPrice);
      appliedUpdates.push({
        organizationId: organization.id,
        oldPrice,
        newPrice: update.newPrice,
        change,
        changePercent,
        source: update.source,
        reason: update.reason,
        metadata: update.metadata,
        timestamp: new Date().toISOString(),
      });
    }

    if (priceMap.size > 0) {
      perpsEngine.updatePositions(priceMap);

      // Write prices to blockchain
      await PriceUpdateService.writePricesToChain(appliedUpdates);

      // AppliedPriceUpdate[] is compatible with JsonValue (array of plain objects with JsonValue fields)
      // Convert through JSON serialization for type safety
      broadcastToChannel('markets', {
        type: 'price_update',
        updates: JSON.parse(JSON.stringify(appliedUpdates)) as JsonValue,
      });

      logger.info(
        `Applied ${appliedUpdates.length} organization price updates`,
        { count: appliedUpdates.length },
        'PriceUpdateService'
      );
    }

    return appliedUpdates;
  }

  /**
   * Write prices to blockchain using PriceStorageFacet
   * Only writes when on-chain settlement mode is enabled
   */
  private static async writePricesToChain(
    updates: AppliedPriceUpdate[]
  ): Promise<void> {
    // Check if on-chain mode is enabled via configuration
    if (!isOnChainEnabled()) {
      logger.debug(
        'Skipping on-chain price update - off-chain mode configured',
        undefined,
        'PriceUpdateService'
      );
      return;
    }

    const { getContractAddresses, getRpcUrl } = await import(
      '@babylon/contracts/deployment'
    );
    const { diamond: diamondAddress } = getContractAddresses();
    const deployerPrivateKey = process.env
      .DEPLOYER_PRIVATE_KEY as `0x${string}`;
    const rpcUrl = getRpcUrl();

    if (!diamondAddress || !deployerPrivateKey || !rpcUrl) {
      logger.debug(
        'Skipping on-chain price update - missing configuration',
        {
          hasDiamond: !!diamondAddress,
          hasKey: !!deployerPrivateKey,
          hasRpc: !!rpcUrl,
        },
        'PriceUpdateService'
      );
      return;
    }

    logger.info(
      'Publishing prices to blockchain',
      {
        network: getContractAddresses().network,
        diamond: diamondAddress,
        rpcUrl,
        count: updates.length,
      },
      'PriceUpdateService'
    );

    const publicClient = createPublicClient({
      chain: CHAIN,
      transport: http(rpcUrl),
    });

    const account = privateKeyToAccount(deployerPrivateKey);
    const walletClient = createWalletClient({
      account,
      chain: CHAIN,
      transport: http(rpcUrl),
    });

    // Get current tick counter with fallback
    let currentTick: bigint;
    try {
      currentTick = (await publicClient.readContract({
        address: diamondAddress,
        abi: parseAbi(PRICE_STORAGE_FACET_ABI),
        functionName: 'getGlobalTickCounter',
      })) as bigint;
    } catch (error) {
      logger.warn(
        'Failed to get tick counter, using timestamp-based tick',
        { error },
        'PriceUpdateService'
      );
      // Fallback: use timestamp-based tick
      currentTick = BigInt(Math.floor(Date.now() / 1000));
    }

    // Prepare market IDs and prices
    const marketIds: `0x${string}`[] = [];
    const prices: bigint[] = [];

    for (const update of updates) {
      const marketId = deriveMarketId(update.organizationId);
      const price = toChainlinkFormat(update.newPrice);
      marketIds.push(marketId);
      prices.push(price);
    }

    // Batch update prices
    const txHash = await walletClient.writeContract({
      address: diamondAddress,
      abi: parseAbi(PRICE_STORAGE_FACET_ABI),
      functionName: 'updatePrices',
      args: [marketIds, currentTick, prices],
    });

    // Wait for confirmation
    await publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 1,
    });

    logger.info(
      `Successfully wrote ${updates.length} prices to chain`,
      { txHash, tick: currentTick.toString(), count: updates.length },
      'PriceUpdateService'
    );
  }
}
