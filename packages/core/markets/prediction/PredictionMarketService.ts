import { PredictionPricing } from './pricing';
import type {
  PredictionBuyInput,
  PredictionDbPort,
  PredictionMarketRecord,
  PredictionPriceSnapshotRecord,
  PredictionPositionRecord,
  PredictionResolveInput,
  PredictionSellInput,
  PredictionServiceDeps,
  PredictionSide,
  PredictionTradeResult,
} from './types';

const DEFAULT_LIQUIDITY = 10_000;
const MIN_SHARES = 0.01;
const MIN_TRADE_AMOUNT = 1;

export class PredictionMarketService {
  private readonly db: PredictionDbPort;
  private readonly deps: PredictionServiceDeps;

  constructor(deps: PredictionServiceDeps) {
    this.deps = deps;
    this.db = deps.db;
  }

  async getMarket(marketId: string): Promise<PredictionMarketRecord | null> {
    return this.db.getMarketById(marketId);
  }

  async listMarkets(): Promise<PredictionMarketRecord[]> {
    if (this.db.listMarkets) {
      return this.db.listMarkets();
    }
    throw new Error('listMarkets not implemented by db adapter');
  }

  async listUserPositions(userId: string): Promise<PredictionPositionRecord[]> {
    if (this.db.listUserPositions) {
      return this.db.listUserPositions(userId);
    }
    throw new Error('listUserPositions not implemented by db adapter');
  }

  async buy(input: PredictionBuyInput): Promise<PredictionTradeResult> {
    const { marketId, userId, amount, side } = input;
    if (amount < MIN_TRADE_AMOUNT) {
      throw new Error(`Trade amount must be at least ${MIN_TRADE_AMOUNT}`);
    }
    const market = await this.ensureMarket(marketId);

    this.assertMarketActive(market);

    // Calculate shares with fees (fee rate from deps)
    const calc = PredictionPricing.calculateBuyWithFees(
      market.yesShares,
      market.noShares,
      side,
      amount,
      this.deps.fees.tradingFeeRate
    );

    if (calc.netAmount <= 0) {
      throw new Error('Trade amount too low after fees');
    }

    await this.deps.wallet.debit({
      userId,
      amount,
      reason: 'pred_buy',
      description: `Buy ${side.toUpperCase()} in ${market.question}`,
      relatedId: marketId,
    });

    const newLiquidity = market.liquidity + calc.netAmount;
    await this.db.updateMarketState(marketId, {
      yesShares: calc.newYesShares,
      noShares: calc.newNoShares,
      liquidity: newLiquidity,
    });

    const existingPos = await this.db.getPosition(userId, marketId, side);
    const position = await this.db.upsertPosition(
      existingPos
        ? {
            ...existingPos,
            shares: existingPos.shares + calc.sharesBought,
            avgPrice:
              (existingPos.avgPrice * existingPos.shares +
                calc.avgPrice * calc.sharesBought) /
              (existingPos.shares + calc.sharesBought),
            updatedAt: this.now(),
          }
        : {
            id: undefined,
            userId,
            marketId,
            side,
            shares: calc.sharesBought,
            avgPrice: calc.avgPrice,
            status: 'active',
            outcome: null,
            pnl: 0,
            resolvedAt: null,
            createdAt: this.now(),
            updatedAt: this.now(),
          }
    );

    await this.recordSnapshot({
      marketId,
      yesPrice: calc.newYesPrice,
      noPrice: calc.newNoPrice,
      yesShares: calc.newYesShares,
      noShares: calc.newNoShares,
      liquidity: newLiquidity,
      eventType: 'trade',
      source: 'user_trade',
    });

    await this.emitTrade(marketId, {
      type: 'prediction_trade',
      marketId,
      yesPrice: calc.newYesPrice,
      noPrice: calc.newNoPrice,
      yesShares: calc.newYesShares,
      noShares: calc.newNoShares,
      liquidity: newLiquidity,
      trade: {
        actorType: 'user',
        actorId: userId,
        action: 'buy',
        side,
        shares: calc.sharesBought,
        amount,
        price: calc.avgPrice,
        source: 'user_trade',
        timestamp: this.now().toISOString(),
      },
    });

    await this.invalidateCaches(marketId);

    if (this.deps.feeProcessor) {
      await this.deps.feeProcessor.processTradingFee({
        userId,
        amount,
        type: 'pred_buy',
        relatedId: marketId,
        positionId: position.id,
      });
    }

    return {
      positionId: position.id,
      marketId,
      side,
      shares: calc.sharesBought,
      avgPrice: calc.avgPrice,
      totalCost: amount,
      feePaid: calc.fee,
      market: {
        yesPrice: calc.newYesPrice,
        noPrice: calc.newNoPrice,
        yesShares: calc.newYesShares,
        noShares: calc.newNoShares,
        priceImpact: calc.priceImpact,
        liquidity: newLiquidity,
      },
    };
  }

