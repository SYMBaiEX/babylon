/**
 * One-off funding step runner for perps.
 *
 * Usage:
 *   bun packages/core/markets/perps/scripts/run-funding-step.ts
 *
 * This will process funding (8h period) across all open positions and update
 * funding rates in PerpMarketSnapshot.
 */

import { PerpDbAdapter, PerpMarketService } from '@babylon/core/markets/perps';
import { FEE_CONFIG, WalletService } from '@babylon/engine';

async function main() {
  const service = new PerpMarketService({
    db: new PerpDbAdapter(),
    wallet: {
      debit: ({ userId, amount, reason, description, relatedId }) =>
        WalletService.debit(userId, amount, reason, description ?? '', relatedId),
      credit: ({ userId, amount, reason, description, relatedId }) =>
        WalletService.credit(userId, amount, reason, description ?? '', relatedId),
      recordPnL: async ({ userId, pnl, reason, relatedId }) => {
        await WalletService.recordPnL(userId, pnl, reason, relatedId);
      },
      getBalance: (userId: string) => WalletService.getBalance(userId),
    },
    fees: {
      tradingFeeRate: FEE_CONFIG.TRADING_FEE_RATE,
      platformShare: FEE_CONFIG.PLATFORM_SHARE,
      referrerShare: FEE_CONFIG.REFERRER_SHARE,
      minFeeAmount: FEE_CONFIG.MIN_FEE_AMOUNT,
    },
  });

  await service.processFundingAndLiquidations();
  console.log('Perp funding step processed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
