/**
 * Integration test for resolving prediction market payouts
 */

import { describe, test, expect } from 'bun:test';
import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { resolveQuestionPayouts } from '@/lib/serverless-game-tick';
import { WalletService } from '@/lib/services/wallet-service';
import { generateSnowflakeId } from '@/lib/snowflake';

describe('Prediction resolution payouts', () => {
  test('credits winners, leaves losers untouched, and closes positions', async () => {
    const winnerId = await generateSnowflakeId();
    const loserId = await generateSnowflakeId();

    const questionId = await generateSnowflakeId();
    const questionNumber = Math.floor(Math.random() * 1_000_000);
    const marketId = questionId;
    const now = new Date();

    await prisma.user.createMany({
      data: [
        {
          id: winnerId,
          updatedAt: now,
          virtualBalance: new Prisma.Decimal(1000),
          totalDeposited: new Prisma.Decimal(1000),
          totalWithdrawn: new Prisma.Decimal(0),
          lifetimePnL: new Prisma.Decimal(0),
        },
        {
          id: loserId,
          updatedAt: now,
          virtualBalance: new Prisma.Decimal(1000),
          totalDeposited: new Prisma.Decimal(1000),
          totalWithdrawn: new Prisma.Decimal(0),
          lifetimePnL: new Prisma.Decimal(0),
        },
      ],
      skipDuplicates: false,
    });

    await prisma.question.create({
      data: {
        id: questionId,
        questionNumber,
        text: 'Test resolution question',
        scenarioId: 1,
        outcome: true,
        rank: 1,
        resolutionDate: now,
        status: 'active',
        updatedAt: now,
      },
    });

    await prisma.market.create({
      data: {
        id: marketId,
        question: 'Test resolution question',
        liquidity: new Prisma.Decimal(1000),
        yesShares: new Prisma.Decimal(500),
        noShares: new Prisma.Decimal(500),
        resolved: false,
        endDate: now,
        updatedAt: now,
      },
    });

    const winnerPositionId = await generateSnowflakeId();
    const loserPositionId = await generateSnowflakeId();

    await prisma.position.createMany({
      data: [
        {
          id: winnerPositionId,
          userId: winnerId,
          marketId,
          questionId: questionNumber,
          side: true,
          shares: new Prisma.Decimal(100),
          avgPrice: new Prisma.Decimal(0.4),
          status: 'active',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: loserPositionId,
          userId: loserId,
          marketId,
          questionId: questionNumber,
          side: false,
          shares: new Prisma.Decimal(50),
          avgPrice: new Prisma.Decimal(0.6),
          status: 'active',
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    // Simulate users paying for their positions
    await WalletService.debit(
      winnerId,
      40,
      'pred_buy',
      'Test winner position',
      marketId
    );
    await WalletService.debit(
      loserId,
      30,
      'pred_buy',
      'Test loser position',
      marketId
    );

    try {
      await resolveQuestionPayouts(questionNumber);

      const winner = await prisma.user.findUnique({ where: { id: winnerId } });
      const loser = await prisma.user.findUnique({ where: { id: loserId } });

      expect(Number(winner?.virtualBalance ?? 0)).toBeCloseTo(1060, 5);
      expect(Number(loser?.virtualBalance ?? 0)).toBeCloseTo(970, 5);

      const winnerPnL = Number(winner?.lifetimePnL ?? 0);
      const loserPnL = Number(loser?.lifetimePnL ?? 0);
      expect(winnerPnL).toBeCloseTo(60, 5);
      expect(loserPnL).toBeCloseTo(-30, 5);

      const winnerPosition = await prisma.position.findUnique({
        where: { id: winnerPositionId },
      });
      const loserPosition = await prisma.position.findUnique({
        where: { id: loserPositionId },
      });

      expect(winnerPosition?.status).toBe('resolved');
      expect(winnerPosition?.outcome).toBe(true);
      expect(Number(winnerPosition?.pnl ?? 0)).toBeCloseTo(60, 5);
      expect(Number(winnerPosition?.shares ?? 0)).toBe(0);
      expect(winnerPosition?.resolvedAt).not.toBeNull();

      expect(loserPosition?.status).toBe('resolved');
      expect(loserPosition?.outcome).toBe(false);
      expect(Number(loserPosition?.pnl ?? 0)).toBeCloseTo(-30, 5);
      expect(Number(loserPosition?.shares ?? 0)).toBe(0);

      const winnerTransactions = await prisma.balanceTransaction.findMany({
        where: { userId: winnerId, type: 'pred_resolve_win' },
      });
      expect(winnerTransactions).toHaveLength(1);
      expect(Number(winnerTransactions[0]!.amount)).toBeCloseTo(100, 5);

      const loserTransactions = await prisma.balanceTransaction.findMany({
        where: { userId: loserId, type: 'pred_resolve_win' },
      });
      expect(loserTransactions).toHaveLength(0);

      const market = await prisma.market.findUnique({ where: { id: marketId } });
      expect(market?.resolved).toBe(true);
      expect(market?.resolution).toBe(true);
      expect(Number(market?.liquidity ?? 0)).toBeCloseTo(900, 5);

      const resolvedQuestion = await prisma.question.findUnique({
        where: { id: questionId },
      });
      expect(resolvedQuestion?.resolvedOutcome).toBe(true);
    } finally {
      await prisma.balanceTransaction.deleteMany({
        where: { userId: { in: [winnerId, loserId] } },
      });
      await prisma.position.deleteMany({ where: { marketId } });
      await prisma.market.deleteMany({ where: { id: marketId } });
      await prisma.question.deleteMany({ where: { id: questionId } });
      await prisma.user.deleteMany({ where: { id: { in: [winnerId, loserId] } } });
    }
  });
});
