import type {
  BroadcastPort,
  CachePort,
  ClockPort,
  FeeConfig,
  FeeProcessor,
  WalletPort,
} from '../shared/common';

export type PredictionSide = 'yes' | 'no';

// Domain records (DB-facing)
export interface QuestionRecord {
  id: string;
  questionNumber?: number;
  text: string;
  status: 'active' | 'resolved' | 'cancelled';
  resolutionDate: Date;
  resolvedOutcome?: boolean | null;
  createdDate?: Date;
}

export interface PredictionMarketRecord {
  id: string;
  question: string;
  description?: string | null;
  yesShares: number;
  noShares: number;
  liquidity: number;
  endDate: Date;
  resolved: boolean;
  resolution?: boolean | null;
  onChainMarketId?: string | null;
  onChainResolved?: boolean;
  oracleCommitTxHash?: string | null;
  oracleRevealTxHash?: string | null;
  resolutionProofUrl?: string | null;
  resolutionDescription?: string | null;
  status?: 'active' | 'resolved' | 'cancelled';
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PredictionPositionRecord {
  id: string;
  userId: string;
  marketId: string;
  side: PredictionSide;
  shares: number;
  avgPrice: number;
  status?: 'active' | 'closed' | 'resolved';
  outcome?: boolean | null;
  pnl?: number;
  resolvedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PredictionPriceSnapshotRecord {
  marketId: string;
  yesPrice: number;
  noPrice: number;
  yesShares: number;
  noShares: number;
  liquidity: number;
  eventType: 'trade' | 'resolution';
  source: 'user_trade' | 'npc_trade' | 'system';
  createdAt?: Date;
}

// DB port (to be implemented by adapter)
export interface PredictionDbPort {
  getMarketById(id: string): Promise<PredictionMarketRecord | null>;
  getMarketsByIds(ids: string[]): Promise<PredictionMarketRecord[]>;
  listMarkets?(): Promise<PredictionMarketRecord[]>;
  listUserPositions?(userId: string): Promise<PredictionPositionRecord[]>;
  getQuestion?(idOrNumber: string): Promise<QuestionRecord | null>;
  createMarketFromQuestion(
    question: QuestionRecord,
    initialLiquidity: number,
    options?: { description?: string | null }
  ): Promise<PredictionMarketRecord>;
  updateMarketState(
    marketId: string,
    updates: Partial<
      Pick<
        PredictionMarketRecord,
        | 'yesShares'
        | 'noShares'
        | 'liquidity'
        | 'resolved'
        | 'resolution'
        | 'onChainMarketId'
        | 'onChainResolved'
        | 'resolutionProofUrl'
        | 'resolutionDescription'
      >
    >
  ): Promise<PredictionMarketRecord>;
  getPosition(
    userId: string,
    marketId: string,
    side: PredictionSide
  ): Promise<PredictionPositionRecord | null>;
  upsertPosition(
    position: Omit<PredictionPositionRecord, 'id'> & { id?: string }
  ): Promise<PredictionPositionRecord>;
  deletePosition(positionId: string): Promise<void>;
  listPositionsForMarket(marketId: string): Promise<PredictionPositionRecord[]>;
  insertPriceSnapshot(snapshot: PredictionPriceSnapshotRecord): Promise<void>;
}

// DTOs
export interface PredictionBuyInput {
  userId: string;
  marketId: string;
  side: PredictionSide;
  amount: number; // total spent (includes fee)
}

export interface PredictionSellInput {
  userId: string;
  marketId: string;
  shares: number;
  positionId?: string;
}

export interface PredictionResolveInput {
  marketId: string;
  winningSide: PredictionSide;
  resolvedAt?: Date;
  resolutionProofUrl?: string;
  resolutionDescription?: string;
}

export interface PredictionTradeResult {
  positionId: string;
  marketId: string;
  side: PredictionSide;
  shares: number;
  avgPrice: number;
  totalCost?: number; // buy
  totalProceeds?: number; // gross proceeds (sell)
  netProceeds?: number; // sell (after fee)
  feePaid: number;
  pnl?: number;
  remainingShares?: number;
  positionClosed?: boolean;
  balance?: number;
  market: {
    yesPrice: number;
    noPrice: number;
    yesShares: number;
    noShares: number;
    priceImpact: number;
    liquidity: number;
  };
}

// Service deps bundle (optional helper)
export interface PredictionServiceDeps {
  db: PredictionDbPort;
  wallet: WalletPort;
  broadcast?: BroadcastPort;
  cache?: CachePort;
  clock?: ClockPort;
  fees: FeeConfig;
  feeProcessor?: FeeProcessor;
}
