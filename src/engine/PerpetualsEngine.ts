/**
 * Perpetuals Trading Engine
 * 
 * Manages perpetual futures trading:
 * - Positions (long/short with leverage)
 * - Funding rate calculations
 * - Liquidations
 * - PnL tracking
 * - Daily price snapshots
 */

import { EventEmitter } from 'events';
import type {
  PerpPosition,
  FundingRate,
  PerpMarket,
  OrderRequest,
  Liquidation,
  DailyPriceSnapshot,
  TradingStats,
} from '@/shared/perps-types';
import {
  calculateLiquidationPrice,
  calculateUnrealizedPnL,
  calculateFundingPayment,
  shouldLiquidate,
  calculateMarkPrice,
} from '@/shared/perps-types';
import type { Organization } from '@/shared/types';

export class PerpetualsEngine extends EventEmitter {
  private positions: Map<string, PerpPosition> = new Map();
  private markets: Map<string, PerpMarket> = new Map();
  private fundingRates: Map<string, FundingRate> = new Map();
  private dailySnapshots: Map<string, DailyPriceSnapshot[]> = new Map(); // ticker -> snapshots
  private liquidations: Liquidation[] = [];
  private lastFundingTime: string = new Date().toISOString();
  private currentDate: string = new Date().toISOString().split('T')[0]!;

  constructor() {
    super();
  }

  /**
   * Initialize markets from organizations
   */
  initializeMarkets(organizations: Organization[]): void {
    const companies = organizations.filter(o => o.type === 'company' && o.initialPrice);
    
    for (const company of companies) {
      const ticker = this.generateTicker(company.id);
      
      const market: PerpMarket = {
        ticker,
        organizationId: company.id,
        name: company.name,
        currentPrice: company.currentPrice || company.initialPrice || 100,
        change24h: 0,
        changePercent24h: 0,
        high24h: company.currentPrice || company.initialPrice || 100,
        low24h: company.currentPrice || company.initialPrice || 100,
        volume24h: 0,
        openInterest: 0,
        fundingRate: {
          ticker,
          rate: 0.01, // 1% annual default
          nextFundingTime: this.getNextFundingTime(),
          predictedRate: 0.01,
        },
        maxLeverage: 100,
        minOrderSize: 10,
        markPrice: company.currentPrice || company.initialPrice || 100,
        indexPrice: company.currentPrice || company.initialPrice || 100,
      };
      
      this.markets.set(ticker, market);
      this.fundingRates.set(ticker, market.fundingRate);
    }
    
    console.log(`✅ Initialized ${this.markets.size} perpetual markets`);
  }

