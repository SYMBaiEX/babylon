/**
 * Integration tests for TradeExecutionService prediction trades
 */

import { describe, test, expect } from 'bun:test';
import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { TradeExecutionService } from '@/lib/services/trade-execution-service';
import { PredictionPricing } from '@/lib/prediction-pricing';
import { generateSnowflakeId } from '@/lib/snowflake';
import type { TradingDecision } from '@/types/market-decisions';

const decimal = (value: number) => new Prisma.Decimal(value);
const service = new TradeExecutionService();

async function createActorWithPool(initialBalance: number) {
  const actorId = await generateSnowflakeId();
  const npcName = `Test NPC ${actorId}`;

  await prisma.actor.create({
    data: {
      id: actorId,
      name: npcName,
      description: null,
      domain: [],
      personality: null,
      tier: 'test',
      affiliations: [],
      postStyle: null,
      postExample: [],
      role: 'npc',
      hasPool: true,
      updatedAt: new Date(),
    },
  });

  const poolId = await generateSnowflakeId();
  await prisma.pool.create({
    data: {
      id: poolId,
      npcActorId: actorId,
      name: `Pool ${actorId}`,
      totalValue: decimal(initialBalance),
      totalDeposits: decimal(initialBalance),
      availableBalance: decimal(initialBalance),
      lifetimePnL: decimal(0),
      totalFeesCollected: decimal(0),
      updatedAt: new Date(),
    },
  });

  return { actorId, poolId, npcName };
}

async function createPredictionMarket(initialLiquidity: number) {
  const marketId = await generateSnowflakeId();
  const half = initialLiquidity / 2;
  const now = new Date();

  await prisma.market.create({
    data: {
      id: marketId,
      question: `Test market ${marketId}`,
      yesShares: decimal(half),
      noShares: decimal(half),
      liquidity: decimal(initialLiquidity),
      resolved: false,
      endDate: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      createdAt: now,
      updatedAt: now,
    },
  });

  return { marketId, initialYes: half, initialNo: half };
}

async function cleanupTestData(poolId: string, actorId: string, marketId: string) {
  await prisma.poolPosition.deleteMany({ where: { poolId } });
  await prisma.nPCTrade.deleteMany({ where: { poolId } });
  await prisma.pool.deleteMany({ where: { id: poolId } });
  await prisma.actor.deleteMany({ where: { id: actorId } });
  // Clean up price history before deleting market (even though cascade should handle it)
  await prisma.predictionPriceHistory.deleteMany({ where: { marketId } }).catch(() => {
    // Ignore if table doesn't exist
  });
  await prisma.market.deleteMany({ where: { id: marketId } });
}

