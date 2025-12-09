import type {
  BroadcastPort,
  CachePort,
  ClockPort,
  FeeConfig,
  WalletPort,
} from '../shared/common';

export type PerpSide = 'long' | 'short';

export interface PerpMarketRecord {
  ticker: string;
  organizationId: string;
  name?: string;
  currentPrice: number;
  /** Price from 24 hours ago (for accurate change calculation) */
  price24hAgo?: number;
  change24h: number;
  changePercent24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  openInterest: number;
  fundingRate: {
    rate: number;
    nextFundingTime: string;
    predictedRate: number;
  };
  maxLeverage: number;
  minOrderSize: number;
  markPrice?: number;
  indexPrice?: number;
}

export interface PerpPositionRecord {
  id: string;
  userId: string;
  ticker: string;
  organizationId: string;
  side: PerpSide;
  entryPrice: number;
  currentPrice: number;
  size: number;
  leverage: number;
  liquidationPrice: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  fundingPaid: number;
  openedAt: Date;
  lastUpdated: Date;
  closedAt?: Date | null;
  realizedPnL?: number | null;
}

export interface PerpDbPort {
  listMarkets(): Promise<PerpMarketRecord[]>;
  listOpenPositions(): Promise<PerpPositionRecord[]>;
  getPositionById(id: string): Promise<PerpPositionRecord | null>;
  /** Get all open positions for a user */
  getOpenPositionsByUser(userId: string): Promise<PerpPositionRecord[]>;
  /** Get existing open position for user on specific ticker (for consolidation) */
  getOpenPositionByUserAndTicker(
    userId: string,
    ticker: string
  ): Promise<PerpPositionRecord | null>;
  upsertPosition(
    position: Omit<PerpPositionRecord, 'id'> & { id?: string }
  ): Promise<PerpPositionRecord>;
  /**
   * Execute operations within a transaction for atomicity.
   * If the callback throws, all changes are rolled back.
   */
  transaction<T>(fn: (tx: PerpDbPort) => Promise<T>): Promise<T>;
  updateOpenPosition(
    positionId: string,
    updates: Partial<
      Pick<
        PerpPositionRecord,
        | 'currentPrice'
        | 'unrealizedPnL'
        | 'unrealizedPnLPercent'
        | 'fundingPaid'
        | 'liquidationPrice'
        | 'lastUpdated'
        | 'size'
      >
    >
  ): Promise<void>;
  closePosition(
    positionId: string,
    updates: Partial<
      Pick<
        PerpPositionRecord,
        | 'currentPrice'
        | 'closedAt'
        | 'realizedPnL'
        | 'unrealizedPnL'
        | 'unrealizedPnLPercent'
      >
    >
  ): Promise<void>;
  updateMarketStats(
    ticker: string,
    updates: Partial<
      Pick<
        PerpMarketRecord,
        | 'currentPrice'
        | 'price24hAgo'
        | 'change24h'
        | 'changePercent24h'
        | 'high24h'
        | 'low24h'
        | 'volume24h'
        | 'openInterest'
        | 'fundingRate'
        | 'markPrice'
        | 'indexPrice'
      >
    >
  ): Promise<void>;
}

// DTOs
export interface PerpOpenInput {
  userId: string;
  ticker: string;
  side: PerpSide;
  size: number;
  leverage: number;
  /** Maximum slippage tolerance (0-1, e.g., 0.01 = 1%). Rejects if price moved beyond this. */
  maxSlippage?: number;
}

export interface PerpCloseInput {
  userId: string;
  positionId: string;
  /** Close only a portion of the position (0-1, e.g., 0.5 = 50%). Defaults to 1 (full close). */
  percentage?: number;
  /** Override exit price for liquidations or testing. */
  exitPriceOverride?: number;
  /** Maximum slippage tolerance (0-1). Rejects if price moved beyond this. */
  maxSlippage?: number;
}

export interface PerpTradeResult {
  positionId: string;
  ticker: string;
  side: PerpSide;
  size: number;
  leverage: number;
  entryPrice: number;
  exitPrice?: number;
  liquidationPrice: number;
  marginPaid?: number;
  realizedPnL?: number;
  feePaid: number;
  balance?: number;
  /** If partial close, the remaining position size */
  remainingSize?: number;
  /** True if position was fully closed */
  fullyClosed?: boolean;
}

// Service deps bundle (optional helper)
export interface PerpServiceDeps {
  db: PerpDbPort;
  wallet: WalletPort;
  broadcast?: BroadcastPort;
  cache?: CachePort;
  clock?: ClockPort;
  fees: FeeConfig;
}
