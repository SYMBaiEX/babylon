/**
 * Verify that market percentage changes are displaying correctly
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function verifyMarketPercentages() {
  console.log('📊 Verifying Market Percentage Changes\n')
  console.log('=' .repeat(60))
  
  // Get all companies
  const companies = await prisma.organization.findMany({
    where: { type: 'company' },
    select: {
      id: true,
      name: true,
      currentPrice: true,
      initialPrice: true,
    },
    orderBy: { currentPrice: 'desc' }
  })
  
  const stats = {
    totalMarkets: 0,
    marketsWithHistory: 0,
    marketsWithChange: 0,
    totalChange: 0,
    positiveChanges: 0,
    negativeChanges: 0,
  }
  
  console.log('\nMarket Price Changes (24h):\n')
  
  for (const company of companies) {
    stats.totalMarkets++
    
    const currentPrice = company.currentPrice || company.initialPrice || 100
    
    // Get price from 24h ago
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const priceHistory = await prisma.stockPrice.findMany({
      where: {
        organizationId: company.id,
        timestamp: { gte: oneDayAgo },
      },
      orderBy: { timestamp: 'asc' },
      take: 1,
    })
    
    let changePercent24h = 0
    
    if (priceHistory.length > 0) {
      stats.marketsWithHistory++
      const oldestPrice = priceHistory[0]!.price
      const change24h = currentPrice - oldestPrice
      changePercent24h = (change24h / oldestPrice) * 100
      
      if (Math.abs(changePercent24h) > 0.01) {
        stats.marketsWithChange++
        stats.totalChange += changePercent24h
        
        if (changePercent24h > 0) {
          stats.positiveChanges++
        } else {
          stats.negativeChanges++
        }
      }
    }
    
    const sign = changePercent24h >= 0 ? '+' : ''
    const emoji = changePercent24h > 0 ? '📈' : changePercent24h < 0 ? '📉' : '➖'
    
    console.log(`${emoji} ${company.name.padEnd(25)} $${currentPrice.toFixed(2).padStart(10)}  ${sign}${changePercent24h.toFixed(2)}%`)
  }
  
  const avgChange = stats.marketsWithChange > 0 ? stats.totalChange / stats.marketsWithChange : 0
  
  console.log('\n' + '='.repeat(60))
  console.log('\n📊 Summary:')
  console.log(`   Total Markets: ${stats.totalMarkets}`)
  console.log(`   Markets with History: ${stats.marketsWithHistory}`)
  console.log(`   Markets with Changes: ${stats.marketsWithChange}`)
  console.log(`   Average Change: ${avgChange.toFixed(2)}%`)
  console.log(`   📈 Up: ${stats.positiveChanges}`)
  console.log(`   📉 Down: ${stats.negativeChanges}`)
  
  if (stats.marketsWithChange === 0) {
    console.log('\n❌ ERROR: No markets showing percentage changes!')
  } else if (stats.marketsWithChange < stats.totalMarkets * 0.8) {
    console.log(`\n⚠️  WARNING: Only ${((stats.marketsWithChange / stats.totalMarkets) * 100).toFixed(0)}% of markets showing changes`)
  } else {
    console.log('\n✅ SUCCESS: Markets are showing percentage changes!')
  }
  
  await prisma.$disconnect()
}

verifyMarketPercentages().catch(console.error)

