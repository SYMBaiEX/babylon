#!/usr/bin/env bun
/**
 * Sync perp positions with current spot prices
 */

import { prisma } from '../src/lib/prisma';
import { PoolPerformanceService } from '../src/lib/pool-performance-service';

async function main() {
  console.log('🔄 Syncing perp positions with spot prices...\n');

  // Get all active pools
  const pools = await prisma.pool.findMany({
    where: { isActive: true },
    select: { id: true, Actor: { select: { name: true } } },
  });

  console.log(`Found ${pools.length} active pools\n`);

  // Update each pool
  for (const pool of pools) {
    console.log(`Updating ${pool.Actor?.name || 'Unknown'}...`);
    await PoolPerformanceService.updatePoolPerformance(pool.id);
  }

  console.log('\n✅ All pools synced\n');

  // Show updated positions
  const positions = await prisma.poolPosition.findMany({
    where: { closedAt: null },
    include: {
      Pool: {
        include: {
          Actor: { select: { name: true } },
        },
      },
    },
    take: 5,
  });

  console.log('Updated positions:');
  for (const pos of positions.slice(0, 3)) {
    const npcName = pos.Pool.Actor?.name || 'Unknown';
    const pnlPercent = pos.size > 0 ? (pos.unrealizedPnL / pos.size) * 100 : 0;

    console.log(`  ${npcName} - ${pos.ticker} ${pos.side}:`);
    console.log(`    Entry: $${pos.entryPrice.toFixed(2)}, Current: $${pos.currentPrice.toFixed(2)}`);
    console.log(`    Unrealized P&L: $${pos.unrealizedPnL.toFixed(2)} (${pnlPercent > 0 ? '+' : ''}${pnlPercent.toFixed(2)}%)\n`);
  }

  await prisma.$disconnect();
}

main();

