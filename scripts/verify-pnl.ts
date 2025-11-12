#!/usr/bin/env bun
/**
 * Verify P&L calculations are correct
 */

import { prisma } from '../src/lib/prisma';

async function main() {
  console.log('💰 VERIFYING P&L CALCULATIONS\n');

  // 1. Check price history was created
  console.log('1. Checking price history...');
  const priceRecords = await prisma.stockPrice.findMany({
    orderBy: { timestamp: 'desc' },
    take: 5,
    select: {
      organizationId: true,
      price: true,
      change: true,
      changePercent: true,
      timestamp: true,
      Organization: {
        select: { name: true },
      },
    },
  });

  if (priceRecords.length > 0) {
    console.log(`   ✅ Found ${priceRecords.length} price records:`);
    priceRecords.forEach(r => {
      console.log(`   ${r.Organization.name}: $${r.price.toFixed(2)} (${r.changePercent > 0 ? '+' : ''}${r.changePercent.toFixed(2)}%) at ${new Date(r.timestamp).toLocaleTimeString()}`);
    });
    console.log('');
  } else {
    console.log(`   ⚠️  No price history records\n`);
  }

  // 2. Check NPC pool positions and P&L
  console.log('2. Checking NPC position P&L...');
  const positions = await prisma.poolPosition.findMany({
    where: { closedAt: null },
    include: {
      Pool: {
        include: {
          Actor: {
            select: { name: true },
          },
        },
      },
    },
    take: 5,
  });

  if (positions.length > 0) {
    console.log(`   Found ${positions.length} open positions\n`);
    
    for (const pos of positions.slice(0, 3)) {
      const npcName = pos.Pool.Actor?.name || 'Unknown';
      const entryPrice = pos.entryPrice;
      const currentPrice = pos.currentPrice;
      const size = pos.size;
      const unrealizedPnL = pos.unrealizedPnL;

      // Manually calculate expected P&L
      const percentChange = (currentPrice - entryPrice) / entryPrice;
      const expectedPnL = percentChange * size * (pos.side === 'long' ? 1 : -1);

      console.log(`   ${npcName} - ${pos.ticker} ${pos.side}:`);
      console.log(`     Entry: $${entryPrice.toFixed(2)}, Current: $${currentPrice.toFixed(2)}`);
      console.log(`     Size: $${size.toFixed(0)}, Leverage: ${pos.leverage}x`);
      console.log(`     Unrealized P&L: $${unrealizedPnL.toFixed(2)}`);
      console.log(`     Expected P&L: $${expectedPnL.toFixed(2)}`);
      
      const pnlDiff = Math.abs(unrealizedPnL - expectedPnL);
      if (pnlDiff < 1.0) {
        console.log(`     ✅ P&L correct\n`);
      } else {
        console.log(`     ❌ P&L mismatch: ${pnlDiff.toFixed(2)} difference\n`);
      }
    }
  } else {
    console.log(`   ⚠️  No open positions\n`);
  }

  // 3. Check pool total values
  console.log('3. Checking pool valuations...');
  const pools = await prisma.pool.findMany({
    where: { isActive: true },
    include: {
      Actor: { select: { name: true } },
      PoolPosition: { where: { closedAt: null } },
    },
    take: 3,
  });

  for (const pool of pools) {
    const availableBalance = Number(pool.availableBalance);
    const totalDeposits = Number(pool.totalDeposits);
    const lifetimePnL = Number(pool.lifetimePnL);
    const totalValue = Number(pool.totalValue);

    const positionsValue = pool.PoolPosition.reduce((sum, pos) => {
      return sum + pos.size + pos.unrealizedPnL;
    }, 0);

    const calculatedTotalValue = availableBalance + positionsValue;

    console.log(`   ${pool.Actor?.name}:`);
    console.log(`     Available: $${availableBalance.toFixed(0)}`);
    console.log(`     Positions value: $${positionsValue.toFixed(0)}`);
    console.log(`     Total value (stored): $${totalValue.toFixed(0)}`);
    console.log(`     Total value (calculated): $${calculatedTotalValue.toFixed(0)}`);
    console.log(`     Lifetime P&L: $${lifetimePnL.toFixed(0)}\n`);
  }

  console.log('═══════════════════════════════════════');
  console.log('✅ P&L VERIFICATION COMPLETE');
  console.log('═══════════════════════════════════════\n');

  await prisma.$disconnect();
}

main();

