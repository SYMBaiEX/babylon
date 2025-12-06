/**
 * Perpetuals Service - Singleton wrapper for PerpetualsEngine
 *
 * Provides server-side access to perpetuals trading functionality
 */

import {
  and,
  db,
  eq,
  isNull,
  organizations as organizationsSchema,
  perpPositions,
  poolPositions,
} from '@babylon/db';
import { PerpetualsEngine } from './PerpetualsEngine';
import type { Organization } from './types/shared';

/**
 * Valid organization types for perp markets
 */
const VALID_ORG_TYPES = ['company', 'media', 'government'] as const;
type ValidOrgType = (typeof VALID_ORG_TYPES)[number];

/**
 * Type guard to check if organization type is valid for perp markets
 */
function isValidOrgType(type: string): type is ValidOrgType {
  return VALID_ORG_TYPES.includes(type as ValidOrgType);
}

let perpsEngineInstance: PerpetualsEngine | null = null;
let initializationPromise: Promise<void> | null = null;
let initializing = false;

/**
 * Get the singleton PerpetualsEngine instance.
 *
 * Lazily initializes the engine on first call. The engine can only be
 * instantiated on the server side (not in browser environments).
 *
 * @returns The singleton PerpetualsEngine instance
 * @throws Error if called in browser environment or if initialization is in progress
 */
export function getPerpsEngine(): PerpetualsEngine {
  if (typeof window !== 'undefined') {
    throw new Error(
      'PerpetualsEngine can only be instantiated on the server side'
    );
  }

  if (!perpsEngineInstance) {
    if (initializing) {
      throw new Error('PerpetualsEngine is being initialized elsewhere');
    }

    perpsEngineInstance = new PerpetualsEngine();
  }

  if (!initializationPromise) {
    initializationPromise = initializePerpsEngine();
  }

  return perpsEngineInstance;
}

/**
 * Ensure the PerpetualsEngine is initialized and ready.
 *
 * Waits for initialization to complete if it's in progress.
 * Creates a new instance if one doesn't exist.
 */
export async function ensurePerpsEngineReady(): Promise<void> {
  if (!perpsEngineInstance) {
    getPerpsEngine();
  }

  if (initializationPromise) {
    await initializationPromise;
  }
}

/**
 * Get the PerpetualsEngine instance, ensuring it's ready.
 *
 * Waits for initialization to complete before returning the instance.
 *
 * @returns The ready PerpetualsEngine instance
 */
export async function getReadyPerpsEngine(): Promise<PerpetualsEngine> {
  await ensurePerpsEngineReady();
  return getPerpsEngine();
}

/**
 * Execute a function with a ready PerpetualsEngine instance.
 *
 * Ensures the engine is initialized before executing the provided function.
 *
 * @param fn - Function to execute with the engine instance
 * @returns Result of the function execution
 */
export async function withPerpsEngine<T>(
  fn: (engine: PerpetualsEngine) => Promise<T> | T
): Promise<T> {
  const engine = await getReadyPerpsEngine();
  return await fn(engine);
}

async function initializePerpsEngine(): Promise<void> {
  if (!perpsEngineInstance) return;

  initializing = true;
  // Get organizations directly from database to avoid module initialization order issues
  const orgs = await db
    .select({
      id: organizationsSchema.id,
      name: organizationsSchema.name,
      ticker: organizationsSchema.ticker,
      description: organizationsSchema.description,
      type: organizationsSchema.type,
      canBeInvolved: organizationsSchema.canBeInvolved,
      initialPrice: organizationsSchema.initialPrice,
      currentPrice: organizationsSchema.currentPrice,
    })
    .from(organizationsSchema);
  const organizationsList: Organization[] = orgs
    .filter((o) => isValidOrgType(o.type))
    .map((o: (typeof orgs)[number]) => ({
      id: o.id,
      name: o.name,
      ticker: o.ticker ?? undefined,
      description: o.description,
      type: o.type as Organization['type'],
      canBeInvolved: o.canBeInvolved,
      initialPrice: o.initialPrice ?? undefined,
      currentPrice: o.currentPrice ?? undefined,
    }));
  perpsEngineInstance.initializeMarkets(organizationsList);

  // Hydrate user positions from perpPosition table
  const openUserPositions = await db
    .select()
    .from(perpPositions)
    .where(isNull(perpPositions.closedAt));

  // Also hydrate NPC pool positions (perp positions only)
  const openNPCPositions = await db
    .select()
    .from(poolPositions)
    .where(
      and(isNull(poolPositions.closedAt), eq(poolPositions.marketType, 'perp'))
    );

  const allPositions = [
    ...openUserPositions.map(
      (position: (typeof openUserPositions)[number]) => ({
        id: position.id,
        userId: position.userId,
        ticker: position.ticker,
        organizationId: position.organizationId,
        side: position.side as 'long' | 'short',
        entryPrice: Number(position.entryPrice),
        currentPrice: Number(position.currentPrice),
        size: Number(position.size),
        leverage: Number(position.leverage),
        liquidationPrice: Number(position.liquidationPrice),
        unrealizedPnL: Number(position.unrealizedPnL),
        unrealizedPnLPercent: Number(position.unrealizedPnLPercent),
        fundingPaid: Number(position.fundingPaid),
        openedAt: position.openedAt,
        lastUpdated: position.lastUpdated ?? position.openedAt,
      })
    ),
    ...openNPCPositions.map((position: (typeof openNPCPositions)[number]) => {
      // For NPC positions, we need to find the organizationId from the ticker
      // The ticker contains the organization ID
      const leverage = Number(position.leverage || 5);
      const entryPrice = Number(position.entryPrice);
      const side = position.side as 'long' | 'short';

      // Calculate liquidation price if not set (for long: 80% of entry, for short: 120% of entry)
      const liquidationPrice = position.liquidationPrice
        ? Number(position.liquidationPrice)
        : entryPrice * (side === 'long' ? 0.8 : 1.2);

      return {
        id: position.id,
        userId: position.poolId, // Use poolId as userId for NPC positions
        ticker: position.ticker!,
        organizationId: position.ticker!, // For NPC positions, ticker === organizationId
        side,
        entryPrice,
        currentPrice: Number(position.currentPrice),
        size: Number(position.size),
        leverage,
        liquidationPrice,
        unrealizedPnL: Number(position.unrealizedPnL),
        unrealizedPnLPercent: 0,
        fundingPaid: 0,
        openedAt: position.updatedAt,
        lastUpdated: position.updatedAt,
      };
    }),
  ];

  if (allPositions.length > 0) {
    perpsEngineInstance.hydrateOpenPositions(allPositions);
  }
  initializing = false;
}

/**
 * Perpetuals engine singleton access.
 *
 * Use {@link getPerpsEngine} to lazily initialize the engine when needed.
 * This prevents initialization during Next.js build processes.
 */