describe('TradeExecutionService prediction CPMM alignment', () => {
  test('buy trade preserves constant product and debits pool with fees', async () => {
    const initialBalance = 5_000;
    const { actorId, poolId, npcName } = await createActorWithPool(initialBalance);
    const { marketId, initialYes, initialNo } = await createPredictionMarket(1_000);

    const decision: TradingDecision = {
      npcId: actorId,
      npcName,
      action: 'buy_yes',
      marketType: 'prediction',
      marketId,
      amount: 250,
      confidence: 0.85,
      reasoning: 'Test buy alignment',
    };

    try {
      const buyCalc = PredictionPricing.calculateBuyWithFees(
        initialYes,
        initialNo,
        'yes',
        decision.amount
      );
      const initialK = initialYes * initialNo;

      const executed = await service.executeSingleDecision(decision);
      expect(executed.marketType).toBe('prediction');
      expect(executed.shares).toBeCloseTo(buyCalc.sharesBought, 6);

      const marketAfter = await prisma.market.findUniqueOrThrow({ where: { id: marketId } });
      const poolAfter = await prisma.pool.findUniqueOrThrow({ where: { id: poolId } });
      const position = await prisma.poolPosition.findFirstOrThrow({
        where: { poolId, marketId },
      });

      expect(Number(marketAfter.yesShares)).toBeCloseTo(buyCalc.newYesShares, 6);
      expect(Number(marketAfter.noShares)).toBeCloseTo(buyCalc.newNoShares, 6);

      const newK = Number(marketAfter.yesShares) * Number(marketAfter.noShares);
      expect(Math.abs(newK - initialK)).toBeLessThan(1e-3);

      expect(Number(poolAfter.availableBalance)).toBeCloseTo(
        initialBalance - (buyCalc.totalWithFee ?? decision.amount),
        6
      );
      expect(Number(poolAfter.totalFeesCollected)).toBeCloseTo(buyCalc.fee, 6);

      expect(position.size).toBeCloseTo(buyCalc.netAmount, 6);
      expect(position.shares ?? 0).toBeCloseTo(buyCalc.sharesBought, 6);
    } finally {
      await cleanupTestData(poolId, actorId, marketId);
    }
  });

  test('closing prediction position returns liquidity and only costs fees', async () => {
    const initialBalance = 7_500;
    const { actorId, poolId, npcName } = await createActorWithPool(initialBalance);
    const { marketId, initialYes, initialNo } = await createPredictionMarket(1_000);

    const buyDecision: TradingDecision = {
      npcId: actorId,
      npcName,
      action: 'buy_yes',
      marketType: 'prediction',
      marketId,
      amount: 300,
      confidence: 0.7,
      reasoning: 'Round-trip buy',
    };

    try {
      const buyCalc = PredictionPricing.calculateBuyWithFees(
        initialYes,
        initialNo,
        'yes',
        buyDecision.amount
      );

      const executedBuy = await service.executeSingleDecision(buyDecision);
      expect(executedBuy.positionId).toBeTruthy();

      const marketMid = await prisma.market.findUniqueOrThrow({ where: { id: marketId } });
      const position = await prisma.poolPosition.findFirstOrThrow({
        where: { poolId, marketId },
      });
      const shares = position.shares ?? 0;

      const sellCalc = PredictionPricing.calculateSellWithFees(
        Number(marketMid.yesShares),
        Number(marketMid.noShares),
        'yes',
        shares
      );

      const closeDecision: TradingDecision = {
        npcId: actorId,
        npcName,
        action: 'close_position',
        marketType: 'prediction',
        marketId,
        positionId: position.id,
        amount: 0,
        confidence: 0.9,
        reasoning: 'Round-trip close',
      };

      const executedClose = await service.executeSingleDecision(closeDecision);
      expect(executedClose.marketType).toBe('prediction');
      expect(executedClose.amount).toBeCloseTo(sellCalc.netProceeds ?? 0, 6);

      const finalMarket = await prisma.market.findUniqueOrThrow({ where: { id: marketId } });
      const finalPool = await prisma.pool.findUniqueOrThrow({ where: { id: poolId } });

      expect(Number(finalMarket.yesShares)).toBeCloseTo(initialYes, 6);
      expect(Number(finalMarket.noShares)).toBeCloseTo(initialNo, 6);

      const expectedBalance =
        initialBalance - buyCalc.fee - (sellCalc.fee ?? 0);
      expect(Number(finalPool.availableBalance)).toBeCloseTo(expectedBalance, 2);
      expect(Number(finalPool.totalFeesCollected)).toBeCloseTo(
        buyCalc.fee + (sellCalc.fee ?? 0),
        2
      );
      const expectedLifetimePnL = -(sellCalc.fee ?? 0);
      expect(Number(finalPool.lifetimePnL)).toBeCloseTo(expectedLifetimePnL, 2);

      const closedPosition = await prisma.poolPosition.findUnique({
        where: { id: position.id },
      });
      expect(closedPosition?.closedAt).not.toBeNull();
    } finally {
      await cleanupTestData(poolId, actorId, marketId);
    }
  });
});
