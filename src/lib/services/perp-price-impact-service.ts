/**
 * Perpetual Price Impact Service
 * 
 * @module services/perp-price-impact-service
 * 
 * @description
 * This service was previously used to apply price impacts from user perpetual trades
 * to the underlying spot price. This has been DISABLED because:
 * 
 * **PERPETUALS ARE SYNTHETIC DERIVATIVES**
 * 
 * Architecture:
 * - NPC spot trades → affect organization prices (the "spot" market)
 * - User/agent perpetual trades → do NOT affect spot prices
 * - Perpetual mark price derives from spot price
 * - Funding rates reconcile long/short imbalances
 * 
 * The underlying price should ONLY be affected by NPC "spot" trading activity,
 * which is handled in serverless-game-tick.ts → updateMarketPricesFromTrades().
 * 
 * User perpetual positions are purely synthetic bets on price movement.
 * The funding rate mechanism (every 8 hours) balances long/short positions
 * without requiring actual price impact.
 * 
 * @see {@link src/lib/serverless-game-tick.ts} - NPC spot trading affects prices
 * @see {@link src/engine/PerpetualsEngine.ts} - Perpetual position management
 * @see {@link src/shared/perps-types.ts} - Funding rate calculations
 */

import { logger } from '@/lib/logger';

import {
  type TradeImpactInput,
} from './market-impact-service';

/**
 * NO-OP: User perpetual trades do not affect spot prices
 * 
 * Perpetuals are synthetic derivatives. User trades create positions that:
 * - Track the underlying spot price (set by NPC trading)
 * - Are settled via funding rate payments between longs and shorts
 * - Do NOT influence the underlying organization price
 * 
 * This function is intentionally a no-op to maintain the synthetic nature
 * of perpetual contracts in Babylon.
 * 
 * @param _trades - Trade impacts (ignored - perps are synthetic)
 * @returns Promise that resolves immediately
 * 
 * @remarks
 * The funding rate mechanism handles long/short imbalances:
 * - When longs > shorts: positive funding rate (longs pay shorts)
 * - When shorts > longs: negative funding rate (shorts pay longs)
 * This incentivizes counter-positions without affecting spot price.
 */
export async function applyPerpTradeImpacts(
  _trades: TradeImpactInput[]
): Promise<void> {
  // Perpetuals are synthetic - user/agent trades do NOT affect spot price
  // Only NPC spot trading (handled in serverless-game-tick.ts) affects prices
  // Funding rates balance long/short imbalances every 8 hours
  
  logger.debug(
    'applyPerpTradeImpacts called but is no-op (perps are synthetic)',
    undefined,
    'PerpPriceImpact'
  );
  
  return;
}
