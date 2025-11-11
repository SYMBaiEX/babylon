import { db } from '@/lib/database-service';
import { logger } from '@/lib/logger';
import { ensurePerpsEngineReady, getPerpsEngine } from '@/lib/perps-service';
import { prisma } from '@/lib/prisma';
import { broadcastToChannel } from '@/lib/sse/event-broadcaster';

import {
  type TradeImpactInput,
  aggregateTradeImpacts,
} from './market-impact-service';

interface OrganizationTicker {
  id: string;
  ticker: string;
  currentPrice: number | null;
  initialPrice: number | null;
}

async function buildTickerMap(): Promise<Map<string, OrganizationTicker>> {
  const organizations = await prisma.organization.findMany({
    where: { type: 'company' },
    select: {
      id: true,
      currentPrice: true,
      initialPrice: true,
    },
  });

  return new Map<string, OrganizationTicker>(
    organizations
      .map((org) => ({
        id: org.id,
        currentPrice: org.currentPrice,
        initialPrice: org.initialPrice,
        ticker: org.id.toUpperCase().replace(/-/g, ''),
      }))
      .map((entry) => [entry.ticker, entry])
  );
}

/**
 * Apply price impacts for user-generated perp trades.
 * Mirrors the logic used by GameEngine for NPC trades.
 */
export async function applyPerpTradeImpacts(
  trades: TradeImpactInput[]
): Promise<void> {
  if (trades.length === 0) return;

  const perpTrades = trades.filter(
    (trade) => trade.marketType === 'perp' && trade.ticker
  );
  if (perpTrades.length === 0) return;

  const impacts = aggregateTradeImpacts(perpTrades);
  const tickerMap = await buildTickerMap();
  await ensurePerpsEngineReady();
  const perpsEngine = getPerpsEngine();
  const priceUpdateMap = new Map<string, number>();

  for (const [rawTicker, impact] of impacts) {
    if (!rawTicker) continue;
    const ticker = rawTicker.toUpperCase();
    const orgEntry = tickerMap.get(ticker);
    if (!orgEntry) {
      logger.warn(
        `applyPerpTradeImpacts: no organization for ticker ${ticker}`
      );
      continue;
    }

    const totalVolume = impact.longVolume + impact.shortVolume;
    if (totalVolume === 0) continue;

    const currentPrice = orgEntry.currentPrice ?? orgEntry.initialPrice ?? 100;
    const volumeImpact = Math.min(totalVolume / 10000, 0.05); // cap impact at 5%
    const priceChange = impact.netSentiment * volumeImpact;

    if (priceChange === 0) continue;

    const newPrice = Number((currentPrice * (1 + priceChange)).toFixed(2));
    if (!Number.isFinite(newPrice) || newPrice <= 0) continue;

    const change = newPrice - currentPrice;
    const changePercent = (change / currentPrice) * 100;

    await prisma.organization.update({
      where: { id: orgEntry.id },
      data: { currentPrice: newPrice },
    });

    await db.recordPriceUpdate(orgEntry.id, newPrice, change, changePercent);
    priceUpdateMap.set(orgEntry.id, newPrice);

    try {
      broadcastToChannel('markets', {
        type: 'perp_price_update',
        ticker,
        price: newPrice,
        changePercent,
        source: 'user_trade',
      });
    } catch (error) {
      logger.debug('applyPerpTradeImpacts: SSE broadcast failed', { error });
    }

    logger.info(
      'Perp price updated from user trade',
      {
        ticker: ticker,
        organizationId: orgEntry.id,
        newPrice,
        changePercent,
        volume: totalVolume,
      },
      'PerpPriceImpact'
    );
  }

  if (priceUpdateMap.size > 0) {
    perpsEngine.updatePositions(priceUpdateMap);
  }
}
