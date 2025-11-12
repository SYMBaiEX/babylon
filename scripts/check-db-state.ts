#!/usr/bin/env bun
import { prisma } from '../src/lib/prisma';

async function main() {
  console.log('\n=== DATABASE STATE ===\n');

  const [questions, markets, actors, pools] = await Promise.all([
    prisma.question.count({ where: { status: 'active' } }),
    prisma.market.count({ where: { resolved: false } }),
    prisma.actor.count({ where: { hasPool: true } }),
    prisma.pool.count({ where: { isActive: true } }),
  ]);

  console.log(`Active Questions: ${questions}`);
  console.log(`Active Markets: ${markets}`);
  console.log(`Actors with Pools: ${actors}`);
  console.log(`Active Pools: ${pools}\n`);

  if (actors > 0 && pools > 0) {
    const samplePools = await prisma.pool.findMany({
      take: 3,
      include: {
        Actor: { select: { name: true } },
        PoolPosition: { where: { closedAt: null } },
      },
    });

    console.log('Sample Pools:');
    samplePools.forEach(p => {
      console.log(`  ${p.Actor?.name}: $${Number(p.availableBalance).toFixed(0)} available, ${p.PoolPosition.length} positions`);
    });
  }

  await prisma.$disconnect();
}

main();

