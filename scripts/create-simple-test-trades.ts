#!/usr/bin/env bun
/**
 * Create simple test NPC trades for the admin panel
 */

import { prisma } from '../src/lib/database-service'
import { generateSnowflakeId } from '../src/lib/snowflake'

async function main() {
  console.log('🔧 Creating test NPC trades...\n')
  
  // Find any actors
  const actors = await prisma.actor.findMany({ take: 5 })
  
  if (actors.length === 0) {
    console.log('❌ No actors found in database')
    console.log('Run: bun run prisma/seed.ts')
    return
  }
  
  console.log(`Found ${actors.length} actors\n`)
  
  // Create test trades for each actor
  const trades = []
  
  for (const actor of actors) {
    // Create a few trades per actor
    const actorTrades = await Promise.all([
      prisma.nPCTrade.create({
        data: {
          id: generateSnowflakeId(),
          npcActorId: actor.id,
          marketType: 'perp',
          ticker: 'BTC',
          action: 'open_long',
          side: 'long',
          amount: 1000 + Math.random() * 5000,
          price: 45000 + Math.random() * 10000,
          sentiment: 0.5 + Math.random() * 0.5,
          reason: 'Strong technical breakout, expecting continued momentum',
          executedAt: new Date(Date.now() - Math.random() * 3600000), // Random time in last hour
        }
      }),
      prisma.nPCTrade.create({
        data: {
          id: generateSnowflakeId(),
          npcActorId: actor.id,
          marketType: 'perp',
          ticker: 'ETH',
          action: 'open_short',
          side: 'short',
          amount: 500 + Math.random() * 2000,
          price: 2800 + Math.random() * 500,
          sentiment: -(0.2 + Math.random() * 0.4),
          reason: 'Overbought conditions, taking profits',
          executedAt: new Date(Date.now() - Math.random() * 3600000),
        }
      }),
      prisma.nPCTrade.create({
        data: {
          id: generateSnowflakeId(),
          npcActorId: actor.id,
          marketType: 'perp',
          ticker: 'SOL',
          action: 'open_long',
          side: 'long',
          amount: 200 + Math.random() * 800,
          price: 100 + Math.random() * 50,
          sentiment: 0.3 + Math.random() * 0.5,
          reason: 'Ecosystem growth looking strong',
          executedAt: new Date(Date.now() - Math.random() * 7200000), // Random time in last 2 hours
        }
      }),
    ])
    
    trades.push(...actorTrades)
    console.log(`✅ Created 3 trades for ${actor.name}`)
  }
  
  console.log(`\n🎉 Created ${trades.length} test trades!`)
  console.log('Check admin panel → Trading Feed to see them\n')
  
  await prisma.$disconnect()
}

main().catch((error) => {
  console.error('❌ Error:', error)
  process.exit(1)
})

