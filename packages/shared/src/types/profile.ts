/**
 * Profile-related TypeScript types
 * Types for user profile widgets and data displays
 */

/**
 * User balance data from /api/users/[userId]/balance
 */
export interface UserBalanceData {
  balance: number;
  totalDeposited: number;
  totalWithdrawn: number;
  lifetimePnL: number;
}

/**
 * Base prediction market position from /api/markets/positions/[userId]
 */
export interface PredictionPosition {
  id: string;
  marketId: string;
  question: string;
  side: 'YES' | 'NO';
  shares: number;
  avgPrice: number;
  currentPrice: number;
  resolved: boolean;
  resolution?: boolean | null;
}

/**
 * Extended prediction position with PnL calculations for user portfolio views.
 * Extends PredictionPosition with computed fields for display.
 */
export interface UserPredictionPosition extends PredictionPosition {
  /** Current market value of the position (shares × currentPrice) */
  currentValue: number;
  /** Original cost of the position (shares × avgPrice) */
  costBasis: number;
  /** Unrealized profit/loss (currentValue - costBasis) */
  unrealizedPnL: number;
}

/**
 * User profile statistics
 */
export interface UserProfileStats {
  following: number;
  followers: number;
  totalActivity: number;
  positions?: number;
  comments?: number;
  reactions?: number;
}

/**
 * Perp position from API response (/api/markets/positions/[userId])
 * This matches the actual API response structure
 */
export interface PerpPositionFromAPI {
  id: string;
  ticker: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  currentPrice: number;
  size: number;
  leverage: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  liquidationPrice: number;
  fundingPaid: number;
  openedAt: string;
}
