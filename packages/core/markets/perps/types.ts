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
  upsertPosition(
    position: Omit<PerpPositionRecord, 'id'> & { id?: string }
  ): Promise<PerpPositionRecord>;
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
}

export interface PerpCloseInput {
  userId: string;
  positionId: string;
  exitPriceOverride?: number;
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
