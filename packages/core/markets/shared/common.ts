export type MarketKind = 'prediction' | 'perp';

export interface FeeConfig {
  tradingFeeRate: number; // e.g. 0.001 = 0.1%
  platformShare: number; // 0-1
  referrerShare: number; // 0-1
  minFeeAmount: number;
}

export interface WalletPort {
  debit(params: {
    userId: string;
    amount: number;
    reason: string;
    description?: string;
    relatedId?: string;
  }): Promise<void>;
  credit(params: {
    userId: string;
    amount: number;
    reason: string;
    description?: string;
    relatedId?: string;
  }): Promise<void>;
  recordPnL(params: {
    userId: string;
    pnl: number;
    reason: string;
    relatedId?: string;
  }): Promise<void>;
  getBalance(userId: string): Promise<{ balance: number; lifetimePnL?: number }>;
}

export interface BroadcastPort {
  emit(channel: string, payload: Record<string, unknown>): Promise<void>;
}

export interface CachePort {
  invalidate(pattern: string): Promise<void>;
}

export interface ClockPort {
  now(): Date;
}

export interface DbTransaction<T = void> {
  <R>(fn: (tx: T) => Promise<R>): Promise<R>;
}