  async sell(input: PredictionSellInput): Promise<PredictionTradeResult> {
    const { marketId, userId, shares } = input;
    if (shares < MIN_SHARES) {
      throw new Error(`Shares to sell must be at least ${MIN_SHARES}`);
    }
    const market = await this.ensureMarket(marketId);

    this.assertMarketActive(market);

    const yesPos = await this.db.getPosition(userId, marketId, 'yes');
    const noPos = await this.db.getPosition(userId, marketId, 'no');
    const positions = [yesPos, noPos].filter(
      (p): p is NonNullable<typeof p> => !!p
    );

    let pos: NonNullable<typeof yesPos> | NonNullable<typeof noPos> | null =
      null;
    if (input.positionId) {
      pos = positions.find((p) => p.id === input.positionId) ?? null;
    } else if (positions.length === 1) {
      pos = positions[0]!;
    } else if (positions.length > 1) {
      throw new Error(
        'Multiple positions exist on this market. Specify positionId.'
      );
    }

    if (!pos) {
      throw new Error('Position not found');
    }

    if (pos.shares < shares - 1e-9) {
      throw new Error('Insufficient shares');
    }

    const side: PredictionSide = pos.side;
    const calc = PredictionPricing.calculateSellWithFees(
      market.yesShares,
      market.noShares,
      side,
      shares,
      this.deps.fees.tradingFeeRate
    );

    const newLiquidity = market.liquidity - calc.totalCost;
    if (newLiquidity < 0) {
      throw new Error('Sale would exceed available liquidity');
    }
    await this.db.updateMarketState(marketId, {
      yesShares: calc.newYesShares,
      noShares: calc.newNoShares,
      liquidity: newLiquidity,
    });

    const remaining = pos.shares - shares;
    const positionClosed = remaining <= MIN_SHARES;
    if (positionClosed) {
      await this.db.deletePosition(pos.id);
    } else {
      await this.db.upsertPosition({
        ...pos,
        shares: remaining,
        updatedAt: this.now(),
      });
    }

    const costBasis = pos.avgPrice * shares;
    const profitLoss = calc.netProceeds - costBasis;

    await this.deps.wallet.credit({
      userId,
      amount: calc.netProceeds,
      reason: 'pred_sell',
      description: `Sell ${side.toUpperCase()} in ${market.question}`,
      relatedId: marketId,
    });

    await this.deps.wallet.recordPnL({
      userId,
      pnl: profitLoss,
      reason: 'pred_sell',
      relatedId: marketId,
    });

    await this.recordSnapshot({
      marketId,
      yesPrice: calc.newYesPrice,
      noPrice: calc.newNoPrice,
      yesShares: calc.newYesShares,
      noShares: calc.newNoShares,
      liquidity: newLiquidity,
      eventType: 'trade',
      source: 'user_trade',
    });

    await this.emitTrade(marketId, {
      type: 'prediction_trade',
      marketId,
      yesPrice: calc.newYesPrice,
      noPrice: calc.newNoPrice,
      yesShares: calc.newYesShares,
      noShares: calc.newNoShares,
      liquidity: newLiquidity,
      trade: {
        actorType: 'user',
        actorId: userId,
        action: 'sell',
        side,
        shares,
        amount: calc.netProceeds,
        price: calc.avgPrice,
        source: 'user_trade',
        timestamp: this.now().toISOString(),
      },
    });

    await this.invalidateCaches(marketId);

    if (this.deps.feeProcessor) {
      await this.deps.feeProcessor.processTradingFee({
        userId,
        amount: calc.totalCost,
        type: 'pred_sell',
        relatedId: marketId,
        positionId: pos.id,
      });
    }

    return {
      positionId: pos.id,
      marketId,
      side,
      shares,
      avgPrice: calc.avgPrice,
      totalProceeds: calc.totalCost,
      netProceeds: calc.netProceeds,
      feePaid: calc.fee,
      pnl: profitLoss,
      remainingShares: positionClosed ? 0 : remaining,
      positionClosed,
      market: {
        yesPrice: calc.newYesPrice,
        noPrice: calc.newNoPrice,
        yesShares: calc.newYesShares,
        noShares: calc.newNoShares,
        priceImpact: calc.priceImpact,
        liquidity: newLiquidity,
      },
    };
  }

