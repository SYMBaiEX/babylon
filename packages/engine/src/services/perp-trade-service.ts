/**
 * Perpetual Futures Trade Service (delegates to core PerpMarketService)
 *
 * Thin compatibility wrapper to keep existing consumers working while
 * the domain logic lives in @babylon/core/markets/perps.
 */

import type { AuthenticatedUser } from '@babylon/shared';
import type { PerpPosition } from '@babylon/shared';
import { PerpMarketService, PerpDbAdapter } from '@babylon/core/markets/perps';
import { WalletPortAdapter } from '@babylon/core/markets/shared';
import { FEE_CONFIG } from '@babylon/engine';

export interface OpenPerpPositionInput {
  ticker: string;
  side: 'long' | 'short';
  size: number;
  leverage: number;
}

export interface OpenPerpPositionResult {
  position: PerpPosition;
  marginPaid: number;
  fee: {
    feeCharged: number;
    referrerPaid: number;
    platformReceived: number;
    referrerId: string | null;
  };
  newBalance: number;
}

export interface ClosePerpPositionResult {
  position: PerpPosition;
  realizedPnL: number;
  marginReturned: number;
  grossSettlement: number;
  netSettlement: number;
  wasLiquidated: boolean;
  fee: {
    feeCharged: number;
    referrerPaid: number;
    platformReceived: number;
    referrerId: string | null;
  };
  newBalance: number;
}

export class PerpTradeService {
  private static createService() {
    const dbAdapter = new PerpDbAdapter();
    const service = new PerpMarketService({
      db: dbAdapter,
      wallet: WalletPortAdapter,
      fees: {
        tradingFeeRate: FEE_CONFIG.TRADING_FEE_RATE,
        platformShare: FEE_CONFIG.PLATFORM_SHARE,
        referrerShare: FEE_CONFIG.REFERRER_SHARE,
        minFeeAmount: FEE_CONFIG.MIN_FEE_AMOUNT,
      },
    });
    return { service, dbAdapter };
  }

  static async openPosition(
    authUser: AuthenticatedUser,
    input: OpenPerpPositionInput
  ): Promise<OpenPerpPositionResult> {
    const { service, dbAdapter } = this.createService();
    const result = await service.openPosition({
      userId: authUser.userId,
      ticker: input.ticker,
      side: input.side,
      size: input.size,
      leverage: input.leverage,
    });

    const pos = await dbAdapter.getPositionById(result.positionId);
    if (!pos) {
      throw new Error(`Position not found after open: ${result.positionId}`);
    }

    const position: PerpPosition = {
      id: pos.id,
      userId: pos.userId,
      ticker: pos.ticker,
      organizationId: pos.organizationId,
      side: pos.side,
      entryPrice: pos.entryPrice,
      currentPrice: pos.currentPrice,
      size: pos.size,
      leverage: pos.leverage,
      liquidationPrice: pos.liquidationPrice,
      unrealizedPnL: pos.unrealizedPnL,
      unrealizedPnLPercent: pos.unrealizedPnLPercent,
      fundingPaid: pos.fundingPaid,
      openedAt: pos.openedAt,
      lastUpdated: pos.lastUpdated,
    };

    const marginPaid = result.marginPaid ?? pos.size / pos.leverage;
    const feeCharged = result.feePaid ?? 0;
    const balance = result.balance ?? (await WalletPortAdapter.getBalance(authUser.userId)).balance;

    return {
      position,
      marginPaid,
      fee: {
        feeCharged,
        referrerPaid: 0,
        platformReceived: feeCharged,
        referrerId: null,
      },
      newBalance: balance,
    };
  }

  static async closePosition(
    authUser: AuthenticatedUser,
    positionId: string
  ): Promise<ClosePerpPositionResult> {
    const { service, dbAdapter } = this.createService();
    const result = await service.closePosition({
      userId: authUser.userId,
      positionId,
    });

    const pos = await dbAdapter.getPositionById(positionId);
    if (!pos) {
      throw new Error(`Position not found after close: ${positionId}`);
    }

    const position: PerpPosition = {
      id: pos.id,
      userId: pos.userId,
      ticker: pos.ticker,
      organizationId: pos.organizationId,
      side: pos.side,
      entryPrice: pos.entryPrice,
      currentPrice: result.exitPrice ?? pos.currentPrice,
      size: pos.size,
      leverage: pos.leverage,
      liquidationPrice: pos.liquidationPrice,
      unrealizedPnL: pos.unrealizedPnL,
      unrealizedPnLPercent: pos.unrealizedPnLPercent,
      fundingPaid: pos.fundingPaid,
      openedAt: pos.openedAt,
      lastUpdated: pos.lastUpdated,
    };

    const realizedPnL = result.realizedPnL ?? 0;
    const marginPaid = result.marginPaid ?? pos.size / pos.leverage;
    const grossSettlement = marginPaid + realizedPnL;
    const feeCharged = result.feePaid ?? 0;
    const netSettlement = Math.max(0, grossSettlement - feeCharged);
    const balance = result.balance ?? (await WalletPortAdapter.getBalance(authUser.userId)).balance;

    return {
      position,
      realizedPnL,
      marginReturned: marginPaid,
      grossSettlement,
      netSettlement,
      wasLiquidated: false,
      fee: {
        feeCharged,
        referrerPaid: 0,
        platformReceived: feeCharged,
        referrerId: null,
      },
      newBalance: balance,
    };
  }
}
