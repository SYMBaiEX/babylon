/**
 * Perpetuals Service - Singleton wrapper for PerpetualsEngine
 *
 * Provides server-side access to perpetuals trading functionality
 */
import { PerpetualsEngine } from '@/engine/PerpetualsEngine';
import type { Organization } from '@/shared/types';

import { db } from './database-service';
import { logger } from './logger';
import { prisma } from './prisma';

let perpsEngineInstance: PerpetualsEngine | null = null;
let initializationPromise: Promise<void> | null = null;
let initializing = false;

export function getPerpsEngine(): PerpetualsEngine {
  // Only instantiate on server side
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
    initializationPromise = initializePerpsEngine().catch((error) => {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(
        'Failed to initialize PerpetualsEngine',
        { error: errorMessage },
        'PerpsService'
      );
      initializationPromise = null;
      throw error;
    });
  }

  return perpsEngineInstance;
}

export async function ensurePerpsEngineReady(): Promise<void> {
  if (!perpsEngineInstance) {
    getPerpsEngine();
  }

  if (initializationPromise) {
    await initializationPromise;
  }
}

export async function getReadyPerpsEngine(): Promise<PerpetualsEngine> {
  await ensurePerpsEngineReady();
  return getPerpsEngine();
}

export async function withPerpsEngine<T>(
  fn: (engine: PerpetualsEngine) => Promise<T> | T
): Promise<T> {
  const engine = await getReadyPerpsEngine();
  return await fn(engine);
}

async function initializePerpsEngine(): Promise<void> {
  if (!perpsEngineInstance) return;

  initializing = true;
  try {
    const organizations = (await db.getAllOrganizations()) as Organization[];
    perpsEngineInstance.initializeMarkets(organizations);

    // Hydrate user positions
    const openPositions = await prisma.perpPosition.findMany({
      where: { closedAt: null },
    });

    if (openPositions.length > 0) {
      perpsEngineInstance.hydrateOpenPositions(
        openPositions.map((position) => ({
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
        }))
      );
    }
  } finally {
    initializing = false;
  }
}

// NOTE: Singleton export removed to prevent initialization during Next.js build
// Use getPerpsEngine() function instead to lazily initialize when needed