  async resolve(input: PredictionResolveInput): Promise<void> {
    const { marketId, winningSide, resolutionDescription, resolutionProofUrl } =
      input;
    const market = await this.ensureMarket(marketId);
    if (market.resolved) return;

    await this.db.updateMarketState(marketId, {
      resolved: true,
      resolution: winningSide === 'yes',
      resolutionProofUrl: resolutionProofUrl ?? undefined,
      resolutionDescription: resolutionDescription ?? undefined,
    });

    const positions = await this.db.listPositionsForMarket(marketId);
    const now = this.now();
    for (const pos of positions) {
      const isWinner = (winningSide === 'yes' && pos.side === 'yes') ||
        (winningSide === 'no' && pos.side === 'no');
      const payout = isWinner ? pos.shares : 0;
      if (payout > 0) {
        await this.deps.wallet.credit({
          userId: pos.userId,
          amount: payout,
          reason: 'pred_resolve',
          description: `Payout ${winningSide.toUpperCase()} for ${market.question}`,
          relatedId: marketId,
        });
        await this.deps.wallet.recordPnL({
          userId: pos.userId,
          pnl: payout - pos.avgPrice * pos.shares,
          reason: 'pred_resolve',
          relatedId: marketId,
        });
      }
      await this.db.upsertPosition({
        ...pos,
        status: 'resolved',
        outcome: isWinner,
        pnl: payout - pos.avgPrice * pos.shares,
        resolvedAt: now,
        updatedAt: now,
      });
    }

    await this.recordSnapshot({
      marketId,
      yesPrice: winningSide === 'yes' ? 1 : 0,
      noPrice: winningSide === 'no' ? 1 : 0,
      yesShares: market.yesShares,
      noShares: market.noShares,
      liquidity: market.liquidity,
      eventType: 'resolution',
      source: 'system',
    });

    await this.emitResolution(marketId, {
      type: 'prediction_resolution',
      marketId,
      winningSide,
      yesShares: market.yesShares,
      noShares: market.noShares,
      liquidity: market.liquidity,
      totalPayout: positions
        .filter((p) =>
          (winningSide === 'yes' && p.side === 'yes') ||
          (winningSide === 'no' && p.side === 'no')
        )
        .reduce((acc, p) => acc + p.shares, 0),
      timestamp: now.toISOString(),
      resolutionProofUrl,
      resolutionDescription,
    });

    await this.invalidateCaches(marketId);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  private async ensureMarket(marketId: string): Promise<PredictionMarketRecord> {
    const market = await this.db.getMarketById(marketId);
    if (market) return market;

    const question = await this.db.getQuestion?.(marketId);
    if (!question) {
      throw new Error(`Market not found: ${marketId}`);
    }
    return this.db.createMarketFromQuestion(question, DEFAULT_LIQUIDITY);
  }

  private assertMarketActive(market: PredictionMarketRecord) {
    if (market.resolved) {
      throw new Error('Market has resolved');
    }
    if (new Date() > market.endDate) {
      throw new Error('Market expired');
    }
    if (market.liquidity <= 0) {
      throw new Error('Market has no liquidity');
    }
  }

  private async recordSnapshot(snapshot: PredictionPriceSnapshotRecord) {
    if (!this.db.insertPriceSnapshot) return;
    await this.db.insertPriceSnapshot({
      ...snapshot,
      createdAt: snapshot.createdAt ?? this.now(),
    });
  }

  private async emitTrade(marketId: string, payload: Record<string, unknown>) {
    if (!this.deps.broadcast) return;
    await this.deps.broadcast.emit('markets', payload);
  }

  private async emitResolution(
    marketId: string,
    payload: Record<string, unknown>
  ) {
    if (!this.deps.broadcast) return;
    await this.deps.broadcast.emit('markets', payload);
  }

  private async invalidateCaches(marketId: string) {
    if (!this.deps.cache) return;
    await this.deps.cache.invalidate(`prediction:${marketId}:*`);
  }

  private now() {
    return this.deps.clock?.now() ?? new Date();
  }
}
