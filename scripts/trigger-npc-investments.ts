#!/usr/bin/env bun
/**
 * Manually trigger NPC baseline investments
 */

import { NPCInvestmentManager } from '../src/lib/npc/npc-investment-manager';
import { prisma } from '../src/lib/prisma';

async function main() {
  console.log('🚀 Triggering NPC baseline investments...\n');

  const result = await NPCInvestmentManager.executeBaselineInvestments(new Date());

  if (!result) {
    console.log('⚠️  No baseline investments needed (pools already have positions)\n');
  } else {
    console.log(`✅ Baseline investments executed:`);
    console.log(`   Successful trades: ${result.successfulTrades}`);
    console.log(`   Failed trades: ${result.failedTrades}`);
    console.log(`   Hold decisions: ${result.holdDecisions}`);
    console.log(`   Perp volume: $${result.totalVolumePerp.toFixed(0)}`);
    console.log(`   Prediction volume: $${result.totalVolumePrediction.toFixed(0)}\n`);

    // Check final state
    const positions = await prisma.poolPosition.findMany({
      where: { closedAt: null },
      select: {
        ticker: true,
        side: true,
        size: true,
      },
    });

    const byTicker = new Map<string, { long: number; short: number }>();
    positions.forEach(pos => {
      if (!pos.ticker) return;
      const current = byTicker.get(pos.ticker) || { long: 0, short: 0 };
      if (pos.side === 'long') {
        current.long += pos.size;
      } else {
        current.short += pos.size;
      }
      byTicker.set(pos.ticker, current);
    });

    console.log('Holdings by ticker:');
    Array.from(byTicker.entries())
      .sort((a, b) => (b[1].long - b[1].short) - (a[1].long - a[1].short))
      .forEach(([ticker, holdings]) => {
        const net = holdings.long - holdings.short;
        console.log(`   ${ticker}: $${holdings.long.toFixed(0)} long, $${holdings.short.toFixed(0)} short = $${net.toFixed(0)} net`);
      });
  }

  await prisma.$disconnect();
}

main();

