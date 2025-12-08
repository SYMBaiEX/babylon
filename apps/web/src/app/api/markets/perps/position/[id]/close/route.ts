import { authenticate, successResponse, withErrorHandling } from '@babylon/api';
import { PerpDbAdapter, PerpMarketService } from '@babylon/core/markets/perps';
import { FEE_CONFIG, WalletService } from '@babylon/engine';
import { ClosePerpPositionSchema } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { trackServerEvent } from '@/lib/posthog/server';

const IdParamSchema = z.object({
  id: z.string(),
});

/**
 * POST /api/markets/perps/position/[id]/close
 * Close an existing perpetual futures position
 */
export const POST = withErrorHandling(
  async (
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
  ) => {
    const user = await authenticate(request);
    const { id: positionId } = IdParamSchema.parse(await context.params);

    // Parse and validate request body (optional for partial close)
    let body: Record<string, unknown> = {};
    try {
      body = await request.json();
    } catch {
      // Body is optional for this endpoint
    }
    if (Object.keys(body).length > 0) {
      ClosePerpPositionSchema.parse(body);
    }

    const service = new PerpMarketService({
      db: new PerpDbAdapter(),
      wallet: {
        debit: ({ userId, amount, reason, description, relatedId }) =>
          WalletService.debit(
            userId,
            amount,
            reason,
            description ?? '',
            relatedId
          ),
        credit: ({ userId, amount, reason, description, relatedId }) =>
          WalletService.credit(
            userId,
            amount,
            reason,
            description ?? '',
            relatedId
          ),
        recordPnL: ({ userId, pnl, reason, relatedId }) =>
          WalletService.recordPnL(userId, pnl, reason, relatedId),
        getBalance: (userId: string) => WalletService.getBalance(userId),
      },
      fees: {
        tradingFeeRate: FEE_CONFIG.TRADING_FEE_RATE,
        platformShare: FEE_CONFIG.PLATFORM_SHARE,
        referrerShare: FEE_CONFIG.REFERRER_SHARE,
        minFeeAmount: FEE_CONFIG.MIN_FEE_AMOUNT,
      },
    });

    const result = await service.closePosition({
      userId: user.userId,
      positionId,
    });

    trackServerEvent(user.userId, 'trade_closed', {
      type: 'perp',
      ticker: result.ticker,
      side: result.side,
      size: result.size,
      leverage: result.leverage,
      entryPrice: result.entryPrice,
      exitPrice: result.exitPrice,
      realizedPnL: result.realizedPnL ?? 0,
      pnlPercent:
        result.marginPaid && result.marginPaid > 0
          ? ((result.realizedPnL ?? 0) / result.marginPaid) * 100
          : 0,
      feeCharged: result.feePaid,
      wasLiquidated: false,
      positionId,
    }).catch((error) => {
      console.warn('Failed to track trade_closed event', { error });
    });

    return successResponse({
      position: result,
      grossSettlement:
        result.realizedPnL !== undefined && result.marginPaid !== undefined
          ? result.marginPaid + result.realizedPnL
          : undefined,
      netSettlement:
        result.realizedPnL !== undefined && result.marginPaid !== undefined
          ? Math.max(0, result.marginPaid + result.realizedPnL - result.feePaid)
          : undefined,
      marginReturned: result.marginPaid,
      pnl: result.realizedPnL,
      fee: {
        amount: result.feePaid,
        referrerPaid: 0,
      },
      wasLiquidated: false,
      newBalance: result.balance,
    });
  }
);