  /**
   * Open a new position
   */
  openPosition(userId: string, order: OrderRequest): PerpPosition {
    const market = this.markets.get(order.ticker);
    if (!market) {
      throw new Error(`Market ${order.ticker} not found`);
    }

    if (order.size < market.minOrderSize) {
      throw new Error(`Order size below minimum (${market.minOrderSize} USD)`);
    }

    if (order.leverage > market.maxLeverage || order.leverage < 1) {
      throw new Error(`Invalid leverage (1-${market.maxLeverage}x)`);
    }

    const entryPrice = order.orderType === 'market' ? market.currentPrice : order.limitPrice!;
    const liquidationPrice = calculateLiquidationPrice(entryPrice, order.side, order.leverage);

    const position: PerpPosition = {
      id: `pos-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId,
      ticker: order.ticker,
      organizationId: market.organizationId,
      side: order.side,
      entryPrice,
      currentPrice: market.currentPrice,
      size: order.size,
      leverage: order.leverage,
      liquidationPrice,
      unrealizedPnL: 0,
      unrealizedPnLPercent: 0,
      fundingPaid: 0,
      openedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };

    this.positions.set(position.id, position);
    
    // Update market open interest
    market.openInterest += order.size * order.leverage;
    market.volume24h += order.size;

    this.emit('position:opened', position);
    return position;
  }

  /**
   * Close a position
   */
  closePosition(positionId: string): { position: PerpPosition; realizedPnL: number } {
    const position = this.positions.get(positionId);
    if (!position) {
      throw new Error(`Position ${positionId} not found`);
    }

    const market = this.markets.get(position.ticker);
    if (!market) {
      throw new Error(`Market ${position.ticker} not found`);
    }

    // Calculate final PnL
    const { pnl } = calculateUnrealizedPnL(
      position.entryPrice,
      market.currentPrice,
      position.side,
      position.size
    );

    const realizedPnL = pnl - position.fundingPaid;

    // Update market
    market.openInterest -= position.size * position.leverage;
    market.volume24h += position.size;

    // Remove position
    this.positions.delete(positionId);

    this.emit('position:closed', { position, realizedPnL });
    return { position, realizedPnL };
  }

  /**
   * Update all positions with new prices
   */
  updatePositions(priceUpdates: Map<string, number>): void {
    const now = new Date().toISOString();
    
    for (const [positionId, position] of this.positions) {
      const ticker = position.ticker;
      const newPrice = priceUpdates.get(position.organizationId);
      
      if (newPrice) {
        position.currentPrice = newPrice;
        position.lastUpdated = now;
        
        // Update PnL
        const { pnl, pnlPercent } = calculateUnrealizedPnL(
          position.entryPrice,
          newPrice,
          position.side,
          position.size
        );
        
        position.unrealizedPnL = pnl;
        position.unrealizedPnLPercent = pnlPercent;
        
        // Check for liquidation
        if (shouldLiquidate(newPrice, position.liquidationPrice, position.side)) {
          this.liquidatePosition(positionId, newPrice);
        }
      }
    }
    
    // Update markets
    for (const [ticker, market] of this.markets) {
      const newPrice = priceUpdates.get(market.organizationId);
      if (newPrice) {
        market.change24h = newPrice - market.currentPrice;
        market.changePercent24h = (market.change24h / market.currentPrice) * 100;
        market.currentPrice = newPrice;
        market.high24h = Math.max(market.high24h, newPrice);
        market.low24h = Math.min(market.low24h, newPrice);
        market.markPrice = calculateMarkPrice(market.indexPrice, newPrice, market.fundingRate.rate);
      }
    }
  }

  /**
   * Process funding payments (called every 8 hours)
   */
  processFunding(): void {
    const now = new Date();
    const hoursSinceLastFunding = (now.getTime() - new Date(this.lastFundingTime).getTime()) / (1000 * 60 * 60);
    
    if (hoursSinceLastFunding < 8) {
      return; // Not time yet
    }
    
    for (const [positionId, position] of this.positions) {
      const fundingRate = this.fundingRates.get(position.ticker);
      if (!fundingRate) continue;
      
      const hoursHeld = (now.getTime() - new Date(position.openedAt).getTime()) / (1000 * 60 * 60);
      const fundingPayment = calculateFundingPayment(position.size, fundingRate.rate, hoursHeld);
      
      // Longs pay shorts when funding is positive
      // Shorts pay longs when funding is negative
      const payment = position.side === 'long' ? fundingPayment : -fundingPayment;
      
      position.fundingPaid += payment;
      position.lastUpdated = now.toISOString();
    }
    
    this.lastFundingTime = now.toISOString();
    
    // Update next funding time for all markets
    const nextFundingTime = this.getNextFundingTime();
    for (const [ticker, fundingRate] of this.fundingRates) {
      fundingRate.nextFundingTime = nextFundingTime;
    }
    
    this.emit('funding:processed', { timestamp: now.toISOString() });
  }

  /**
   * Liquidate a position
   */
  private liquidatePosition(positionId: string, currentPrice: number): void {
    const position = this.positions.get(positionId);
    if (!position) return;
    
    const market = this.markets.get(position.ticker);
    if (!market) return;
    
    const loss = position.size; // Complete loss
    
    const liquidation: Liquidation = {
      positionId,
      ticker: position.ticker,
      side: position.side,
      liquidationPrice: position.liquidationPrice,
      actualPrice: currentPrice,
      loss,
      timestamp: new Date().toISOString(),
    };
    
    this.liquidations.push(liquidation);
    
    // Update market
    market.openInterest -= position.size * position.leverage;
    
    // Remove position
    this.positions.delete(positionId);
    
    this.emit('position:liquidated', liquidation);
  }

  /**
   * Record end-of-day price snapshot
   */
  recordDailySnapshot(date?: string): void {
    const snapshotDate = date || new Date().toISOString().split('T')[0]!;
    
    for (const [ticker, market] of this.markets) {
      const snapshot: DailyPriceSnapshot = {
        date: snapshotDate,
        ticker,
        organizationId: market.organizationId,
        openPrice: market.low24h, // Approximation
        closePrice: market.currentPrice,
        highPrice: market.high24h,
        lowPrice: market.low24h,
        volume: market.volume24h,
        timestamp: new Date().toISOString(),
      };
      
      if (!this.dailySnapshots.has(ticker)) {
        this.dailySnapshots.set(ticker, []);
      }
      
      this.dailySnapshots.get(ticker)!.push(snapshot);
      
      // Reset 24h stats
      market.high24h = market.currentPrice;
      market.low24h = market.currentPrice;
      market.volume24h = 0;
    }
    
    this.currentDate = snapshotDate;
    this.emit('daily:snapshot', { date: snapshotDate, markets: this.markets.size });
  }

  /**
   * Get daily snapshot for a ticker
   */
  getDailySnapshots(ticker: string, days: number = 30): DailyPriceSnapshot[] {
    const snapshots = this.dailySnapshots.get(ticker) || [];
    return snapshots.slice(-days);
  }

  /**
   * Get all markets
   */
  getMarkets(): PerpMarket[] {
    return Array.from(this.markets.values());
  }

  /**
   * Get user positions
   */
  getUserPositions(userId: string): PerpPosition[] {
    return Array.from(this.positions.values()).filter(p => p.userId === userId);
  }

  /**
   * Get trading stats
   */
  getTradingStats(userId: string): TradingStats {
    // Simplified stats - would need to track closed positions in production
    const userPositions = this.getUserPositions(userId);
    
    const totalPnL = userPositions.reduce((sum, p) => sum + p.unrealizedPnL, 0);
    const totalFundingPaid = userPositions.reduce((sum, p) => sum + p.fundingPaid, 0);
    
    return {
      totalVolume: 0, // Would track from order history
      totalTrades: userPositions.length,
      totalPnL,
      winRate: 0,
      avgWin: 0,
      avgLoss: 0,
      largestWin: 0,
      largestLoss: 0,
      totalFundingPaid,
      totalLiquidations: 0,
    };
  }

  /**
   * Generate ticker symbol from organization ID
   */
  private generateTicker(orgId: string): string {
    // Convert org ID to ticker (e.g., "facehook" -> "FACEHOOK")
    return orgId.toUpperCase().replace(/-/g, '');
  }

  /**
   * Get next funding time (every 8 hours: 00:00, 08:00, 16:00 UTC)
   */
  private getNextFundingTime(): string {
    const now = new Date();
    const currentHour = now.getUTCHours();
    
    let nextHour: number;
    if (currentHour < 8) nextHour = 8;
    else if (currentHour < 16) nextHour = 16;
    else nextHour = 24; // Midnight next day
    
    const nextFunding = new Date(now);
    nextFunding.setUTCHours(nextHour % 24, 0, 0, 0);
    
    if (nextHour === 24) {
      nextFunding.setUTCDate(nextFunding.getUTCDate() + 1);
    }
    
    return nextFunding.toISOString();
  }

  /**
   * Save state to JSON
   */
  exportState() {
    return {
      positions: Array.from(this.positions.values()),
      markets: Array.from(this.markets.values()),
      fundingRates: Array.from(this.fundingRates.values()),
      dailySnapshots: Object.fromEntries(this.dailySnapshots),
      liquidations: this.liquidations,
      lastFundingTime: this.lastFundingTime,
      currentDate: this.currentDate,
    };
  }

  /**
   * Load state from JSON
   */
  importState(state: any) {
    this.positions = new Map(state.positions.map((p: PerpPosition) => [p.id, p]));
    this.markets = new Map(state.markets.map((m: PerpMarket) => [m.ticker, m]));
    this.fundingRates = new Map(state.fundingRates.map((f: FundingRate) => [f.ticker, f]));
    this.dailySnapshots = new Map(Object.entries(state.dailySnapshots));
    this.liquidations = state.liquidations || [];
    this.lastFundingTime = state.lastFundingTime;
    this.currentDate = state.currentDate;
  }
}

