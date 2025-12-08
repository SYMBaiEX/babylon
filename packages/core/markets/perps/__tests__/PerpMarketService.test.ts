import { beforeEach, describe, expect, it } from 'bun:test';
import type { WalletPort } from '../../shared/common';
import { PerpMarketService } from '../PerpMarketService';
import type {
  PerpDbPort,
  PerpMarketRecord,
  PerpPositionRecord,
} from '../types';

const feeConfig = {
  tradingFeeRate: 0.001,
  platformShare: 0.5,
  referrerShare: 0.5,
  minFeeAmount: 0.01,
};

class InMemoryWallet implements WalletPort {
  private balances = new Map<string, number>();
  private pnls: Array<{ userId: string; pnl: number; reason: string }> = [];

  constructor(private defaultBalance = 10_000) {}

  async debit({
    userId,
    amount,
  }: {
    userId: string;
    amount: number;
    reason: string;
  }): Promise<void> {
    const balance = this.balances.get(userId) ?? this.defaultBalance;
    if (balance < amount) throw new Error('Insufficient funds');
    this.balances.set(userId, balance - amount);
  }

  async credit({
    userId,
    amount,
  }: {
    userId: string;
    amount: number;
    reason: string;
  }): Promise<void> {
    const balance = this.balances.get(userId) ?? this.defaultBalance;
    this.balances.set(userId, balance + amount);
  }

  async recordPnL({
    userId,
    pnl,
    reason,
  }: {
    userId: string;
    pnl: number;
    reason: string;
  }): Promise<void> {
    this.pnls.push({ userId, pnl, reason });
  }

  async getBalance(userId: string): Promise<{ balance: number }> {
    return { balance: this.balances.get(userId) ?? this.defaultBalance };
  }

  getPnLs(userId: string) {
    return this.pnls.filter((p) => p.userId === userId);
  }
}

class InMemoryPerpDb implements PerpDbPort {
  private markets = new Map<string, PerpMarketRecord>();
  private positions = new Map<string, PerpPositionRecord>();
  private idCounter = 1;

  constructor(initialMarkets: PerpMarketRecord[]) {
    initialMarkets.forEach((m) => this.markets.set(m.ticker, { ...m }));
  }

  async listMarkets(): Promise<PerpMarketRecord[]> {
    return Array.from(this.markets.values()).map((m) => ({ ...m }));
  }

  async listOpenPositions(): Promise<PerpPositionRecord[]> {
    return Array.from(this.positions.values())
      .filter((p) => !p.closedAt)
      .map((p) => ({ ...p }));
  }

  async getPositionById(id: string): Promise<PerpPositionRecord | null> {
    const pos = this.positions.get(id);
    return pos ? { ...pos } : null;
  }

  async upsertPosition(
    position: Omit<PerpPositionRecord, 'id'> & { id?: string }
  ): Promise<PerpPositionRecord> {
    const id = position.id ?? `pos-${this.idCounter++}`;
    const record: PerpPositionRecord = {
      id,
      userId: position.userId,
      ticker: position.ticker,
      organizationId: position.organizationId,
      side: position.side,
      entryPrice: position.entryPrice,
      currentPrice: position.currentPrice,
      size: position.size,
      leverage: position.leverage,
      liquidationPrice: position.liquidationPrice,
      unrealizedPnL: position.unrealizedPnL,
      unrealizedPnLPercent: position.unrealizedPnLPercent,
      fundingPaid: position.fundingPaid,
      openedAt: position.openedAt,
      lastUpdated: position.lastUpdated,
      closedAt: position.closedAt ?? null,
      realizedPnL: position.realizedPnL ?? null,
    };
    this.positions.set(id, record);
    return { ...record };
  }

  async updateOpenPosition(
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
  ): Promise<void> {
    const pos = this.positions.get(positionId);
    if (!pos) return;
    this.positions.set(positionId, {
      ...pos,
      ...updates,
      lastUpdated: updates.lastUpdated ?? new Date(),
    });
  }

  async closePosition(
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
  ): Promise<void> {
    const pos = this.positions.get(positionId);
    if (!pos) return;
    this.positions.set(positionId, {
      ...pos,
      closedAt: updates.closedAt ?? new Date(),
      currentPrice: updates.currentPrice ?? pos.currentPrice,
      realizedPnL: updates.realizedPnL ?? pos.realizedPnL,
      unrealizedPnL: updates.unrealizedPnL ?? 0,
      unrealizedPnLPercent: updates.unrealizedPnLPercent ?? 0,
    });
  }

  async updateMarketStats(
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
        | 'maxLeverage'
        | 'minOrderSize'
      >
    >
  ): Promise<void> {
    const current = this.markets.get(ticker);
    if (!current) throw new Error(`Market not found: ${ticker}`);
    this.markets.set(ticker, {
      ...current,
      ...updates,
    });
  }
}

