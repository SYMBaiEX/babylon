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
let initializationPromise: Promise | null = null;

export function getPerpsEngine(): PerpetualsEngine {
  // Only instantiate on server side
  if (typeof window !== 'undefined') {
    throw new Error(
      'PerpetualsEngine can only be instantiated on the server side'
    );
  }

  if (!perpsEngineInstance) {
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

export async function ensurePerpsEngineReady(): Promise {
  if (!perpsEngineInstance) {
    getPerpsEngine();
  }

  if (initializationPromise) {
    await initializationPromise;
  }
}

async function initializePerpsEngine() {
  if (!perpsEngineInstance) return;

  const organizations = (await db.getAllOrganizations()) as Organization[];
  perpsEngineInstance.initializeMarkets(organizations);

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
        side: position.side,
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
}

// NOTE: Singleton export removed to prevent initialization during Next.js build
// Use getPerpsEngine() function instead to lazily initialize when needed
