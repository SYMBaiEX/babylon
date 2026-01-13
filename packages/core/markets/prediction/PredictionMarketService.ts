import { PredictionPricing } from './pricing';
import type {
  PredictionBuyInput,
  PredictionDbPort,
  PredictionMarketRecord,
  PredictionPositionRecord,
  PredictionPriceSnapshotRecord,
  PredictionResolveInput,
  PredictionSellInput,
  PredictionServiceDeps,
  PredictionSide,
  PredictionTradeResult,
} from './types';

const DEFAULT_LIQUIDITY = 10_000;
const MIN_SHARES = 0.01;
const MIN_TRADE_AMOUNT = 1;

function grossUpBuyAmount(netAmount: number, feeRate: number): number {
  if (!Number.isFinite(netAmount)) return 0;
  if (!Number.isFinite(feeRate) || feeRate <= 0) return netAmount;
  const divisor = 1 - feeRate;
  if (divisor <= 0) return netAmount;
  return netAmount / divisor;
}

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

  /**
   * Ensure a market row exists for a given question/market id.
   *
   * This is useful for game/engine flows that create questions first and want
   * the corresponding market to exist immediately (e.g. for on-chain setup),
   * rather than lazily on first trade.
   */
  async ensureMarketExists(input: {
    marketId: string;
    initialLiquidity?: number;
    description?: string | null;
  }): Promise<PredictionMarketRecord> {
    const existing = await this.db.getMarketById(input.marketId);
    if (existing) return existing;

    const question = await this.db.getQuestion?.(input.marketId);
    if (!question) {
      throw new Error(`Market not found: ${input.marketId}`);
    }
    return this.db.createMarketFromQuestion(
      question,
      input.initialLiquidity ?? DEFAULT_LIQUIDITY,
      { description: input.description }
    );
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

    this.assertMarketActiveForBuy(market);

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
            status: 'active',
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

    await this.emitTrade({
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

    this.assertMarketActiveForSell(market);

    const yesPos = await this.db.getPosition(userId, marketId, 'yes');
    const noPos = await this.db.getPosition(userId, marketId, 'no');
    const positions = [yesPos, noPos]
      .filter((p): p is NonNullable<typeof p> => !!p)
      // Exclude closed/empty positions from sell selection (we keep them for history)
      .filter((p) => p.status !== 'closed' && p.shares > MIN_SHARES);

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

    const costBasis = pos.avgPrice * shares;
    const netProceeds = calc.netProceeds ?? 0;
    const profitLoss = netProceeds - costBasis;

    const remaining = pos.shares - shares;
    const positionClosed = remaining <= MIN_SHARES;
    if (positionClosed) {
      await this.db.upsertPosition({
        ...pos,
        shares: 0,
        status: 'closed',
        updatedAt: this.now(),
      });
    } else {
      await this.db.upsertPosition({
        ...pos,
        shares: remaining,
        updatedAt: this.now(),
      });
    }

    const costBasis = pos.avgPrice * shares;
    const netProceeds = calc.netProceeds ?? 0;
    // Position.avgPrice is based on the net buy amount (after fees), so costBasis excludes entry fees.
    // Gross-up the cost basis to include entry fees for accurate net PnL accounting.
    const costBasisWithFees = grossUpBuyAmount(
      costBasis,
      this.deps.fees.tradingFeeRate
    );
    const profitLoss = netProceeds - costBasisWithFees;

    await this.deps.wallet.credit({
      userId,
      amount: netProceeds,
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

    await this.emitTrade({
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
        amount: netProceeds,
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
      netProceeds,
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
    const positions = await this.db.listPositionsForMarket(marketId);
    const market = await this.ensureMarket(marketId);
    if (market.resolved) return;

    const now = input.resolvedAt ?? this.now();
    const totalPayout = positions
      .filter(
        (p) =>
          (winningSide === 'yes' && p.side === 'yes') ||
          (winningSide === 'no' && p.side === 'no')
      )
      .reduce((acc, p) => acc + p.shares, 0);

    const liquidityReduction = Math.min(totalPayout, market.liquidity);
    const newLiquidity = market.liquidity - liquidityReduction;

    await this.db.updateMarketState(marketId, {
      resolved: true,
      resolution: winningSide === 'yes',
      liquidity: newLiquidity,
      resolutionProofUrl: resolutionProofUrl ?? undefined,
      resolutionDescription: resolutionDescription ?? undefined,
    });

    for (const pos of positions) {
      const isWinner =
        (winningSide === 'yes' && pos.side === 'yes') ||
        (winningSide === 'no' && pos.side === 'no');
      const payout = isWinner ? pos.shares : 0;
      const costBasisWithFees = grossUpBuyAmount(
        pos.avgPrice * pos.shares,
        this.deps.fees.tradingFeeRate
      );
      const pnl = payout - costBasisWithFees;

      if (payout > 0) {
        await this.deps.wallet.credit({
          userId: pos.userId,
          amount: payout,
          reason: 'pred_resolve',
          description: `Payout ${winningSide.toUpperCase()} for ${market.question}`,
          relatedId: marketId,
        });
      }
      if (pnl !== 0) {
        await this.deps.wallet.recordPnL({
          userId: pos.userId,
          pnl,
          reason: 'pred_resolve',
          relatedId: marketId,
        });
      }
      await this.db.upsertPosition({
        ...pos,
        status: 'resolved',
        outcome: isWinner,
        pnl,
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
      liquidity: newLiquidity,
      eventType: 'resolution',
      source: 'system',
    });

    await this.emitResolution({
      type: 'prediction_resolution',
      marketId,
      winningSide,
      yesShares: market.yesShares,
      noShares: market.noShares,
      liquidity: newLiquidity,
      totalPayout,
      timestamp: now.toISOString(),
      resolutionProofUrl,
      resolutionDescription,
    });

    await this.invalidateCaches(marketId);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  private async ensureMarket(
    marketId: string
  ): Promise<PredictionMarketRecord> {
    const market = await this.db.getMarketById(marketId);
    if (market) return market;

    const question = await this.db.getQuestion?.(marketId);
    if (!question) {
      throw new Error(`Market not found: ${marketId}`);
    }
    return this.db.createMarketFromQuestion(question, DEFAULT_LIQUIDITY);
  }

  /**
   * Assert market is open for new trades (buys).
   * Blocks if resolved, expired, or no liquidity.
   */
  private assertMarketActiveForBuy(market: PredictionMarketRecord) {
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

  /**
   * Assert market allows position exits (sells).
   * Users can sell on expired markets to close positions before resolution.
   * Only blocks if already resolved.
   */
  private assertMarketActiveForSell(market: PredictionMarketRecord) {
    if (market.resolved) {
      throw new Error('Market has resolved');
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

  private async emitTrade(payload: Record<string, unknown>) {
    if (!this.deps.broadcast) return;
    await this.deps.broadcast.emit('markets', payload);
  }

  private async emitResolution(payload: Record<string, unknown>) {
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
