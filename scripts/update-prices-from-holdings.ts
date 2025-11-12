#!/usr/bin/env bun
/**
 * Manually trigger price updates from NPC holdings
 */

import { prisma } from '../src/lib/prisma';
import { db } from '../src/lib/database-service';

async function main() {
  console.log('📊 Updating prices from NPC holdings...\n');

  // Get all companies
  const companies = await prisma.organization.findMany({
    where: { type: 'company' },
    select: {
      id: true,
      name: true,
      currentPrice: true,
      initialPrice: true,
    },
  });

  // Get all open positions
  const allPositions = await prisma.poolPosition.findMany({
    where: {
      marketType: 'perp',
      closedAt: null,
      ticker: { not: null },
    },
    select: {
      ticker: true,
      side: true,
      size: true,
    },
  });

  // Map holdings by ticker
  const holdingsByTicker = new Map<string, number>();
  for (const pos of allPositions) {
    if (!pos.ticker) continue;
    const current = holdingsByTicker.get(pos.ticker) || 0;
    const delta = pos.side === 'long' ? pos.size : -pos.size;
    holdingsByTicker.set(pos.ticker, current + delta);
  }

  console.log(`Found ${holdingsByTicker.size} tickers with holdings\n`);

  // Update prices
  const companyMap = new Map(
    companies.map(c => [c.id.toUpperCase().replace(/-/g, ''), c])
  );

  let updated = 0;
  for (const [ticker, netHoldings] of holdingsByTicker) {
    const company = companyMap.get(ticker);
    if (!company) {
      console.log(`⚠️  No company found for ticker ${ticker}`);
      continue;
    }

    const initialPrice = company.initialPrice || 100;
    const currentPrice = company.currentPrice || initialPrice;
    
    // Holdings-based pricing
    const syntheticSupply = 10000;
    const baseMarketCap = initialPrice * syntheticSupply;
    const rawPrice = (baseMarketCap + netHoldings) / syntheticSupply;
    
    // Apply safety limits
    const minPrice = initialPrice * 0.1;
    const maxPrice = currentPrice * 2.0;
    const newPrice = Math.max(minPrice, Math.min(rawPrice, maxPrice));
    
    const change = newPrice - currentPrice;
    const changePercent = currentPrice > 0 ? (change / currentPrice) * 100 : 0;

    if (Math.abs(change) < 0.01) {
      console.log(`${company.name} (${ticker}): $${currentPrice.toFixed(2)} (no change, holdings: $${netHoldings.toFixed(0)})`);
      continue;
    }

    // Update database
    await prisma.organization.update({
      where: { id: company.id },
      data: { currentPrice: newPrice },
    });

    await db.recordPriceUpdate(company.id, newPrice, change, changePercent);

    console.log(`✅ ${company.name} (${ticker}): $${currentPrice.toFixed(2)} → $${newPrice.toFixed(2)} (${changePercent > 0 ? '+' : ''}${changePercent.toFixed(2)}%)`);
    console.log(`   Holdings: $${netHoldings.toFixed(0)}, Market cap: $${(newPrice * syntheticSupply).toFixed(0)}`);
    updated++;
  }

  console.log(`\n📈 Updated ${updated} prices\n`);

  await prisma.$disconnect();
}

main();