describe('PerpMarketService', () => {
  let db: InMemoryPerpDb;
  let wallet: InMemoryWallet;
  let service: PerpMarketService;
  const baseMarket: PerpMarketRecord = {
    ticker: 'ABC',
    organizationId: 'org-abc',
    name: 'ABC Corp',
    currentPrice: 100,
    change24h: 0,
    changePercent24h: 0,
    high24h: 100,
    low24h: 100,
    volume24h: 0,
    openInterest: 0,
    fundingRate: {
      rate: 0,
      nextFundingTime: new Date().toISOString(),
      predictedRate: 0,
    },
    maxLeverage: 100,
    minOrderSize: 10,
    markPrice: 100,
    indexPrice: 100,
  };

  beforeEach(() => {
    db = new InMemoryPerpDb([baseMarket]);
    wallet = new InMemoryWallet(10_000);
    service = new PerpMarketService({
      db,
      wallet,
      fees: feeConfig,
    });
  });

  it('opens a position and updates snapshot/OI/volume/balance', async () => {
    const res = await service.openPosition({
      userId: 'u1',
      ticker: 'ABC',
      side: 'long',
      size: 100,
      leverage: 10,
    });

    expect(res.positionId).toBeDefined();
    const balance = await wallet.getBalance('u1');
    // margin 10 + fee 0.1 = 10.1 deducted from 10_000
    expect(balance.balance).toBeCloseTo(9989.9, 4);

    const markets = await db.listMarkets();
    const m = markets[0]!;
    // OI = notional size (not size * leverage)
    expect(m.openInterest).toBeCloseTo(100, 4);
    expect(m.volume24h).toBeCloseTo(100, 4);
  });

  it('closes a position with profit and updates OI/volume/balance', async () => {
    const open = await service.openPosition({
      userId: 'u1',
      ticker: 'ABC',
      side: 'long',
      size: 100,
      leverage: 10,
    });

    // Bump market price to 120 to realize profit
    await db.updateMarketStats('ABC', { currentPrice: 120 });

    const close = await service.closePosition({
      userId: 'u1',
      positionId: open.positionId,
    });

    expect(close.realizedPnL).toBeCloseTo(20, 4); // (120-100)/100 * 100
    const markets = await db.listMarkets();
    const m = markets[0]!;
    expect(m.openInterest).toBeCloseTo(0, 4);
    expect(m.volume24h).toBeCloseTo(200, 4); // open + close size

    const balance = await wallet.getBalance('u1');
    // initial 10000 - 10.1 + net close (margin 10 + pnl 20 - fee 0.1) = 10000 + 19.8
    expect(balance.balance).toBeCloseTo(10019.8, 4);
  });

  it('liquidates a position on price drop and records loss', async () => {
    const open = await service.openPosition({
      userId: 'u1',
      ticker: 'ABC',
      side: 'long',
      size: 100,
      leverage: 10,
    });

    // Drop price below liquidation
    await service.applyPriceUpdates({ 'org-abc': 80 });

    const pos = await db.getPositionById(open.positionId);
    expect(pos?.closedAt).toBeDefined();

    const markets = await db.listMarkets();
    const m = markets[0]!;
    expect(m.openInterest).toBe(0);

    const pnls = wallet.getPnLs('u1');
    // Margin loss = size/leverage = 10
    expect(pnls.find((p) => p.reason === 'perp_liquidation')?.pnl).toBeCloseTo(
      -10,
      4
    );
  });

  it('updates unrealized PnL on price move without liquidation', async () => {
    const open = await service.openPosition({
      userId: 'u1',
      ticker: 'ABC',
      side: 'long',
      size: 100,
      leverage: 5,
    });

    await service.applyPriceUpdates({ 'org-abc': 110 });
    const pos = await db.getPositionById(open.positionId);
    expect(pos?.unrealizedPnL).toBeCloseTo(10, 4);
    expect(pos?.unrealizedPnLPercent).toBeCloseTo(10, 4);
    expect(pos?.closedAt).toBeNull();
  });

  it('processes funding and updates fundingPaid and fundingRate', async () => {
    // Open long 100 and short 50 to create imbalance
    await service.openPosition({
      userId: 'u1',
      ticker: 'ABC',
      side: 'long',
      size: 100,
      leverage: 10,
    });
    await service.openPosition({
      userId: 'u2',
      ticker: 'ABC',
      side: 'short',
      size: 50,
      leverage: 10,
    });

    await service.processFundingAndLiquidations();

    const longPos = (await db.listOpenPositions()).find(
      (p) => p.userId === 'u1'
    );
    const shortPos = (await db.listOpenPositions()).find(
      (p) => p.userId === 'u2'
    );

    expect(longPos?.fundingPaid ?? 0).toBeGreaterThan(0);
    expect(shortPos?.fundingPaid ?? 0).toBeLessThan(0);

    const market = (await db.listMarkets())[0]!;
    expect(market.fundingRate.rate).not.toBe(0);
  });
});
