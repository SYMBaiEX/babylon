import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

import {
  type TradeImpactInput,
  aggregateTradeImpacts,
} from './market-impact-service';
import {
  type PriceUpdateInput,
  PriceUpdateService,
} from './price-update-service';

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
      ticker: true,
      currentPrice: true,
      initialPrice: true,
    },
  });

  // Map both raw org IDs and tickers to handle both formats
  const map = new Map<string, OrganizationTicker>();
  
  for (const org of organizations) {
    const ticker = org.ticker || org.id.toUpperCase().replace(/-/g, '');
    const entry = {
      id: org.id,
      currentPrice: org.currentPrice,
      initialPrice: org.initialPrice,
      ticker,
    };
    
    // Add mapping for org ID
    map.set(org.id, entry);
    
    // Add mapping for ticker (primary way to reference)
    map.set(ticker, entry);
    
    // Also add mapping for transformed ticker for backwards compatibility
    const transformedTicker = org.id.toUpperCase().replace(/-/g, '');
    if (transformedTicker !== ticker) {
      map.set(transformedTicker, entry);
    }
  }
  
  return map;
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
  const priceUpdates: PriceUpdateInput[] = [];

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

    priceUpdates.push({
      organizationId: orgEntry.id,
      newPrice,
      source: 'user_trade',
      reason: `User perp trades on ${ticker}`,
      metadata: {
        ticker,
        changePercent: (priceChange * 100).toFixed(4),
        totalVolume,
        netSentiment: impact.netSentiment,
      },
    });
  }

  if (priceUpdates.length > 0) {
    await PriceUpdateService.applyUpdates(priceUpdates);
  }
}
