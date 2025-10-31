/**
 * @babylonai/plugin-babylon
 *
 * ElizaOS plugin for autonomous AI agents to participate in Babylon prediction markets
 *
 * Features:
 * - Real player interactions: Agents create accounts, manage wallets, place real bets
 * - Automated trading: Market monitoring, portfolio management, risk assessment
 * - Multiple strategies: Momentum, contrarian, volume-based trading
 * - Real-time data: Market prices, wallet balance, position tracking
 *
 * @module @babylonai/plugin-babylon
 */

import type { Plugin } from '@ai16z/eliza';
import { BabylonApiClient } from './api-client';
import { babylonGameActions } from './actions/actions';
import { babylonGameEvaluators } from './evaluators/evaluators';
import { babylonGameProviders } from './providers/providers';
import { BabylonTradingService } from './services/services';
import type { AgentConfig } from './types';

// Export all components
export * from './types';
export * from './api-client';
export * from './agent-auth-service';
export * from './actions/actions';
export * from './evaluators/evaluators';
export * from './providers/providers';
export * from './services/services';
export * from './environment';

/**
 * Babylon Prediction Markets Plugin
 *
 * Enables Eliza agents to participate as real players in prediction markets with:
 * - 3 Actions: BUY_SHARES, SELL_SHARES, CHECK_WALLET
 * - 2 Evaluators: MARKET_ANALYSIS, PORTFOLIO_MANAGEMENT
 * - 3 Providers: Market data, wallet status, position summary
 * - 1 Service: Automated trading and portfolio monitoring
 *
 * @example
 * ```typescript
 * import { predictionMarketsPlugin } from '@babylonai/plugin-babylon';
 *
 * const runtime = new AgentRuntime({
 *   character,
 *   plugins: [predictionMarketsPlugin],
 *   // ...
 * });
 * ```
 */
export const predictionMarketsPlugin: Plugin = {
  name: 'babylon',
  description: 'Participate in Babylon prediction markets with autonomous trading, portfolio management, and risk assessment',
  actions: babylonGameActions,
  evaluators: babylonGameEvaluators,
  providers: babylonGameProviders,
  services: [BabylonTradingService as any],
};

/**
 * Legacy export for backward compatibility
 * @deprecated Use predictionMarketsPlugin instead
 */
export const babylonGamePlugin = predictionMarketsPlugin;

/**
 * Create Babylon API Client
 *
 * Factory function to create an authenticated API client instance.
 * The client should be registered in runtime.clients for use by actions and providers.
 *
 * @param config - Agent configuration including API URL, auth, and trading limits
 * @returns Configured BabylonApiClient instance
 *
 * @example
 * ```typescript
 * const client = createBabylonClient({
 *   characterId: 'alice',
 *   apiBaseUrl: 'http://localhost:3000',
 *   tradingLimits: {
 *     maxTradeSize: 100,
 *     maxPositionSize: 500,
 *     minConfidence: 0.6
 *   }
 * });
 * runtime.clients.babylonClient = client;
 * ```
 */
export function createBabylonClient(config: AgentConfig): BabylonApiClient {
  return new BabylonApiClient(config);
}

// Default export
export default predictionMarketsPlugin;
