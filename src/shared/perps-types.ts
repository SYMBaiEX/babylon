/**
 * Perpetual Futures Trading Types
 * 
 * Defines all types for perps markets:
 * - Positions (long/short with leverage)
 * - Funding rates
 * - Liquidation mechanics
 * - PnL calculations
 */

export interface PerpPosition {
  id: string;
  userId: string;
  ticker: string; // Company ticker (e.g., "FACEHOOK")
  organizationId: string;
  side: 'long' | 'short';
  entryPrice: number;
  currentPrice: number;
  size: number; // Position size in USD
  leverage: number; // 1x to 100x
  liquidationPrice: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  fundingPaid: number; // Cumulative funding paid/received
  openedAt: string; // ISO timestamp
  lastUpdated: string;
}

export interface FundingRate {
  ticker: string;
  rate: number; // APR as decimal (e.g., 0.01 = 1%)
  nextFundingTime: string; // ISO timestamp
  predictedRate: number; // Next period's estimated rate
}

export interface PerpMarket {
  ticker: string;
  organizationId: string;
  name: string;
  currentPrice: number;
  change24h: number; // Dollar change
  changePercent24h: number; // Percentage change
  high24h: number;
  low24h: number;
  volume24h: number;
  openInterest: number; // Total USD value of open positions
  fundingRate: FundingRate;
  maxLeverage: number;
  minOrderSize: number;
  markPrice: number; // Fair price for liquidations
  indexPrice: number; // Spot price reference
}

export interface OrderRequest {
  ticker: string;
  side: 'long' | 'short';
  size: number; // USD size
  leverage: number;
  orderType: 'market' | 'limit';
  limitPrice?: number;
}

export interface PositionUpdate {
  positionId: string;
  action: 'increase' | 'decrease' | 'close';
  amount?: number; // USD amount to add/remove
  newLeverage?: number;
}

export interface Liquidation {
  positionId: string;
  ticker: string;
  side: 'long' | 'short';
  liquidationPrice: number;
  actualPrice: number;
  loss: number;
  timestamp: string;
}

export interface DailyPriceSnapshot {
  date: string; // YYYY-MM-DD
  ticker: string;
  organizationId: string;
  openPrice: number;
  closePrice: number;
  highPrice: number;
  lowPrice: number;
  volume: number;
  timestamp: string; // EOD timestamp
}

export interface TradingStats {
  totalVolume: number;
  totalTrades: number;
  totalPnL: number;
  winRate: number; // Percentage
  avgWin: number;
  avgLoss: number;
  largestWin: number;
  largestLoss: number;
  totalFundingPaid: number;
  totalLiquidations: number;
}

/**
 * Calculate liquidation price for a position
 */
export function calculateLiquidationPrice(
  entryPrice: number,
  side: 'long' | 'short',
  leverage: number
): number {
  // Liquidation happens when loss reaches (1 / leverage) of position value
  // For long: liquidationPrice = entryPrice * (1 - 0.9/leverage)
  // For short: liquidationPrice = entryPrice * (1 + 0.9/leverage)
  // Using 0.9 instead of 1.0 to account for liquidation fees
  
  const liquidationThreshold = 0.9 / leverage;
  
  if (side === 'long') {
    return entryPrice * (1 - liquidationThreshold);
  } else {
    return entryPrice * (1 + liquidationThreshold);
  }
}

/**
 * Calculate unrealized PnL for a position
 */
export function calculateUnrealizedPnL(
  entryPrice: number,
  currentPrice: number,
  side: 'long' | 'short',
  size: number
): { pnl: number; pnlPercent: number } {
  let pnl: number;
  
  if (side === 'long') {
    pnl = ((currentPrice - entryPrice) / entryPrice) * size;
  } else {
    pnl = ((entryPrice - currentPrice) / entryPrice) * size;
  }
  
  const pnlPercent = (pnl / size) * 100;
  
  return { pnl, pnlPercent };
}

/**
 * Calculate funding payment
 * Funding is paid every 8 hours based on the funding rate
 */
export function calculateFundingPayment(
  positionSize: number,
  fundingRate: number,
  hoursHeld: number
): number {
  // Funding rate is annual, convert to 8-hour periods
  // Annual → 8-hour: rate / (365 * 3)
  const periodsHeld = hoursHeld / 8;
  const fundingPerPeriod = fundingRate / (365 * 3);
  
  return positionSize * fundingPerPeriod * periodsHeld;
}

/**
 * Check if position should be liquidated
 */
export function shouldLiquidate(
  currentPrice: number,
  liquidationPrice: number,
  side: 'long' | 'short'
): boolean {
  if (side === 'long') {
    return currentPrice <= liquidationPrice;
  } else {
    return currentPrice >= liquidationPrice;
  }
}

/**
 * Calculate mark price (fair value for liquidations)
 * Uses weighted average of index price and last price
 */
export function calculateMarkPrice(
  indexPrice: number,
  lastPrice: number,
  fundingRate: number
): number {
  // Simple mark price: 70% index, 30% last, adjusted by funding
  const baseMarkPrice = indexPrice * 0.7 + lastPrice * 0.3;
  
  // Adjust slightly based on funding rate (indicates market bias)
  const fundingAdjustment = fundingRate * 0.01;
  
  return baseMarkPrice * (1 + fundingAdjustment);
}


