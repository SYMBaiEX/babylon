#!/usr/bin/env bun
/**
 * Create a test NPC trade to verify admin panel
 */

import { prisma } from '../src/lib/database-service'

async function main() {
  console.log('🔧 Creating test NPC trade...\n')
  
  // Find an NPC with a pool
  const actor = await prisma.actor.findFirst({
    where: { hasPool: true },
    include: { pools: { where: { isActive: true }, take: 1 } }
  })
  
  if (!actor || !actor.pools[0]) {
    console.log('❌ No actor with pool found')
    console.log('Run: bun run scripts/init-pools.ts')
    return
  }
  
  console.log(`Found NPC: ${actor.name}`)
  console.log(`Pool: ${actor.pools[0].name}\n`)
  
  // Create a test NPC trade
  const trade = await prisma.nPCTrade.create({
    data: {
      npcActorId: actor.id,
      poolId: actor.pools[0].id,
      marketType: 'perp',
      ticker: 'BTC',
      action: 'open_long',
      side: 'long',
      amount: 1000,
      price: 50000,
      sentiment: 0.7,
      reason: 'Test trade to verify admin panel displays trades correctly',
      executedAt: new Date(),
    }
  })
  
  console.log(`✅ Created test trade: ${trade.id}`)
  console.log(`   ${actor.name}: LONG BTC $1,000 @ $50,000`)
  console.log(`   Sentiment: 0.7 (bullish)`)
  console.log(`   Reason: ${trade.reason}\n`)
  
  // Create a few more varied trades
  const trades = await Promise.all([
    prisma.nPCTrade.create({
      data: {
        npcActorId: actor.id,
        poolId: actor.pools[0].id,
        marketType: 'perp',
        ticker: 'ETH',
        action: 'open_short',
        side: 'short',
        amount: 500,
        price: 3000,
        sentiment: -0.3,
        reason: 'Expecting consolidation, short-term bearish',
        executedAt: new Date(Date.now() - 120000), // 2 min ago
      }
    }),
    prisma.nPCTrade.create({
      data: {
        npcActorId: actor.id,
        poolId: actor.pools[0].id,
        marketType: 'prediction',
        marketId: '1',
        action: 'buy_yes',
        side: 'YES',
        amount: 50,
        price: 0.65,
        sentiment: 0.8,
        reason: 'Strong fundamentals suggest positive outcome',
        executedAt: new Date(Date.now() - 300000), // 5 min ago
      }
    })
  ])
  
  console.log(`✅ Created ${trades.length} additional test trades`)
  console.log('\n🎉 Test trades created! Check admin panel → Trading Feed')
  
  await prisma.$disconnect()
}

main().catch((error) => {
  console.error('❌ Error:', error)
  process.exit(1)
})

