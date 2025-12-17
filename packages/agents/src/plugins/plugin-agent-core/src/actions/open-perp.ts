/**
 * Open Perp Action
 * Open a leveraged perpetual position via direct DB operations
 * (Same pattern as AutonomousTradingService)
 */

import { PerpDbAdapter, PerpMarketService } from '@babylon/core/markets/perps';
import { FEE_CONFIG, WalletService } from '@babylon/engine';
import type {
  Action,
  ActionResult,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from '@elizaos/core';
import { AgentPnLService } from '../../../../services/AgentPnLService';
import { logger } from '../../../../shared/logger';

const agentPnLService = new AgentPnLService();

export const openPerpAction: Action = {
  name: 'OPEN_PERP',
  description:
    'Open a leveraged perpetual position on a stock/company. IMPORTANT: Always call CHECK_PERPS first to get available tickers and current prices, and CHECK_BALANCE to verify sufficient funds. Requires ticker, side (LONG/SHORT), amount in dollars, and optional leverage (1-10x).',
  parameters: {
    ticker: {
      type: 'string',
      description: 'Stock ticker symbol (e.g., AAPL, TSLA, NVDA)',
      required: true,
    },
    side: {
      type: 'string',
      enum: ['LONG', 'SHORT'],
      description:
        'Position direction: "LONG" (bet price goes up) or "SHORT" (bet price goes down)',
      required: true,
    },
    amount: {
      type: 'number',
      description: 'Dollar amount to use as collateral',
      required: true,
    },
    leverage: {
      type: 'number',
      description: 'Leverage multiplier (1-10x). Default: 1',
      required: false,
    },
  },
  examples: [
    [
      {
        name: 'user',
        content: { text: 'Open a 5x long on NVDA with $100' },
      },
      {
        name: 'assistant',
        content: { text: 'Opening a leveraged long position on NVDA...' },
      },
    ],
    [
      {
        name: 'user',
        content: { text: 'Short Tesla with $50' },
      },
      {
        name: 'assistant',
        content: { text: "I'll open a short position on TSLA for you." },
      },
    ],
  ],

  validate: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state?: State
  ): Promise<boolean> => true,

  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    state?: State,
    _options?: Record<string, unknown>,
    _callback?: HandlerCallback
  ): Promise<ActionResult> => {
    const agentUserId = runtime.agentId;

    // Get parameters from state
    const actionParams = state?.data?.actionParams as
      | {
          ticker?: string;
          side?: 'LONG' | 'SHORT';
          amount?: number;
          leverage?: number;
        }
      | undefined;

    const ticker = actionParams?.ticker?.toLowerCase();
    const side = actionParams?.side?.toUpperCase() as
      | 'LONG'
      | 'SHORT'
      | undefined;
    const amount = actionParams?.amount;
    const leverage = Math.min(Math.max(actionParams?.leverage ?? 1, 1), 10);

    if (!ticker || !side || !amount) {
      return {
        success: false,
        text: 'Missing required parameters. Need ticker, side (LONG/SHORT), and amount.',
        data: { error: 'Missing parameters' },
        values: { error: 'Missing parameters' },
      };
    }

    if (side !== 'LONG' && side !== 'SHORT') {
      return {
        success: false,
        text: 'Invalid side. Must be LONG or SHORT.',
        data: { error: 'Invalid side' },
        values: { error: 'Invalid side' },
      };
    }

    if (amount <= 0) {
      return {
        success: false,
        text: 'Amount must be greater than 0.',
        data: { error: 'Invalid amount' },
        values: { error: 'Invalid amount' },
      };
    }

    try {
      // Check balance
      const balance = await WalletService.getBalance(agentUserId);
      if (balance.balance < amount) {
        return {
          success: false,
          text: `Insufficient balance. You have $${balance.balance.toFixed(2)} but need $${amount}.`,
          data: { error: 'Insufficient balance', balance: balance.balance },
          values: { error: 'Insufficient balance', balance: balance.balance },
        };
      }

      // Create perp service with wallet adapter
      const walletAdapter = {
        debit: async ({
          userId,
          amount,
          reason,
          description,
          relatedId,
        }: {
          userId: string;
          amount: number;
          reason: string;
          description?: string;
          relatedId?: string;
        }) => {
          await WalletService.debit(
            userId,
            amount,
            reason,
            description ?? '',
            relatedId
          );
        },
        credit: async ({
          userId,
          amount,
          reason,
          description,
          relatedId,
        }: {
          userId: string;
          amount: number;
          reason: string;
          description?: string;
          relatedId?: string;
        }) => {
          await WalletService.credit(
            userId,
            amount,
            reason,
            description ?? '',
            relatedId
          );
        },
        recordPnL: async ({
          userId,
          pnl,
          reason,
          relatedId,
        }: {
          userId: string;
          pnl: number;
          reason: string;
          relatedId?: string;
        }) => {
          await WalletService.recordPnL(userId, pnl, reason, relatedId);
        },
        getBalance: WalletService.getBalance,
      };

      const service = new PerpMarketService({
        db: new PerpDbAdapter(),
        wallet: walletAdapter,
        fees: {
          tradingFeeRate: FEE_CONFIG.TRADING_FEE_RATE,
          platformShare: FEE_CONFIG.PLATFORM_SHARE,
          referrerShare: FEE_CONFIG.REFERRER_SHARE,
          minFeeAmount: FEE_CONFIG.MIN_FEE_AMOUNT,
        },
      });

      // Check if market exists
      const marketSnapshot = await service.getMarketsSnapshot();
      const market = marketSnapshot.find((m) => m.ticker === ticker);

      if (!market) {
        return {
          success: false,
          text: `Market ${ticker} not found. Available: ${marketSnapshot
            .slice(0, 5)
            .map((m) => m.ticker)
            .join(', ')}`,
          data: { error: 'Market not found', ticker },
          values: { error: 'Market not found', ticker },
        };
      }

      // Open position
      const tradeResult = await service.openPosition({
        userId: agentUserId,
        ticker,
        side: side.toLowerCase() as 'long' | 'short',
        size: amount,
        leverage,
      });

      // Record trade for UI/performance tracking
      await agentPnLService.recordTrade({
        agentId: agentUserId,
        userId: agentUserId,
        marketType: 'perp',
        ticker,
        action: 'open',
        side: side.toLowerCase() as 'long' | 'short',
        amount,
        price: tradeResult.entryPrice,
        reasoning:
          (state?.data?.thought as string) || 'Chat-initiated perp trade',
      });

      const responseText = `Opened ${leverage}x ${side} position on ${ticker} at $${tradeResult.entryPrice.toFixed(2)}. Size: $${amount}. Position ID: ${tradeResult.positionId}`;

      logger.info('[OPEN_PERP] Position opened', {
        agentUserId,
        ticker,
        side,
        amount,
        leverage,
        entryPrice: tradeResult.entryPrice,
        positionId: tradeResult.positionId,
      });

      return {
        success: true,
        text: responseText,
        data: {
          positionId: tradeResult.positionId,
          ticker,
          side,
          amount,
          leverage,
          entryPrice: tradeResult.entryPrice,
        },
        values: {
          positionId: tradeResult.positionId,
          ticker,
          side,
          amount,
          leverage,
          entryPrice: tradeResult.entryPrice,
        },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[OPEN_PERP] Error:', errorMsg);
      return {
        success: false,
        text: `Failed to open position: ${errorMsg}`,
        data: { error: errorMsg },
        values: { error: errorMsg },
      };
    }
  },
};
