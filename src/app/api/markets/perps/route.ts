/**
 * Perpetual Futures Markets API
 * 
 * GET /api/markets/perps - Get all tradeable companies
 */

import { db } from '@/lib/database-service';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Get ONLY companies (not media, government, think tanks)
    const companies = await db.getCompanies();
    
    // Build markets with REAL 24h stats
    const markets = await Promise.all(
      companies.map(async (company) => {
        const currentPrice = company.currentPrice || company.initialPrice || 100;
        
        // Get last 24 hours of price history (1440 minutes)
        const priceHistory = await db.getPriceHistory(company.id, 1440);
        
        let change24h = 0;
        let changePercent24h = 0;
        let high24h = currentPrice;
        let low24h = currentPrice;
        
        if (priceHistory.length > 0) {
          // Calculate 24h change
          const price24hAgo = priceHistory[priceHistory.length - 1];
          if (price24hAgo) {
            change24h = currentPrice - price24hAgo.price;
            changePercent24h = (change24h / price24hAgo.price) * 100;
          }
          
          // Calculate high/low
          high24h = Math.max(...priceHistory.map(p => p.price), currentPrice);
          low24h = Math.min(...priceHistory.map(p => p.price), currentPrice);
        }
        
        // Get open interest from positions
        let positions: any[] = [];
        try {
          positions = await db.prisma.perpPosition.findMany({
            where: {
              organizationId: company.id,
              closedAt: null,
            },
          });
        } catch (error) {
          // Table might not exist yet or no positions
          positions = [];
        }
        
        const openInterest = positions.reduce((sum, p) => sum + (p.size * p.leverage), 0);
        
        // Calculate funding rate from position imbalance
        const longs = positions.filter(p => p.side === 'long');
        const shorts = positions.filter(p => p.side === 'short');
        const longSize = longs.reduce((sum, p) => sum + p.size, 0);
        const shortSize = shorts.reduce((sum, p) => sum + p.size, 0);
        const totalSize = longSize + shortSize;
        
        let fundingRate = 0.01; // Default 1% annual
        if (totalSize > 0) {
          const imbalance = (longSize - shortSize) / totalSize;
          fundingRate = 0.01 + (imbalance * 0.05); // ±5% based on imbalance
        }
        
        return {
          ticker: company.id.toUpperCase().replace(/-/g, ''),
          organizationId: company.id,
          name: company.name,
          currentPrice,
          change24h,
          changePercent24h,
          high24h,
          low24h,
          volume24h: 0, // TODO: Track from trades
          openInterest,
          fundingRate: {
            rate: fundingRate,
            nextFundingTime: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
            predictedRate: fundingRate,
          },
          maxLeverage: 100,
          minOrderSize: 10,
        };
      })
    );

    return NextResponse.json({
      success: true,
      markets,
      count: markets.length,
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load markets' },
      { status: 500 }
    );
  }
}
