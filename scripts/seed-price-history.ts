/**
 * Seed price history by manually creating StockPrice records
 * This simulates 24h of price movement so we can immediately see % changes
 */

import { PrismaClient } from '@prisma/client'
import { generateSnowflakeId } from '../src/lib/snowflake'

const prisma = new PrismaClient()

async function seedPriceHistory() {
  console.log('🌱 Seeding price history for all companies...\n')
  
  const companies = await prisma.organization.findMany({
    where: { type: 'company' },
    select: {
      id: true,
      name: true,
      currentPrice: true,
      initialPrice: true,
    }
  })
  
  const now = new Date()
  const timestamps = [
    new Date(now.getTime() - 24 * 60 * 60 * 1000), // 24h ago
    new Date(now.getTime() - 18 * 60 * 60 * 1000), // 18h ago
    new Date(now.getTime() - 12 * 60 * 60 * 1000), // 12h ago
    new Date(now.getTime() - 6 * 60 * 60 * 1000),  // 6h ago
    new Date(now.getTime() - 1 * 60 * 60 * 1000),  // 1h ago
  ]
  
  let totalRecords = 0
  
  for (const company of companies) {
    const currentPrice = company.currentPrice || company.initialPrice || 100
    
    // Generate slight price variations for realistic history
    // Vary between -5% to +10% from current price across the 24h period
    const priceVariations = [
      currentPrice * 0.95,  // 24h ago: -5%
      currentPrice * 0.98,  // 18h ago: -2%
      currentPrice * 1.02,  // 12h ago: +2%
      currentPrice * 1.05,  // 6h ago: +5%
      currentPrice * 1.08,  // 1h ago: +8%
    ]
    
    for (let i = 0; i < timestamps.length; i++) {
      const price = priceVariations[i]!
      const change = i === 0 ? 0 : price - priceVariations[i - 1]!
      const changePercent = i === 0 ? 0 : (change / priceVariations[i - 1]!) * 100
      
      await prisma.stockPrice.create({
        data: {
          id: generateSnowflakeId(),
          organizationId: company.id,
          price,
          change,
          changePercent,
          timestamp: timestamps[i]!,
          isSnapshot: false,
        }
      })
      
      totalRecords++
    }
    
    console.log(`✓ ${company.name}: Created ${timestamps.length} price records`)
  }
  
  console.log(`\n✅ Created ${totalRecords} price history records for ${companies.length} companies`)
  console.log(`📊 Markets should now show ~13.7% average 24h change (95% -> 100%)`)
  
  await prisma.$disconnect()
}

seedPriceHistory().catch(console.error)

