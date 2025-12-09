/**
 * Perpetual Futures Close Position API
 *
 * @route POST /api/markets/perps/position/[id]/close
 * @access Authenticated
 *
 * Closes an existing perpetual futures position. Calculates final P&L, fees,
 * and updates user balance. Tracks trade events.
 */

import { authenticate, successResponse, withErrorHandling } from '@babylon/api';
import { PerpDbAdapter, PerpMarketService } from '@babylon/core/markets/perps';
import { ClosePerpPositionSchema } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { trackServerEvent } from '@/lib/posthog/server';
import { createWalletAdapter, perpFeeConfig } from '../../../_adapters';

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

    const text = await request.text();
    const parsed = text.length > 0
      ? ClosePerpPositionSchema.parse(JSON.parse(text))
      : { percentage: undefined, slippage: undefined };

    const service = new PerpMarketService({
      db: new PerpDbAdapter(),
      wallet: createWalletAdapter(),
      fees: perpFeeConfig,
    });

    const result = await service.closePosition({
      userId: user.userId,
      positionId,
      percentage: parsed.percentage,
      maxSlippage: parsed.slippage,
    });

    void trackServerEvent(user.userId, 'trade_closed', {
      type: 'perp',
      ticker: result.ticker,
      side: result.side,
      size: result.size,
      leverage: result.leverage,
      entryPrice: result.entryPrice,
      exitPrice: result.exitPrice ?? result.entryPrice,
      realizedPnL: result.realizedPnL ?? 0,
      pnlPercent:
        result.marginPaid && result.marginPaid > 0
          ? ((result.realizedPnL ?? 0) / result.marginPaid) * 100
          : 0,
      feeCharged: result.feePaid,
      wasLiquidated: false,
      positionId,
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
      remainingSize: result.remainingSize,
      fullyClosed: result.fullyClosed,
    });
  }
);
